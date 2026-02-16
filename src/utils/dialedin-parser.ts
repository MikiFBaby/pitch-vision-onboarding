import * as XLSX from 'xlsx';
import type {
  ReportType,
  AgentSummaryRow,
  AgentSummarySubcampaignRow,
  AgentAnalysisRow,
  AgentPauseTimeRow,
  CallsPerHourRow,
  CampaignCallLogRow,
  CampaignSummaryRow,
  SubcampaignRow,
  ProductionRow,
  ProductionSubcampaignRow,
  ShiftReportRow,
  ParsedReportData,
} from '@/types/dialedin-types';
import { REPORT_TYPE_CONFIG, PRODUCTION_NON_DISPOSITION_COLUMNS } from '@/types/dialedin-types';

// ═══════════════════════════════════════════════════════════
// Report Type Detection
// ═══════════════════════════════════════════════════════════

export function identifyReportType(filename: string): ReportType | null {
  for (const [rtype, config] of Object.entries(REPORT_TYPE_CONFIG)) {
    if (config.pattern.test(filename)) {
      return rtype as ReportType;
    }
  }
  return null;
}

export function extractDateRange(filename: string): { start: string | null; end: string | null } {
  const match = filename.match(/(\d{2}-\d{2}-\d{4})_(\d{2}-\d{2}-\d{4})/);
  if (match) {
    return { start: match[1], end: match[2] };
  }
  return { start: null, end: null };
}

/** Convert MM-DD-YYYY to YYYY-MM-DD for database storage */
export function toISODate(mmddyyyy: string): string {
  const [mm, dd, yyyy] = mmddyyyy.split('-');
  return `${yyyy}-${mm}-${dd}`;
}

// ═══════════════════════════════════════════════════════════
// Value Parsers
// ═══════════════════════════════════════════════════════════

/** Parse HH:MM:SS or HHH:MM:SS to total minutes */
function parseTimeToMinutes(val: unknown): number {
  if (typeof val !== 'string' || !val.includes(':')) return 0;
  const parts = val.split(':');
  if (parts.length === 3) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) + parseInt(parts[2], 10) / 60;
  }
  return 0;
}

/** Parse percentage string (e.g. "45.2%") to float */
function parsePct(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const cleaned = val.replace('%', '').replace(',', '').trim();
    return parseFloat(cleaned) || 0;
  }
  return 0;
}

/** Safely parse a numeric value */
function toNum(val: unknown): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (typeof val === 'string') {
    const cleaned = val.replace(',', '').trim();
    return parseFloat(cleaned) || 0;
  }
  return 0;
}

// ═══════════════════════════════════════════════════════════
// Sheet Parsing — Main entry point
// ═══════════════════════════════════════════════════════════

/**
 * Parse XLS/XLSX buffer into structured report data.
 * DialedIn exports use a "Report" sheet name with the first row as headers.
 */
export function parseXLSBuffer(buffer: Buffer, filename: string): ParsedReportData {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  // DialedIn uses "Report" as the sheet name
  const sheetName = workbook.SheetNames.includes('Report')
    ? 'Report'
    : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const reportType = identifyReportType(filename);
  const { start, end } = extractDateRange(filename);

  const dateLabel = start && end
    ? `${start} to ${end}`
    : new Date().toISOString().split('T')[0];

  const result: ParsedReportData = {
    reportType: reportType || 'AgentSummaryCampaign',
    dateLabel,
    dateRangeStart: start ? toISODate(start) : null,
    dateRangeEnd: end ? toISODate(end) : null,
    filename,
  };

  switch (reportType) {
    case 'AgentSummary':
      result.agentSummary = parseAgentSummaryBaseRows(rows);
      break;
    case 'AgentSummaryCampaign':
      result.agentSummary = parseAgentSummaryCampaignRows(rows);
      break;
    case 'AgentSummarySubcampaign':
      result.agentSummarySubcampaign = parseAgentSummarySubcampaignRows(rows);
      break;
    case 'AgentAnalysis':
      result.agentAnalysis = parseAgentAnalysisRows(rows);
      break;
    case 'AgentPauseTime':
      result.agentPauseTime = parseAgentPauseTimeRows(rows);
      break;
    case 'CallsPerHour':
      result.callsPerHour = parseCallsPerHourRows(rows);
      break;
    case 'CampaignCallLog':
      result.campaignCallLog = parseCampaignCallLogRows(rows);
      break;
    case 'CampaignSummary':
      result.campaignSummary = parseCampaignSummaryRows(rows);
      break;
    case 'ProductionReport':
      result.production = parseProductionRows(rows);
      break;
    case 'ProductionReportSubcampaign':
      result.productionSubcampaign = parseProductionSubcampaignRows(rows);
      break;
    case 'ShiftReport':
      result.shiftReport = parseShiftReportRows(rows);
      break;
    case 'SubcampaignSummary':
      result.subcampaign = parseSubcampaignRows(rows);
      break;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════
// AgentSummary (base) — all agents with Team column
// Headers: Rep, Team, Dialed, Connects, ..., Logged In Time
// ═══════════════════════════════════════════════════════════

function parseAgentSummaryBaseRows(rows: Record<string, unknown>[]): AgentSummaryRow[] {
  return rows
    .filter((r) => r['Rep'] && String(r['Rep']).trim() !== 'Total:')
    .map((r) => ({
      rep: String(r['Rep']).trim(),
      team: String(r['Team'] || '').trim() || undefined,
      dialed: toNum(r['Dialed']),
      connects: toNum(r['Connects']),
      contacts: toNum(r['Contacts']),
      hours_worked: toNum(r['Hours Worked']),
      transfers: toNum(r['Sale/Lead/App']),
      connects_per_hour: toNum(r['Connects per Hour']),
      sla_hr: toNum(r['S-L-A/HR']),
      conversion_rate_pct: parsePct(r['Conversion Rate']),
      talk_time_min: parseTimeToMinutes(r['Talk Time']),
      avg_talk_time_min: parseTimeToMinutes(r['Avg Talk Time']),
      wait_time_min: parseTimeToMinutes(r['Wait Time']),
      avg_wait_time_min: parseTimeToMinutes(r['Avg Wait Time']),
      wrap_time_min: parseTimeToMinutes(r['Wrap Up Time']),
      avg_wrap_time_min: parseTimeToMinutes(r['Avg Wrap Up Time']),
      logged_in_time_min: parseTimeToMinutes(r['Logged In Time']),
    }));
}

// ═══════════════════════════════════════════════════════════
// AgentSummaryCampaign — active agents only, no Team column
// Headers: Rep, Dialed, Connects, ..., Logged In Time
// ═══════════════════════════════════════════════════════════

function parseAgentSummaryCampaignRows(rows: Record<string, unknown>[]): AgentSummaryRow[] {
  return rows
    .filter((r) => r['Rep'] && String(r['Rep']).trim() !== 'Total:')
    .map((r) => ({
      rep: String(r['Rep']).trim(),
      dialed: toNum(r['Dialed']),
      connects: toNum(r['Connects']),
      contacts: toNum(r['Contacts']),
      hours_worked: toNum(r['Hours Worked']),
      transfers: toNum(r['Sale/Lead/App']),
      connects_per_hour: toNum(r['Connects per Hour']),
      sla_hr: toNum(r['S-L-A/HR']),
      conversion_rate_pct: parsePct(r['Conversion Rate']),
      talk_time_min: parseTimeToMinutes(r['Talk Time']),
      avg_talk_time_min: parseTimeToMinutes(r['Avg Talk Time']),
      wait_time_min: parseTimeToMinutes(r['Wait Time']),
      avg_wait_time_min: parseTimeToMinutes(r['Avg Wait Time']),
      wrap_time_min: parseTimeToMinutes(r['Wrap Up Time']),
      avg_wrap_time_min: parseTimeToMinutes(r['Avg Wrap Up Time']),
      logged_in_time_min: parseTimeToMinutes(r['Logged In Time']),
    }));
}

// ═══════════════════════════════════════════════════════════
// AgentSummarySubcampaign — per-agent per-campaign breakdown
// Headers: Campaign, Subcampaign, Rep, Dialed, ..., Logged In Time
// ═══════════════════════════════════════════════════════════

function parseAgentSummarySubcampaignRows(rows: Record<string, unknown>[]): AgentSummarySubcampaignRow[] {
  return rows
    .filter((r) => r['Rep'] && String(r['Rep']).trim() !== 'Total:')
    .map((r) => ({
      campaign: String(r['Campaign'] || '').trim(),
      subcampaign: String(r['Subcampaign'] || '').trim(),
      rep: String(r['Rep']).trim(),
      dialed: toNum(r['Dialed']),
      connects: toNum(r['Connects']),
      contacts: toNum(r['Contacts']),
      hours_worked: toNum(r['Hours Worked']),
      transfers: toNum(r['Sale/Lead/App']),
      connects_per_hour: toNum(r['Connects per Hour']),
      sla_hr: toNum(r['S-L-A/HR']),
      conversion_rate_pct: parsePct(r['Conversion Rate']),
      talk_time_min: parseTimeToMinutes(r['Talk Time']),
      avg_talk_time_min: parseTimeToMinutes(r['Avg Talk Time']),
      wait_time_min: parseTimeToMinutes(r['Wait Time']),
      avg_wait_time_min: parseTimeToMinutes(r['Avg Wait Time']),
      wrap_time_min: parseTimeToMinutes(r['Wrap Up Time']),
      avg_wrap_time_min: parseTimeToMinutes(r['Avg Wrap Up Time']),
      logged_in_time_min: parseTimeToMinutes(r['Logged In Time']),
    }));
}

// ═══════════════════════════════════════════════════════════
// AgentAnalysis — per-agent per-campaign with Date
// Headers: Date, Rep, Campaign, Hours Worked, ..., Logged In Time
// ═══════════════════════════════════════════════════════════

function parseAgentAnalysisRows(rows: Record<string, unknown>[]): AgentAnalysisRow[] {
  return rows
    .filter((r) => r['Rep'] && String(r['Rep']).trim() !== 'Total:')
    .map((r) => ({
      date: String(r['Date'] || '').trim(),
      rep: String(r['Rep']).trim(),
      campaign: String(r['Campaign'] || '').trim(),
      hours_worked: toNum(r['Hours Worked']),
      contacts: toNum(r['Contacts']),
      connects: toNum(r['Connects']),
      connects_per_hour: toNum(r['Connects per Hour']),
      conversion_rate_pct: parsePct(r['Conversion Rate']),
      conversion_factor: toNum(r['Conversion Factor']),
      transfers: toNum(r['Sale/Lead/App']),
      sla_hr: toNum(r['S-L-A/HR']),
      call_backs: toNum(r['Call Backs']),
      avg_talk_time_min: parseTimeToMinutes(r['Avg Talk Time']),
      avg_wait_time_min: parseTimeToMinutes(r['Avg Wait Time']),
      time_avail_min: parseTimeToMinutes(r['Time Avail']),
      time_paused_min: parseTimeToMinutes(r['Time Paused']),
      talk_time_min: parseTimeToMinutes(r['Talk Time']),
      wrap_time_min: parseTimeToMinutes(r['Wrap Up Time']),
      logged_in_time_min: parseTimeToMinutes(r['Logged In Time']),
    }));
}

// ═══════════════════════════════════════════════════════════
// AgentPauseTime — pause/break session tracking
// Headers: Rep, Campaign, Session Login Time, ..., Session ManHours
// ═══════════════════════════════════════════════════════════

function parseAgentPauseTimeRows(rows: Record<string, unknown>[]): AgentPauseTimeRow[] {
  return rows
    .filter((r) => {
      const rep = String(r['Rep'] || '').trim();
      return rep !== '' && !rep.startsWith('Total');
    })
    .map((r) => ({
      rep: String(r['Rep']).trim(),
      campaign: String(r['Campaign'] || '').trim(),
      session_login_time: String(r['Session Login Time'] || '').trim(),
      session_logout_time: String(r['Session Logout Time'] || '').trim(),
      pause_time: String(r['Pause Time'] || '').trim(),
      break_code: String(r['Break Code'] || '').trim(),
      unpause_time: String(r['UnPause Time'] || '').trim(),
      time_paused: String(r['Time Paused'] || '').trim(),
      session_man_hours: toNum(r['Session ManHours']),
    }));
}

// ═══════════════════════════════════════════════════════════
// CallsPerHour — hourly volume distribution
// Headers: Hour, Total Calls, Connects, ..., Contact%
// ═══════════════════════════════════════════════════════════

function parseCallsPerHourRows(rows: Record<string, unknown>[]): CallsPerHourRow[] {
  return rows
    .filter((r) => {
      const hour = String(r['Hour'] || '').trim();
      return hour !== '' && !hour.startsWith('Total');
    })
    .map((r) => ({
      hour: String(r['Hour']).trim(),
      total_calls: toNum(r['Total Calls']),
      connects: toNum(r['Connects']),
      contacts: toNum(r['Contacts']),
      transfers: toNum(r['Sale/Lead/App']),
      conversion_rate_pct: parsePct(r['Conversion Rate']),
      inbound: toNum(r['Inbound']),
      inbound_pct: parsePct(r['Inbound%']),
      abandoned_calls: toNum(r['Abandoned Calls']),
      abandon_rate_pct: parsePct(r['Abandon Rate']),
      outbound: toNum(r['Outbound']),
      outbound_pct: parsePct(r['Outbound%']),
      dropped: toNum(r['Dropped']),
      drop_rate_pct: parsePct(r['Drop Rate']),
      talk_time_min: parseTimeToMinutes(r['Talk Time']),
      avg_hold_time_min: parseTimeToMinutes(r['Avg Hold Time']),
      avg_wait_time_min: parseTimeToMinutes(r['Avg Wait Time']),
      contact_pct: parsePct(r['Contact%']),
    }));
}

// ═══════════════════════════════════════════════════════════
// CampaignCallLog — summary call status counts
// Headers: Call Status, Description, Calls, Percent
// ═══════════════════════════════════════════════════════════

function parseCampaignCallLogRows(rows: Record<string, unknown>[]): CampaignCallLogRow[] {
  return rows
    .filter((r) => {
      const status = String(r['Call Status'] || '').trim();
      return status !== '' && !status.startsWith('Total');
    })
    .map((r) => ({
      call_status: String(r['Call Status']).trim(),
      description: String(r['Description'] || '').trim(),
      calls: toNum(r['Calls']),
      percent: parsePct(r['Percent']),
    }));
}

// ═══════════════════════════════════════════════════════════
// CampaignSummary — rich campaign-level metrics
// Headers: Period, Campaign, Campaign Type, ..., Avg Wait Time
// ═══════════════════════════════════════════════════════════

function parseCampaignSummaryRows(rows: Record<string, unknown>[]): CampaignSummaryRow[] {
  return rows
    .filter((r) => r['Period'] && String(r['Period']).trim() !== 'Total:')
    .map((r) => ({
      period: String(r['Period']).trim(),
      campaign: String(r['Campaign'] || '').trim(),
      campaign_type: String(r['Campaign Type'] || '').trim(),
      lines_per_agent: toNum(r['Lines per Agent']),
      total_leads: toNum(r['Total Leads']),
      available: toNum(r['Available']),
      dialed: toNum(r['Dialed']),
      dials_per_hr: toNum(r['Dials per Hr']),
      avg_attempts: toNum(r['Avg Attempts']),
      reps: toNum(r['Reps']),
      man_hours: toNum(r['Man Hours']),
      logged_in_time_min: parseTimeToMinutes(r['Logged In Time']),
      connects: toNum(r['Connects']),
      connect_pct: parsePct(r['Connect %']),
      contacts: toNum(r['Contacts']),
      contact_pct: parsePct(r['Contact%']),
      hangups: toNum(r['Hangups']),
      connects_per_hour: toNum(r['Connects per Hour']),
      conversion_rate_pct: parsePct(r['Conversion Rate']),
      conversion_factor: toNum(r['Conversion Factor']),
      transfers: toNum(r['Sale/Lead/App']),
      sla_hr: toNum(r['S-L-A/HR']),
      noans_rate_pct: parsePct(r['NoAns Rate']),
      norb_rate_pct: parsePct(r['Norb Rate']),
      drop_rate_pct: parsePct(r['Drop Rate']),
      avg_wait_time_min: parseTimeToMinutes(r['Avg Wait Time']),
    }));
}

// ═══════════════════════════════════════════════════════════
// SubcampaignSummary — COLUMN SHIFT FIX
// Extra "S-L-A Rate Value" column at position 0 shifts all headers by 1.
// We read by the shifted header names to get correct data.
// ═══════════════════════════════════════════════════════════

function parseSubcampaignRows(rows: Record<string, unknown>[]): SubcampaignRow[] {
  return rows
    .filter((r) => {
      // Skip grand total row (shifted: r['Period'] contains campaign name, "Total:" = grand total)
      const campaign = String(r['Period'] || '').trim();
      // Keep only subcampaign-level rows (r['Campaign'] = shifted subcampaign name, non-empty)
      const subcampaign = String(r['Campaign'] || '').trim();
      return campaign !== '' && campaign !== 'Total:' && subcampaign !== '';
    })
    .map((r) => ({
      // SHIFTED column mapping — extra "S-L-A Rate Value" at position 0
      period: String(r['S-L-A Rate Value'] || '').trim(),
      campaign: String(r['Period'] || '').trim(),
      subcampaign: String(r['Campaign'] || '').trim(),
      total_leads: toNum(r['Subcampaign']),
      dialed: toNum(r['Total Leads']),
      connects: toNum(r['Man Hours']),
      contacts: toNum(r['Connects']),
      transfers: toNum(r['Connects per Hour']),
      man_hours: toNum(r['Avg Attempts']),
      connect_rate_pct: parsePct(r['S-L-A/HR']),
      conversion_rate_pct: parsePct(r['Connect Rate']),
      operator_disconnects: toNum(r['Conversion Factor']),
    }));
}

// ═══════════════════════════════════════════════════════════
// ProductionReport — dynamic disposition columns
// Known columns: Rep, Skill, Man Hours, Logged In Time,
//   Connects, Contacts, Contacts/ManHour, Sale/Lead/App, Sales/ManHour
// Everything else is a disposition column.
// ═══════════════════════════════════════════════════════════

function parseProductionRows(rows: Record<string, unknown>[]): ProductionRow[] {
  // Detect disposition columns from the first row's keys
  const allColumns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const dispositionColumns = allColumns.filter(
    (col) => !PRODUCTION_NON_DISPOSITION_COLUMNS.has(col),
  );

  return rows
    .filter((r) => r['Rep'] && String(r['Rep']).trim() !== 'Total:')
    .map((r) => {
      const dispositions: Record<string, number> = {};
      for (const col of dispositionColumns) {
        const val = toNum(r[col]);
        if (val > 0) {
          dispositions[col] = val;
        }
      }

      return {
        rep: String(r['Rep']).trim(),
        skill: String(r['Skill'] || '').trim(),
        man_hours: toNum(r['Man Hours']),
        logged_in_time_min: parseTimeToMinutes(r['Logged In Time']),
        connects: toNum(r['Connects']),
        contacts: toNum(r['Contacts']),
        transfers: toNum(r['Sale/Lead/App']),
        dispositions,
      };
    });
}

// ═══════════════════════════════════════════════════════════
// ProductionReportSubcampaign — subcampaign-level production
// Headers: Subcampaign, Ans. Machine, Inbound Voicemail,
//   Connects, Contacts, SalesCount
// ═══════════════════════════════════════════════════════════

function parseProductionSubcampaignRows(rows: Record<string, unknown>[]): ProductionSubcampaignRow[] {
  return rows
    .filter((r) => r['Subcampaign'] && String(r['Subcampaign']).trim() !== 'Total:')
    .map((r) => ({
      subcampaign: String(r['Subcampaign']).trim(),
      ans_machine: toNum(r['Ans. Machine']),
      inbound_voicemail: toNum(r['Inbound Voicemail']),
      connects: toNum(r['Connects']),
      contacts: toNum(r['Contacts']),
      sales_count: toNum(r['SalesCount']),
    }));
}

// ═══════════════════════════════════════════════════════════
// ShiftReport — disposition breakdown by campaign and date
// Headers: Date, Campaign, Call Status, Description, Type, Calls, Percent
// ═══════════════════════════════════════════════════════════

function parseShiftReportRows(rows: Record<string, unknown>[]): ShiftReportRow[] {
  return rows
    .filter((r) => r['Date'] && String(r['Date']).trim() !== 'Total:')
    .map((r) => ({
      date: String(r['Date']).trim(),
      campaign: String(r['Campaign'] || '').trim(),
      call_status: String(r['Call Status'] || '').trim(),
      description: String(r['Description'] || '').trim(),
      type: String(r['Type'] || '').trim(),
      calls: toNum(r['Calls']),
      percent: parsePct(r['Percent']),
    }));
}

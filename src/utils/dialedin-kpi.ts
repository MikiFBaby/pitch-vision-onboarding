import type {
  AgentSummaryRow,
  AgentSummarySubcampaignRow,
  AgentAnalysisRow,
  AgentPauseTimeRow,
  CampaignCallLogRow,
  SubcampaignRow,
  ProductionRow,
  ShiftReportRow,
  CampaignSummaryRow,
  CallsPerHourRow,
  ProductionSubcampaignRow,
  DailyKPIs,
  TPHDistribution,
  AgentPerformance,
  SkillSummary,
  Anomaly,
  AnomalyType,
  Severity,
  ParsedReportData,
} from '@/types/dialedin-types';
import { THRESHOLDS, WASTE_DISPOSITIONS } from '@/types/dialedin-types';

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function safeDiv(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

function round(val: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(val * f) / f;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (pos - low);
}

function parseHMS(val: string): number {
  if (!val || !val.includes(':')) return 0;
  const parts = val.split(':');
  if (parts.length === 3) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) + parseInt(parts[2], 10) / 60;
  }
  return 0;
}

function normalizeDispKey(col: string): string {
  return col
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
    .replace(/\//g, '_');
}

// ═══════════════════════════════════════════════════════════
// Daily KPIs (from AgentSummaryCampaign data)
// ═══════════════════════════════════════════════════════════

export function computeDailyKPIs(
  agentSummary: AgentSummaryRow[],
  production: ProductionRow[] | undefined,
  reportDate: string,
): DailyKPIs {
  const totalDials = agentSummary.reduce((s, a) => s + a.dialed, 0);
  const totalConnects = agentSummary.reduce((s, a) => s + a.connects, 0);
  const totalContacts = agentSummary.reduce((s, a) => s + a.contacts, 0);
  const totalTransfers = agentSummary.reduce((s, a) => s + a.transfers, 0);
  const totalHours = agentSummary.reduce((s, a) => s + a.hours_worked, 0);
  const totalTalkMin = agentSummary.reduce((s, a) => s + a.talk_time_min, 0);
  const totalWaitMin = agentSummary.reduce((s, a) => s + a.wait_time_min, 0);
  const totalWrapMin = agentSummary.reduce((s, a) => s + a.wrap_time_min, 0);

  // Disposition aggregation from production data
  const dispositions: Record<string, number> = {};
  let deadAirTotal = 0;
  let hungUpTotal = 0;
  if (production) {
    for (const row of production) {
      for (const [col, val] of Object.entries(row.dispositions)) {
        const key = normalizeDispKey(col);
        dispositions[key] = (dispositions[key] || 0) + val;
      }
    }
    deadAirTotal = dispositions['dead_air'] || 0;
    hungUpTotal = dispositions['hung_up_transfer'] || 0;
  }

  // Waste metrics
  const wasteCount = WASTE_DISPOSITIONS.reduce(
    (s, d) => s + (dispositions[normalizeDispKey(d)] || 0),
    0,
  );
  const transferDisp = dispositions['transfer'] || 0;

  // TPH distribution for qualified agents
  const qualified = agentSummary
    .filter((a) => a.hours_worked >= THRESHOLDS.min_hours_qualified)
    .map((a) => safeDiv(a.transfers, a.hours_worked))
    .sort((a, b) => a - b);

  let distribution: TPHDistribution | null = null;
  if (qualified.length > 0) {
    distribution = {
      count: qualified.length,
      p10: round(quantile(qualified, 0.1), 2),
      p25: round(quantile(qualified, 0.25), 2),
      p50: round(quantile(qualified, 0.5), 2),
      p75: round(quantile(qualified, 0.75), 2),
      p90: round(quantile(qualified, 0.9), 2),
      mean: round(mean(qualified), 2),
      std: round(std(qualified), 2),
    };
  }

  return {
    report_date: reportDate,
    total_agents: agentSummary.length,
    agents_with_transfers: agentSummary.filter((a) => a.transfers > 0).length,
    total_dials: totalDials,
    total_connects: totalConnects,
    total_contacts: totalContacts,
    total_transfers: totalTransfers,
    total_man_hours: round(totalHours, 1),
    total_talk_time_min: round(totalTalkMin, 1),
    total_wait_time_min: round(totalWaitMin, 1),
    total_wrap_time_min: round(totalWrapMin, 1),
    connect_rate: round(safeDiv(totalConnects, totalDials) * 100, 2),
    contact_rate: round(safeDiv(totalContacts, totalConnects) * 100, 2),
    conversion_rate: round(safeDiv(totalTransfers, totalContacts) * 100, 2),
    transfers_per_hour: round(safeDiv(totalTransfers, totalHours), 2),
    dials_per_hour: round(safeDiv(totalDials, totalHours), 1),
    dead_air_ratio: round(safeDiv(deadAirTotal, totalConnects) * 100, 2),
    hung_up_ratio: round(safeDiv(hungUpTotal, totalConnects) * 100, 2),
    waste_rate: round(safeDiv(wasteCount, totalConnects) * 100, 1),
    transfer_success_rate: round(safeDiv(transferDisp, transferDisp + hungUpTotal) * 100, 1),
    prev_day_transfers: null,
    prev_day_tph: null,
    delta_transfers: null,
    delta_tph: null,
    dispositions,
    distribution,
  };
}

// ═══════════════════════════════════════════════════════════
// Agent Performance (from AgentSummaryCampaign + optional ProductionReport)
// ═══════════════════════════════════════════════════════════

export function computeAgentPerformance(
  agentSummary: AgentSummaryRow[],
  production: ProductionRow[] | undefined,
  reportDate: string,
): Omit<AgentPerformance, 'id'>[] {
  // Build production lookup by agent name
  const prodByAgent = new Map<string, ProductionRow[]>();
  if (production) {
    for (const row of production) {
      const key = row.rep.toLowerCase();
      if (!prodByAgent.has(key)) prodByAgent.set(key, []);
      prodByAgent.get(key)!.push(row);
    }
  }

  const agents: Omit<AgentPerformance, 'id'>[] = agentSummary.map((a) => {
    const tph = safeDiv(a.transfers, a.hours_worked);
    const prodRows = prodByAgent.get(a.rep.toLowerCase()) || [];

    // Merge dispositions from production rows
    const dispositions: Record<string, number> = {};
    let deadAir = 0;
    for (const pr of prodRows) {
      for (const [col, val] of Object.entries(pr.dispositions)) {
        const key = normalizeDispKey(col);
        dispositions[key] = (dispositions[key] || 0) + val;
      }
    }
    deadAir = dispositions['dead_air'] || 0;

    // Use primary skill from production data if available
    const skill = prodRows.length > 0 ? prodRows[0].skill : null;

    return {
      report_date: reportDate,
      agent_name: a.rep,
      employee_id: null,
      skill,
      subcampaign: null,
      dials: a.dialed,
      connects: a.connects,
      contacts: a.contacts,
      transfers: a.transfers,
      hours_worked: round(a.hours_worked, 2),
      talk_time_min: round(a.talk_time_min, 2),
      wait_time_min: round(a.wait_time_min, 2),
      wrap_time_min: round(a.wrap_time_min, 2),
      logged_in_time_min: round(a.logged_in_time_min, 2),
      tph: round(tph, 2),
      connects_per_hour: round(a.connects_per_hour, 2),
      connect_rate: round(safeDiv(a.connects, a.dialed) * 100, 2),
      conversion_rate: round(safeDiv(a.transfers, a.contacts) * 100, 2),
      dead_air_ratio: round(safeDiv(deadAir, a.connects) * 100, 2),
      dispositions,
      tph_rank: null,
      conversion_rank: null,
      dials_rank: null,
      raw_data: {},
    };
  });

  // Compute rankings among qualified agents
  const qualified = agents
    .filter((a) => a.hours_worked >= THRESHOLDS.min_hours_qualified)
    .sort((a, b) => b.tph - a.tph);

  qualified.forEach((a, i) => {
    a.tph_rank = i + 1;
  });

  // Conversion ranking
  const convSorted = [...qualified].sort((a, b) => b.conversion_rate - a.conversion_rate);
  convSorted.forEach((a, i) => {
    a.conversion_rank = i + 1;
  });

  // Dials ranking
  const dialsSorted = [...qualified].sort((a, b) => b.dials - a.dials);
  dialsSorted.forEach((a, i) => {
    a.dials_rank = i + 1;
  });

  return agents;
}

// ═══════════════════════════════════════════════════════════
// Skill Summary (from ProductionReport)
// ═══════════════════════════════════════════════════════════

export function computeSkillSummary(
  production: ProductionRow[],
  reportDate: string,
): Omit<SkillSummary, 'id'>[] {
  const skillMap = new Map<string, {
    agents: Set<string>;
    dials: number;
    connects: number;
    contacts: number;
    transfers: number;
    manHours: number;
    dispositions: Record<string, number>;
  }>();

  for (const row of production) {
    const skill = row.skill || 'Unknown';
    if (!skillMap.has(skill)) {
      skillMap.set(skill, {
        agents: new Set(),
        dials: 0,
        connects: 0,
        contacts: 0,
        transfers: 0,
        manHours: 0,
        dispositions: {},
      });
    }
    const s = skillMap.get(skill)!;
    s.agents.add(row.rep);
    s.connects += row.connects;
    s.contacts += row.contacts;
    s.transfers += row.transfers;
    s.manHours += row.man_hours;
    for (const [col, val] of Object.entries(row.dispositions)) {
      const key = normalizeDispKey(col);
      s.dispositions[key] = (s.dispositions[key] || 0) + val;
    }
  }

  return Array.from(skillMap.entries())
    .filter(([skill]) => skill !== 'Unknown' && skill !== '')
    .map(([skill, s]) => ({
      report_date: reportDate,
      skill,
      subcampaign: null,
      agent_count: s.agents.size,
      total_dials: s.dials,
      total_connects: s.connects,
      total_contacts: s.contacts,
      total_transfers: s.transfers,
      total_man_hours: round(s.manHours, 1),
      avg_tph: round(safeDiv(s.transfers, s.manHours), 2),
      connect_rate: round(safeDiv(s.connects, s.dials || 1) * 100, 2),
      conversion_rate: round(safeDiv(s.transfers, s.contacts || 1) * 100, 2),
      dispositions: s.dispositions,
      raw_data: {},
    }))
    .sort((a, b) => b.total_transfers - a.total_transfers);
}

// ═══════════════════════════════════════════════════════════
// Anomaly Detection
// ═══════════════════════════════════════════════════════════

export function detectAnomalies(
  agentSummary: AgentSummaryRow[],
  production: ProductionRow[] | undefined,
  reportDate: string,
): Omit<Anomaly, 'id' | 'created_at'>[] {
  const anomalies: Omit<Anomaly, 'id' | 'created_at'>[] = [];

  // 1. Zero transfers with significant hours
  const zeroTransfers = agentSummary.filter(
    (a) =>
      a.hours_worked >= THRESHOLDS.zero_transfer_min_hours &&
      a.transfers === 0 &&
      !/\b(QA|HR)\b/i.test(a.rep),
  );
  for (const a of zeroTransfers) {
    anomalies.push({
      report_date: reportDate,
      anomaly_type: 'zero_transfers',
      severity: 'warning',
      agent_name: a.rep,
      skill: null,
      metric_name: 'hours_worked',
      metric_value: a.hours_worked,
      threshold_value: THRESHOLDS.zero_transfer_min_hours,
      details: { dials: a.dialed, contacts: a.contacts },
    });
  }

  // 2. High dead air (from production data)
  if (production) {
    const prodWithDeadAir = production
      .filter((p) => p.connects >= THRESHOLDS.min_connects_anomaly)
      .map((p) => ({
        ...p,
        dead_air_ratio: safeDiv(p.dispositions['Dead Air'] || 0, p.connects) * 100,
      }))
      .filter((p) => p.dead_air_ratio >= THRESHOLDS.dead_air_ratio_warning)
      .sort((a, b) => b.dead_air_ratio - a.dead_air_ratio)
      .slice(0, 10);

    for (const p of prodWithDeadAir) {
      const severity: Severity =
        p.dead_air_ratio >= THRESHOLDS.dead_air_ratio_critical ? 'critical' : 'warning';
      anomalies.push({
        report_date: reportDate,
        anomaly_type: 'high_dead_air',
        severity,
        agent_name: p.rep,
        skill: p.skill,
        metric_name: 'dead_air_ratio',
        metric_value: round(p.dead_air_ratio, 1),
        threshold_value: THRESHOLDS.dead_air_ratio_warning,
        details: { dead_air_count: p.dispositions['Dead Air'] || 0, connects: p.connects },
      });
    }

    // 3. High hung up transfer ratio
    const prodWithHungUp = production
      .filter((p) => p.connects >= THRESHOLDS.min_connects_anomaly && (p.dispositions['Hung Up Transfer'] || 0) > 0)
      .map((p) => ({
        ...p,
        hung_ratio: safeDiv(p.dispositions['Hung Up Transfer'] || 0, p.connects) * 100,
      }))
      .filter((p) => p.hung_ratio >= THRESHOLDS.hung_up_ratio_warning)
      .sort((a, b) => b.hung_ratio - a.hung_ratio)
      .slice(0, 10);

    for (const p of prodWithHungUp) {
      const severity: Severity =
        p.hung_ratio >= THRESHOLDS.hung_up_ratio_critical ? 'critical' : 'warning';
      anomalies.push({
        report_date: reportDate,
        anomaly_type: 'high_hung_up',
        severity,
        agent_name: p.rep,
        skill: p.skill,
        metric_name: 'hung_up_ratio',
        metric_value: round(p.hung_ratio, 1),
        threshold_value: THRESHOLDS.hung_up_ratio_warning,
        details: {
          hung_up_count: p.dispositions['Hung Up Transfer'] || 0,
          connects: p.connects,
        },
      });
    }
  }

  // 4. Statistical outlier TPH (z-score based)
  const qualifiedTPH = agentSummary
    .filter((a) => a.hours_worked >= THRESHOLDS.min_hours_coaching)
    .map((a) => ({ rep: a.rep, tph: safeDiv(a.transfers, a.hours_worked), hours: a.hours_worked }));

  if (qualifiedTPH.length > 5) {
    const tphValues = qualifiedTPH.map((a) => a.tph);
    const m = mean(tphValues);
    const s = std(tphValues);
    if (s > 0) {
      for (const a of qualifiedTPH) {
        const zScore = (a.tph - m) / s;
        if (zScore < -2) {
          anomalies.push({
            report_date: reportDate,
            anomaly_type: 'low_tph',
            severity: zScore < -3 ? 'critical' : 'warning',
            agent_name: a.rep,
            skill: null,
            metric_name: 'tph',
            metric_value: round(a.tph, 2),
            threshold_value: round(m - 2 * s, 2),
            details: { z_score: round(zScore, 2), mean_tph: round(m, 2), hours: a.hours },
          });
        }
      }
    }
  }

  return anomalies;
}

// ═══════════════════════════════════════════════════════════
// Full ETL Processor
// ═══════════════════════════════════════════════════════════

export interface ETLResult {
  dailyKPIs: DailyKPIs;
  agentPerformance: Omit<AgentPerformance, 'id'>[];
  skillSummary: Omit<SkillSummary, 'id'>[];
  anomalies: Omit<Anomaly, 'id' | 'created_at'>[];
  rawData: Record<string, unknown>;
}

/**
 * Process all parsed report data for a single day into computed analytics.
 * Prefers AgentSummary (all agents, with Team) over AgentSummaryCampaign (active only).
 * Always merges ShiftReport dispositions alongside production dispositions.
 * Builds campaign-level aggregates from CampaignSummary.
 * Stores enrichment data (campaigns, hourly, subcampaign detail) in rawData.
 */
export function processDay(
  reports: ParsedReportData[],
  reportDate: string,
): ETLResult {
  // Collect ALL data across all 12 report types
  let agentSummaryBase: AgentSummaryRow[] = [];    // AgentSummary (all agents + Team)
  let agentSummaryCampaign: AgentSummaryRow[] = []; // AgentSummaryCampaign (active only)
  let production: ProductionRow[] = [];
  let subcampaign: SubcampaignRow[] = [];
  let shiftReport: ShiftReportRow[] = [];
  let campaignSummary: CampaignSummaryRow[] = [];
  let callsPerHour: CallsPerHourRow[] = [];
  let productionSubcampaign: ProductionSubcampaignRow[] = [];
  let agentSummarySubcampaign: AgentSummarySubcampaignRow[] = [];
  let agentAnalysis: AgentAnalysisRow[] = [];
  let agentPauseTime: AgentPauseTimeRow[] = [];
  let campaignCallLog: CampaignCallLogRow[] = [];

  for (const r of reports) {
    // Differentiate agent data by report type
    if (r.reportType === 'AgentSummary' && r.agentSummary) {
      agentSummaryBase = agentSummaryBase.concat(r.agentSummary);
    } else if (r.agentSummary) {
      agentSummaryCampaign = agentSummaryCampaign.concat(r.agentSummary);
    }
    if (r.production) production = production.concat(r.production);
    if (r.subcampaign) subcampaign = subcampaign.concat(r.subcampaign);
    if (r.shiftReport) shiftReport = shiftReport.concat(r.shiftReport);
    if (r.campaignSummary) campaignSummary = campaignSummary.concat(r.campaignSummary);
    if (r.callsPerHour) callsPerHour = callsPerHour.concat(r.callsPerHour);
    if (r.productionSubcampaign) productionSubcampaign = productionSubcampaign.concat(r.productionSubcampaign);
    if (r.agentSummarySubcampaign) agentSummarySubcampaign = agentSummarySubcampaign.concat(r.agentSummarySubcampaign);
    if (r.agentAnalysis) agentAnalysis = agentAnalysis.concat(r.agentAnalysis);
    if (r.agentPauseTime) agentPauseTime = agentPauseTime.concat(r.agentPauseTime);
    if (r.campaignCallLog) campaignCallLog = campaignCallLog.concat(r.campaignCallLog);
  }

  // Prefer AgentSummary (all agents, including idle) over AgentSummaryCampaign (active only)
  const agentSummary = agentSummaryBase.length > 0 ? agentSummaryBase : agentSummaryCampaign;

  if (agentSummary.length === 0 && production.length === 0 && subcampaign.length === 0 && campaignSummary.length === 0) {
    throw new Error('No parseable report data found');
  }

  let dailyKPIs: DailyKPIs;
  let agentPerformance: Omit<AgentPerformance, 'id'>[] = [];
  let anomalies: Omit<Anomaly, 'id' | 'created_at'>[] = [];

  if (agentSummary.length > 0) {
    dailyKPIs = computeDailyKPIs(
      agentSummary,
      production.length > 0 ? production : undefined,
      reportDate,
    );
    agentPerformance = computeAgentPerformance(
      agentSummary,
      production.length > 0 ? production : undefined,
      reportDate,
    );
    anomalies = detectAnomalies(
      agentSummary,
      production.length > 0 ? production : undefined,
      reportDate,
    );

    // Always merge ShiftReport dispositions alongside production dispositions
    if (shiftReport.length > 0) {
      const shiftDispositions = buildShiftReportDispositions(shiftReport);
      // Merge: ShiftReport fills in disposition keys that production doesn't have
      for (const [key, val] of Object.entries(shiftDispositions)) {
        if (!(key in dailyKPIs.dispositions)) {
          dailyKPIs.dispositions[key] = val;
        }
      }
      // Recalculate waste/dead-air/hung-up from merged dispositions
      const disps = dailyKPIs.dispositions;
      const deadAirTotal = disps['dead_air'] || 0;
      const hungUpTotal = disps['hung_up_transfer'] || 0;
      const wasteCount = WASTE_DISPOSITIONS.reduce(
        (s, d) => s + (disps[normalizeDispKey(d)] || 0),
        0,
      );
      const transferDisp = disps['transfer'] || 0;
      if (dailyKPIs.total_connects > 0) {
        dailyKPIs.dead_air_ratio = round(safeDiv(deadAirTotal, dailyKPIs.total_connects) * 100, 2);
        dailyKPIs.hung_up_ratio = round(safeDiv(hungUpTotal, dailyKPIs.total_connects) * 100, 2);
        dailyKPIs.waste_rate = round(safeDiv(wasteCount, dailyKPIs.total_connects) * 100, 1);
        dailyKPIs.transfer_success_rate = round(safeDiv(transferDisp, transferDisp + hungUpTotal) * 100, 1);
      }
    }
  } else {
    // Build aggregate KPIs from SubcampaignSummary
    const totalDials = subcampaign.reduce((s, r) => s + r.dialed, 0);
    const totalConnects = subcampaign.reduce((s, r) => s + r.connects, 0);
    const totalContacts = subcampaign.reduce((s, r) => s + r.contacts, 0);
    const totalTransfers = subcampaign.reduce((s, r) => s + r.transfers, 0);
    const totalHours = subcampaign.reduce((s, r) => s + r.man_hours, 0);

    dailyKPIs = {
      report_date: reportDate,
      total_agents: 0,
      agents_with_transfers: 0,
      total_dials: totalDials,
      total_connects: totalConnects,
      total_contacts: totalContacts,
      total_transfers: totalTransfers,
      total_man_hours: round(totalHours, 1),
      total_talk_time_min: 0,
      total_wait_time_min: 0,
      total_wrap_time_min: 0,
      connect_rate: round(safeDiv(totalConnects, totalDials) * 100, 2),
      contact_rate: round(safeDiv(totalContacts, totalConnects) * 100, 2),
      conversion_rate: round(safeDiv(totalTransfers, totalContacts) * 100, 2),
      transfers_per_hour: round(safeDiv(totalTransfers, totalHours), 2),
      dials_per_hour: round(safeDiv(totalDials, totalHours), 1),
      dead_air_ratio: 0,
      hung_up_ratio: 0,
      waste_rate: 0,
      transfer_success_rate: 0,
      prev_day_transfers: null,
      prev_day_tph: null,
      delta_transfers: null,
      delta_tph: null,
      dispositions: {},
      distribution: null,
    };
  }

  const skillSummary = production.length > 0
    ? computeSkillSummary(production, reportDate)
    : [];

  // ═══════════════════════════════════════════════════════════
  // Build comprehensive raw_data from ALL 12 report types
  // This is the compressed analytical output of the full ETL pipeline
  // ═══════════════════════════════════════════════════════════
  const rawData: Record<string, unknown> = {};

  // ── Top / Bottom Agent Rankings (like Python script) ──────
  if (agentPerformance.length > 0) {
    const qualifiedAgents = agentPerformance
      .filter((a) => a.hours_worked >= THRESHOLDS.min_hours_qualified)
      .sort((a, b) => b.tph - a.tph);

    rawData.top_agents = qualifiedAgents.slice(0, 15).map((a) => ({
      name: a.agent_name,
      tph: a.tph,
      transfers: a.transfers,
      hours: a.hours_worked,
      skill: a.skill,
      connects: a.connects,
      conversion_rate: a.conversion_rate,
    }));

    const coaching = agentPerformance
      .filter((a) => a.hours_worked >= THRESHOLDS.min_hours_coaching && !/\b(QA|HR)\b/i.test(a.agent_name))
      .sort((a, b) => a.tph - b.tph);

    rawData.bottom_agents = coaching.slice(0, 15).map((a) => ({
      name: a.agent_name,
      tph: a.tph,
      transfers: a.transfers,
      hours: a.hours_worked,
      skill: a.skill,
      connects: a.connects,
      conversion_rate: a.conversion_rate,
    }));
  }

  // ── Campaign-level aggregates from CampaignSummary ────────
  if (campaignSummary.length > 0) {
    const totalSystemConnects = campaignSummary.reduce((s, c) => s + c.connects, 0);
    const totalSystemDials = campaignSummary.reduce((s, c) => s + (c.dialed || 0), 0);
    const totalHangups = campaignSummary.reduce((s, c) => s + (c.hangups || 0), 0);
    const totalLeads = campaignSummary.reduce((s, c) => s + (c.total_leads || 0), 0);
    const totalTransfersCamp = campaignSummary.reduce((s, c) => s + (c.transfers || 0), 0);
    const totalManHoursCamp = campaignSummary.reduce((s, c) => s + (c.man_hours || 0), 0);

    rawData.campaign_aggregate = {
      total_campaigns: campaignSummary.length,
      total_system_connects: totalSystemConnects,
      total_system_dials: totalSystemDials,
      total_hangups: totalHangups,
      total_leads: totalLeads,
      total_transfers: totalTransfersCamp,
      total_man_hours: round(totalManHoursCamp, 1),
      avg_drop_rate: round(mean(campaignSummary.map((c) => c.drop_rate_pct || 0)), 2),
      avg_connect_rate: round(mean(campaignSummary.filter((c) => c.dialed > 0).map((c) => c.connect_pct || 0)), 2),
      avg_noans_rate: round(mean(campaignSummary.map((c) => c.noans_rate_pct || 0)), 2),
      avg_norb_rate: round(mean(campaignSummary.map((c) => c.norb_rate_pct || 0)), 2),
    };

    // Full campaign list sorted by connects (enriched with all CampaignSummary fields)
    rawData.campaigns = campaignSummary
      .filter((c) => c.connects > 0)
      .sort((a, b) => b.connects - a.connects)
      .map((c) => ({
        campaign: c.campaign,
        campaign_type: c.campaign_type,
        reps: c.reps,
        man_hours: c.man_hours,
        dialed: c.dialed,
        dials_per_hr: c.dials_per_hr,
        total_leads: c.total_leads,
        available: c.available,
        connects: c.connects,
        contacts: c.contacts,
        transfers: c.transfers,
        hangups: c.hangups,
        connect_pct: c.connect_pct,
        contact_pct: c.contact_pct,
        conversion_rate_pct: c.conversion_rate_pct,
        drop_rate_pct: c.drop_rate_pct,
        noans_rate_pct: c.noans_rate_pct,
        norb_rate_pct: c.norb_rate_pct,
        avg_wait_time_min: c.avg_wait_time_min,
        lines_per_agent: c.lines_per_agent,
      }));
  }

  // ── Hourly call distribution from CallsPerHour ────────────
  if (callsPerHour.length > 0) {
    rawData.hourly = callsPerHour
      .filter((h) => h.hour !== 'TOTAL' && h.total_calls > 0)
      .map((h) => ({
        hour: h.hour,
        total_calls: h.total_calls,
        connects: h.connects,
        contacts: h.contacts,
        transfers: h.transfers,
        conversion_rate_pct: h.conversion_rate_pct,
        inbound: h.inbound,
        outbound: h.outbound,
        abandoned: h.abandoned_calls,
        abandon_rate_pct: h.abandon_rate_pct,
        dropped: h.dropped,
        drop_rate_pct: h.drop_rate_pct,
        avg_wait_time_min: h.avg_wait_time_min,
        contact_pct: h.contact_pct,
      }));
  }

  // ── Subcampaign detail from SubcampaignSummary ────────────
  if (subcampaign.length > 0) {
    rawData.subcampaigns = subcampaign
      .filter((s) => s.connects > 0)
      .sort((a, b) => b.connects - a.connects)
      .slice(0, 30)
      .map((s) => ({
        campaign: s.campaign,
        subcampaign: s.subcampaign,
        dialed: s.dialed,
        connects: s.connects,
        contacts: s.contacts,
        transfers: s.transfers,
        man_hours: s.man_hours,
        connect_rate_pct: s.connect_rate_pct,
        conversion_rate_pct: s.conversion_rate_pct,
        operator_disconnects: s.operator_disconnects,
      }));
  }

  // ── System-wide dispositions from ShiftReport ─────────────
  if (shiftReport.length > 0) {
    const shiftDisps = buildShiftReportDispositions(shiftReport);
    const shiftTotal = Object.values(shiftDisps).reduce((s, v) => s + v, 0);
    rawData.system_dispositions = Object.entries(shiftDisps)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([key, value]) => ({
        status: key,
        calls: value,
        percent: round(safeDiv(value, shiftTotal) * 100, 1),
      }));

    // Per-campaign disposition breakdown (top 10 campaigns by total calls)
    const campDisps = new Map<string, { total: number; statuses: Record<string, number> }>();
    for (const row of shiftReport) {
      if (!row.campaign || row.calls <= 0) continue;
      if (!campDisps.has(row.campaign)) {
        campDisps.set(row.campaign, { total: 0, statuses: {} });
      }
      const entry = campDisps.get(row.campaign)!;
      entry.total += row.calls;
      const key = normalizeDispKey(row.call_status);
      entry.statuses[key] = (entry.statuses[key] || 0) + row.calls;
    }
    rawData.campaign_dispositions = Array.from(campDisps.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)
      .map(([campaign, data]) => ({
        campaign,
        total_calls: data.total,
        statuses: data.statuses,
      }));
  }

  // ── Production subcampaign data ───────────────────────────
  if (productionSubcampaign.length > 0) {
    rawData.production_subcampaigns = productionSubcampaign
      .filter((p) => p.connects > 0 || p.sales_count > 0)
      .sort((a, b) => b.connects - a.connects)
      .slice(0, 20)
      .map((p) => ({
        subcampaign: p.subcampaign,
        connects: p.connects,
        contacts: p.contacts,
        sales: p.sales_count,
        ans_machine: p.ans_machine,
        inbound_voicemail: p.inbound_voicemail,
      }));
  }

  // ── Agent-Campaign allocation from AgentSummarySubcampaign ─
  if (agentSummarySubcampaign.length > 0) {
    const agentCampMap = new Map<string, {
      campaigns: Set<string>;
      totalTransfers: number;
      totalHours: number;
      totalDials: number;
      totalConnects: number;
      totalContacts: number;
    }>();
    for (const row of agentSummarySubcampaign) {
      if (!agentCampMap.has(row.rep)) {
        agentCampMap.set(row.rep, {
          campaigns: new Set(),
          totalTransfers: 0,
          totalHours: 0,
          totalDials: 0,
          totalConnects: 0,
          totalContacts: 0,
        });
      }
      const entry = agentCampMap.get(row.rep)!;
      if (row.campaign) entry.campaigns.add(row.campaign);
      entry.totalTransfers += row.transfers;
      entry.totalHours += row.hours_worked;
      entry.totalDials += row.dialed;
      entry.totalConnects += row.connects;
      entry.totalContacts += row.contacts;
    }

    rawData.agent_campaigns = Array.from(agentCampMap.entries())
      .filter(([, v]) => v.totalHours > 0)
      .sort((a, b) => b[1].totalTransfers - a[1].totalTransfers)
      .slice(0, 50)
      .map(([name, v]) => ({
        agent: name,
        campaigns: Array.from(v.campaigns),
        campaign_count: v.campaigns.size,
        dials: v.totalDials,
        connects: v.totalConnects,
        contacts: v.totalContacts,
        transfers: v.totalTransfers,
        hours: round(v.totalHours, 1),
        tph: round(safeDiv(v.totalTransfers, v.totalHours), 2),
      }));
  }

  // ── Agent Analysis (per-agent per-campaign with Date) ─────
  if (agentAnalysis.length > 0) {
    // Aggregate per-campaign performance across agents
    const campPerfMap = new Map<string, {
      agents: Set<string>;
      totalHours: number;
      totalTransfers: number;
      totalConnects: number;
      totalContacts: number;
      totalCallBacks: number;
    }>();
    for (const row of agentAnalysis) {
      const camp = row.campaign || 'Unknown';
      if (!campPerfMap.has(camp)) {
        campPerfMap.set(camp, {
          agents: new Set(),
          totalHours: 0,
          totalTransfers: 0,
          totalConnects: 0,
          totalContacts: 0,
          totalCallBacks: 0,
        });
      }
      const entry = campPerfMap.get(camp)!;
      entry.agents.add(row.rep);
      entry.totalHours += row.hours_worked;
      entry.totalTransfers += row.transfers;
      entry.totalConnects += row.connects;
      entry.totalContacts += row.contacts;
      entry.totalCallBacks += row.call_backs;
    }

    rawData.campaign_agent_analysis = Array.from(campPerfMap.entries())
      .filter(([, v]) => v.totalHours > 0)
      .sort((a, b) => b[1].totalTransfers - a[1].totalTransfers)
      .slice(0, 20)
      .map(([campaign, v]) => ({
        campaign,
        agents: v.agents.size,
        hours: round(v.totalHours, 1),
        transfers: v.totalTransfers,
        connects: v.totalConnects,
        contacts: v.totalContacts,
        call_backs: v.totalCallBacks,
        tph: round(safeDiv(v.totalTransfers, v.totalHours), 2),
        conversion_rate: round(safeDiv(v.totalTransfers, v.totalContacts || 1) * 100, 2),
      }));
  }

  // ── Pause/Break analytics from AgentPauseTime ─────────────
  if (agentPauseTime.length > 0) {
    const pauseByAgent = new Map<string, { sessions: number; totalPauseMin: number }>();
    const globalBreakCodes = new Map<string, number>();

    for (const row of agentPauseTime) {
      if (!pauseByAgent.has(row.rep)) {
        pauseByAgent.set(row.rep, { sessions: 0, totalPauseMin: 0 });
      }
      const entry = pauseByAgent.get(row.rep)!;
      entry.sessions++;
      entry.totalPauseMin += parseHMS(row.time_paused);

      const code = row.break_code || 'Unknown';
      globalBreakCodes.set(code, (globalBreakCodes.get(code) || 0) + 1);
    }

    const totalPauseMin = Array.from(pauseByAgent.values()).reduce((s, v) => s + v.totalPauseMin, 0);

    rawData.pause_analytics = {
      total_sessions: agentPauseTime.length,
      agents_with_pauses: pauseByAgent.size,
      total_pause_minutes: round(totalPauseMin, 1),
      avg_pause_per_agent_min: round(safeDiv(totalPauseMin, pauseByAgent.size), 1),
      break_codes: Object.fromEntries(
        Array.from(globalBreakCodes.entries()).sort((a, b) => b[1] - a[1]),
      ),
      top_pausers: Array.from(pauseByAgent.entries())
        .sort((a, b) => b[1].totalPauseMin - a[1].totalPauseMin)
        .slice(0, 10)
        .map(([name, v]) => ({
          agent: name,
          sessions: v.sessions,
          pause_minutes: round(v.totalPauseMin, 1),
        })),
    };
  }

  // ── Campaign Call Log (system-level call status summary) ───
  if (campaignCallLog.length > 0) {
    rawData.call_log = campaignCallLog
      .filter((c) => c.calls > 0)
      .sort((a, b) => b.calls - a.calls)
      .map((c) => ({
        status: c.call_status,
        description: c.description,
        calls: c.calls,
        percent: c.percent,
      }));
  }

  // ── Report source summary (what data was available) ───────
  rawData.report_sources = {
    agent_summary: agentSummaryBase.length,
    agent_summary_campaign: agentSummaryCampaign.length,
    agent_summary_subcampaign: agentSummarySubcampaign.length,
    agent_analysis: agentAnalysis.length,
    agent_pause_time: agentPauseTime.length,
    production: production.length,
    production_subcampaign: productionSubcampaign.length,
    subcampaign_summary: subcampaign.length,
    campaign_summary: campaignSummary.length,
    campaign_call_log: campaignCallLog.length,
    shift_report: shiftReport.length,
    calls_per_hour: callsPerHour.length,
    total_source_rows:
      agentSummaryBase.length + agentSummaryCampaign.length +
      agentSummarySubcampaign.length + agentAnalysis.length +
      agentPauseTime.length + production.length + productionSubcampaign.length +
      subcampaign.length + campaignSummary.length + campaignCallLog.length +
      shiftReport.length + callsPerHour.length,
  };

  return { dailyKPIs, agentPerformance, skillSummary, anomalies, rawData };
}

/**
 * Build aggregate disposition counts from ShiftReport data.
 * ShiftReport provides call_status + calls count per campaign — we aggregate across all campaigns.
 */
function buildShiftReportDispositions(shiftReport: ShiftReportRow[]): Record<string, number> {
  const dispositions: Record<string, number> = {};
  for (const row of shiftReport) {
    if (row.calls > 0 && row.call_status) {
      const key = normalizeDispKey(row.call_status);
      dispositions[key] = (dispositions[key] || 0) + row.calls;
    }
  }
  return dispositions;
}

// DialedIn Report ETL Pipeline Types

// ═══════════════════════════════════════════════════════════
// Report Types — All 12 DialedIn daily report types
// ═══════════════════════════════════════════════════════════

export type ReportType =
  | 'AgentSummary'
  | 'AgentSummaryCampaign'
  | 'AgentSummarySubcampaign'
  | 'AgentAnalysis'
  | 'AgentPauseTime'
  | 'CallsPerHour'
  | 'CampaignCallLog'
  | 'CampaignSummary'
  | 'ProductionReport'
  | 'ProductionReportSubcampaign'
  | 'ShiftReport'
  | 'SubcampaignSummary';

export type IngestionSource = 'manual' | 'email_apps_script' | 'api';
export type IngestionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface DialedInReport {
  id: string;
  filename: string;
  report_type: ReportType;
  report_date: string;
  date_range_start: string | null;
  date_range_end: string | null;
  raw_file_url: string | null;
  row_count: number | null;
  ingestion_source: IngestionSource;
  ingestion_status: IngestionStatus;
  error_message: string | null;
  processed_at: string | null;
  raw_metadata: Record<string, unknown>;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════
// Parsed Row Types (from XLS)
// ═══════════════════════════════════════════════════════════

/** AgentSummary (base) — all logged-in agents with Team column.
 *  Also used for AgentSummaryCampaign (no Team, active agents only). */
export interface AgentSummaryRow {
  rep: string;
  team?: string; // Present in AgentSummary (base), absent in AgentSummaryCampaign
  dialed: number;
  connects: number;
  contacts: number;
  hours_worked: number;
  transfers: number; // Sale/Lead/App
  connects_per_hour: number;
  sla_hr: number; // S-L-A/HR
  conversion_rate_pct: number;
  talk_time_min: number;
  avg_talk_time_min: number;
  wait_time_min: number;
  avg_wait_time_min: number;
  wrap_time_min: number;
  avg_wrap_time_min: number;
  logged_in_time_min: number;
}

/** AgentSummarySubcampaign — per-agent per-campaign breakdown */
export interface AgentSummarySubcampaignRow {
  campaign: string;
  subcampaign: string;
  rep: string;
  dialed: number;
  connects: number;
  contacts: number;
  hours_worked: number;
  transfers: number;
  connects_per_hour: number;
  sla_hr: number;
  conversion_rate_pct: number;
  talk_time_min: number;
  avg_talk_time_min: number;
  wait_time_min: number;
  avg_wait_time_min: number;
  wrap_time_min: number;
  avg_wrap_time_min: number;
  logged_in_time_min: number;
}

/** AgentAnalysis — per-agent per-campaign with Date */
export interface AgentAnalysisRow {
  date: string;
  rep: string;
  campaign: string;
  hours_worked: number;
  contacts: number;
  connects: number;
  connects_per_hour: number;
  conversion_rate_pct: number;
  conversion_factor: number;
  transfers: number;
  sla_hr: number;
  call_backs: number;
  avg_talk_time_min: number;
  avg_wait_time_min: number;
  time_avail_min: number;
  time_paused_min: number;
  talk_time_min: number;
  wrap_time_min: number;
  logged_in_time_min: number;
}

/** AgentPauseTime — pause/break session tracking */
export interface AgentPauseTimeRow {
  rep: string;
  campaign: string;
  session_login_time: string;
  session_logout_time: string;
  pause_time: string;
  break_code: string;
  unpause_time: string;
  time_paused: string;
  session_man_hours: number;
}

/** CallsPerHour — hourly volume distribution */
export interface CallsPerHourRow {
  hour: string;
  total_calls: number;
  connects: number;
  contacts: number;
  transfers: number;
  conversion_rate_pct: number;
  inbound: number;
  inbound_pct: number;
  abandoned_calls: number;
  abandon_rate_pct: number;
  outbound: number;
  outbound_pct: number;
  dropped: number;
  drop_rate_pct: number;
  talk_time_min: number;
  avg_hold_time_min: number;
  avg_wait_time_min: number;
  contact_pct: number;
}

/** CampaignCallLog — summary call status counts */
export interface CampaignCallLogRow {
  call_status: string;
  description: string;
  calls: number;
  percent: number;
}

/** CampaignSummary — rich campaign-level metrics */
export interface CampaignSummaryRow {
  period: string;
  campaign: string;
  campaign_type: string;
  lines_per_agent: number;
  total_leads: number;
  available: number;
  dialed: number;
  dials_per_hr: number;
  avg_attempts: number;
  reps: number;
  man_hours: number;
  logged_in_time_min: number;
  connects: number;
  connect_pct: number;
  contacts: number;
  contact_pct: number;
  hangups: number;
  connects_per_hour: number;
  conversion_rate_pct: number;
  conversion_factor: number;
  transfers: number;
  sla_hr: number;
  noans_rate_pct: number;
  norb_rate_pct: number;
  drop_rate_pct: number;
  avg_wait_time_min: number;
}

export interface SubcampaignRow {
  period: string;
  campaign: string;
  subcampaign: string;
  total_leads: number;
  dialed: number;
  connects: number;
  contacts: number;
  transfers: number;
  man_hours: number;
  connect_rate_pct: number;
  conversion_rate_pct: number;
  operator_disconnects: number;
}

export interface ProductionRow {
  rep: string;
  skill: string;
  man_hours: number;
  logged_in_time_min: number;
  connects: number;
  contacts: number;
  transfers: number;
  dispositions: Record<string, number>;
}

/** ProductionReportSubcampaign — subcampaign-level production */
export interface ProductionSubcampaignRow {
  subcampaign: string;
  ans_machine: number;
  inbound_voicemail: number;
  connects: number;
  contacts: number;
  sales_count: number;
}

/** ShiftReport — disposition breakdown by campaign and date */
export interface ShiftReportRow {
  date: string;
  campaign: string;
  call_status: string;
  description: string;
  type: string;
  calls: number;
  percent: number;
}

export interface ParsedReportData {
  reportType: ReportType;
  dateLabel: string;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  filename: string;
  // Tier 1 — Active KPI data
  agentSummary?: AgentSummaryRow[];
  subcampaign?: SubcampaignRow[];
  production?: ProductionRow[];
  campaignSummary?: CampaignSummaryRow[];
  shiftReport?: ShiftReportRow[];
  // Tier 2 — Enrichment data
  agentSummarySubcampaign?: AgentSummarySubcampaignRow[];
  agentAnalysis?: AgentAnalysisRow[];
  callsPerHour?: CallsPerHourRow[];
  productionSubcampaign?: ProductionSubcampaignRow[];
  // Tier 3 — Raw metadata
  agentPauseTime?: AgentPauseTimeRow[];
  campaignCallLog?: CampaignCallLogRow[];
}

// ═══════════════════════════════════════════════════════════
// Computed KPIs
// ═══════════════════════════════════════════════════════════

export interface DailyKPIs {
  report_date: string;
  total_agents: number;
  agents_with_transfers: number;
  total_dials: number;
  total_connects: number;
  total_contacts: number;
  total_transfers: number;
  total_man_hours: number;
  total_talk_time_min: number;
  total_wait_time_min: number;
  total_wrap_time_min: number;
  connect_rate: number;
  contact_rate: number;
  conversion_rate: number;
  transfers_per_hour: number;
  dials_per_hour: number;
  dead_air_ratio: number;
  hung_up_ratio: number;
  waste_rate: number;
  transfer_success_rate: number;
  prev_day_transfers: number | null;
  prev_day_tph: number | null;
  delta_transfers: number | null;
  delta_tph: number | null;
  dispositions: Record<string, number>;
  distribution: TPHDistribution | null;
  is_partial?: boolean;
}

export interface TPHDistribution {
  count: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  mean: number;
  std: number;
}

export interface AgentPerformance {
  id: string;
  report_date: string;
  agent_name: string;
  employee_id: string | null;
  skill: string | null;
  subcampaign: string | null;
  dials: number;
  connects: number;
  contacts: number;
  transfers: number;
  hours_worked: number;
  talk_time_min: number;
  wait_time_min: number;
  wrap_time_min: number;
  logged_in_time_min: number;
  tph: number;
  connects_per_hour: number;
  connect_rate: number;
  conversion_rate: number;
  dead_air_ratio: number;
  dispositions: Record<string, number>;
  tph_rank: number | null;
  conversion_rank: number | null;
  dials_rank: number | null;
}

export interface SkillSummary {
  id: string;
  report_date: string;
  skill: string;
  subcampaign: string | null;
  agent_count: number;
  total_dials: number;
  total_connects: number;
  total_contacts: number;
  total_transfers: number;
  total_man_hours: number;
  avg_tph: number;
  connect_rate: number;
  conversion_rate: number;
  dispositions: Record<string, number>;
}

// ═══════════════════════════════════════════════════════════
// Anomalies & Alerts
// ═══════════════════════════════════════════════════════════

export type AnomalyType =
  | 'zero_transfers'
  | 'high_dead_air'
  | 'high_hung_up'
  | 'low_tph'
  | 'outlier_dials'
  | 'stat_outlier';

export type Severity = 'info' | 'warning' | 'critical';

export interface Anomaly {
  id: string;
  report_date: string;
  anomaly_type: AnomalyType;
  severity: Severity;
  agent_name: string | null;
  skill: string | null;
  metric_name: string | null;
  metric_value: number | null;
  threshold_value: number | null;
  details: Record<string, unknown>;
  created_at: string;
}

export type AlertOperator = 'gte' | 'lte' | 'gt' | 'lt' | 'eq';

export interface AlertRule {
  id: string;
  name: string;
  description: string | null;
  metric: string;
  operator: AlertOperator;
  warning_threshold: number | null;
  critical_threshold: number | null;
  scope: 'agent' | 'daily_aggregate' | 'skill';
  min_hours_filter: number;
  is_active: boolean;
  notify_roles: string[];
  notify_emails: string[];
  cooldown_hours: number;
}

export interface Alert {
  id: string;
  report_date: string;
  rule_id: string;
  severity: Severity;
  agent_name: string | null;
  skill: string | null;
  metric_name: string | null;
  metric_value: number | null;
  threshold_value: number | null;
  message: string;
  details: Record<string, unknown>;
  email_sent: boolean;
  email_sent_at: string | null;
  acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  notes: string | null;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════
// Disposition columns (reference for waste rate calculation)
// ═══════════════════════════════════════════════════════════

export const DISPOSITION_COLUMNS = [
  'Ans. Machine',
  'Booking',
  'Call Back',
  'Conference Ending',
  'Dead Air',
  'DNC',
  'DQ - Dissqualified',
  'DQ/Medicare',
  'Fishing',
  'Hung Up Transfer',
  'No Agent',
  'No English',
  'Not Interested',
  'Purity Inbound',
  'Robo',
  'Transfer',
  'Wrong Number',
] as const;

export type DispositionColumn = (typeof DISPOSITION_COLUMNS)[number];

// Waste dispositions (for waste rate calculation)
export const WASTE_DISPOSITIONS = [
  'Not Interested',
  'Dead Air',
  'DNC',
  'Wrong Number',
  'Ans. Machine',
  'Robo',
] as const;

// Known non-disposition columns in ProductionReport (everything else is a disposition)
export const PRODUCTION_NON_DISPOSITION_COLUMNS = new Set([
  'Rep',
  'Skill',
  'Man Hours',
  'Logged In Time',
  'Connects',
  'Contacts',
  'Contacts/ManHour',
  'Sale/Lead/App',
  'Sales/ManHour',
  '__EMPTY',
]);

// ═══════════════════════════════════════════════════════════
// Report Type Configuration — ORDER MATTERS (most specific first)
// ═══════════════════════════════════════════════════════════

export const REPORT_TYPE_CONFIG: Record<ReportType, { pattern: RegExp }> = {
  // Agent* — most specific first to avoid substring matches
  AgentSummarySubcampaign: { pattern: /AgentSummarySubcampaign/i },
  AgentSummaryCampaign: { pattern: /AgentSummaryCampaign/i },
  AgentSummary: { pattern: /AgentSummary_/i },
  AgentAnalysis: { pattern: /AgentAnalysis/i },
  AgentPauseTime: { pattern: /AgentPauseTime/i },
  // Campaign* — SubcampaignSummary BEFORE CampaignSummary (substring overlap)
  SubcampaignSummary: { pattern: /SubcampaignSummary/i },
  CampaignCallLog: { pattern: /CampaignCallLog/i },
  CampaignSummary: { pattern: /CampaignSummary/i },
  // Production* — Subcampaign variant before base
  ProductionReportSubcampaign: { pattern: /ProductionReportSubcampaign/i },
  ProductionReport: { pattern: /ProductionReport_/i },
  // Other
  CallsPerHour: { pattern: /CallsPerHour/i },
  ShiftReport: { pattern: /ShiftReport/i },
};

// ═══════════════════════════════════════════════════════════
// Thresholds for anomaly detection
// ═══════════════════════════════════════════════════════════

export const THRESHOLDS = {
  dead_air_ratio_warning: 30.0,
  dead_air_ratio_critical: 50.0,
  hung_up_ratio_warning: 10.0,
  hung_up_ratio_critical: 30.0,
  min_hours_qualified: 2.0,
  min_hours_coaching: 4.0,
  min_connects_anomaly: 50,
  zero_transfer_min_hours: 4.0,
} as const;

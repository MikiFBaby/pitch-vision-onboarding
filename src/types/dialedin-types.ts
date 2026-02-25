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

export type IngestionSource = 'manual' | 'email_apps_script' | 'api' | 'cron_imap';
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
  team: string | null;
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
  pause_time_min: number;
  tph: number;
  adjusted_tph: number | null;
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
// Analytics Types — Workspace features
// ═══════════════════════════════════════════════════════════

export type Workspace = 'live' | 'analytics' | 'coaching' | 'revenue';

export interface AgentTrend {
  sparkline: number[];
  dates: string[];
  avg_tph: number;
  stddev_tph: number;
  consistency_score: number;
  trend: 'up' | 'down' | 'flat';
  days_worked: number;
  min_tph: number;
  max_tph: number;
}

export interface WeekAggregates {
  start: string;
  end: string;
  transfers: number;
  hours: number;
  tph: number;
  connect_rate: number;
  conversion_rate: number;
  agents_avg: number;
  dials: number;
  connects: number;
  days_count: number;
}

export interface WoWComparison {
  current_week: WeekAggregates;
  prev_week: WeekAggregates;
  deltas: Record<string, { abs: number; pct: number }>;
}

export interface DowHeatmapEntry {
  dow: number;
  label: string;
  avg_tph: number;
  avg_transfers: number;
  avg_connect_rate: number;
  avg_conversion_rate: number;
  avg_hours: number;
  count: number;
}

export interface TeamROI {
  team: string;
  campaign_type: string | null;
  transfers: number;
  revenue: number;
  cost: number;
  profit: number;
  hours: number;
  agents: number;
  tph: number;
  rev_per_hour: number;
  roi_pct: number;
}

export interface RetreaverTotals {
  revenue: number;
  payout: number;
  calls: number;
  avg_per_call: number;           // revenue / converted calls (true per-billable avg)
  avg_per_call_diluted: number;   // revenue / all calls (diluted by unconverted)
  connected_secs: number;
  billable_minutes: number;
  converted: number;
}

export interface RetreaverCampaignBreakdown {
  campaign: string;
  revenue: number;
  payout: number;
  calls: number;
  avg_per_call: number;
  converted: number;
}

export interface RetreaverAgentBreakdown {
  agent: string;
  revenue: number;
  calls: number;
  avg_per_call: number;
  campaigns: string[];
}

export interface RetreaverStateBreakdown {
  state: string;
  revenue: number;
  calls: number;
  avg_per_call: number;
  converted: number;
}

export interface RetreaverRevenueSummary {
  period: { start: string; end: string };
  totals: RetreaverTotals;
  by_campaign: RetreaverCampaignBreakdown[];
  by_agent: RetreaverAgentBreakdown[];
  by_state: RetreaverStateBreakdown[];
  daily_trend: Array<{ date: string; revenue: number; payout: number; calls: number }>;
}

export interface RetreaverLive {
  date: string;
  today_revenue: number;
  today_calls: number;
  converted: number;
  avg_per_call: number;           // revenue / converted calls
  avg_per_call_diluted: number;   // revenue / all calls
  calls_per_minute: number;
  avg_call_duration_secs: number | null;
  top_campaigns_today: Array<{ campaign: string; revenue: number }>;
}

export interface RevenueSummary {
  period: { start: string; end: string };
  totals: {
    revenue: number;
    cost: number;
    profit: number;
    margin_pct: number;
    total_transfers: number;
    total_hours: number;
    working_days: number;
  };
  by_team: TeamROI[];
  daily_revenue: Array<{ date: string; revenue: number; cost: number }>;
  retreaver?: RetreaverRevenueSummary;
  time_series?: TimeSeriesBucket[];
  variance?: VarianceSummary;
}

// ═══════════════════════════════════════════════════════════
// Time Series & Variance Types
// ═══════════════════════════════════════════════════════════

export type TimeGranularity = 'daily' | 'weekly' | 'monthly';

export interface TimeSeriesBucket {
  bucket_start: string;
  bucket_label: string;
  sla_transfers: number;
  billable_calls: number;
  estimated_revenue: number;
  actual_revenue: number;
  cost: number;
  profit: number;
  hours: number;
  agents: number;
  rev_per_hour: number;
}

export interface VarianceSummary {
  totals: {
    sla_transfers: number;
    billable_calls: number;
    gap: number;
    conversion_rate: number;
    estimated_revenue: number;
    actual_revenue: number;
    revenue_variance: number;
  };
  by_date: VarianceDateRow[];
  by_campaign: VarianceCampaignRow[];
  by_agent: VarianceAgentRow[];
}

export interface VarianceDateRow {
  date: string;
  sla_transfers: number;
  billable_calls: number;
  gap: number;
  conversion_rate: number;
  estimated_revenue: number;
  actual_revenue: number;
}

export interface VarianceCampaignRow {
  campaign: string;
  sla_transfers: number;
  billable_calls: number;
  gap: number;
  conversion_rate: number;
  estimated_revenue: number;
  actual_revenue: number;
}

export interface VarianceAgentRow {
  agent_name: string;
  team: string | null;
  sla_transfers: number;
  billable_calls: number;
  gap: number;
  conversion_rate: number;
  estimated_revenue: number;
  actual_revenue: number;
}

export interface DeclineAlert {
  agent_name: string;
  team: string | null;
  consecutive_decline_days: number;
  tph_start: number;
  tph_end: number;
  drop_pct: number;
  sparkline: number[];
  severity: 'warning' | 'critical';
}

export interface ForecastResult {
  historical: Array<{ date: string; revenue: number }>;
  forecast: Array<{ date: string; predicted_revenue: number }>;
  model: {
    slope: number;
    r_squared: number;
    trend: 'growing' | 'declining' | 'flat';
    daily_avg: number;
    projected_monthly: number;
  };
}

export interface CoachingEvent {
  id: string;
  agent_name: string;
  coach_name: string | null;
  event_date: string;
  event_type: 'coaching' | 'warning' | 'pip' | 'training' | 'note';
  notes: string | null;
  tags: string[];
  created_by: string | null;
  created_at: string;
}

export interface CoachingImpact {
  event: CoachingEvent;
  before: { avg_tph: number; avg_conv: number; avg_connect: number; days: number };
  after: { avg_tph: number; avg_conv: number; avg_connect: number; days: number };
  impact: {
    tph_delta: number;
    tph_pct_change: number;
    conv_delta: number;
    improved: boolean;
  };
}

export interface RampCurveAgent {
  name: string;
  hire_date: string;
  days_since_hire: number;
  current_tph: number;
  ramp: Array<{ day: number; tph: number }>;
}

export interface RampCurveData {
  agents: RampCurveAgent[];
  avg_ramp: Array<{ day: number; avg_tph: number; agent_count: number }>;
}

export interface SkillTrendPoint {
  date: string;
  agent_count: number;
  total_transfers: number;
  avg_tph: number;
  connect_rate: number;
  conversion_rate: number;
}

// ═══════════════════════════════════════════════════════════
// QA Compliance Integration
// ═══════════════════════════════════════════════════════════

export interface AgentQAStats {
  agent_name: string;
  total_calls: number;
  avg_score: number;
  auto_fail_count: number;
  auto_fail_rate: number;
  risk_breakdown: { high: number; medium: number; low: number };
  latest_call_date: string;
  pass_rate: number;
}

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

// ═══════════════════════════════════════════════════════════
// Real-Time Webhook Types
// ═══════════════════════════════════════════════════════════

export type WebhookEventType = 'agent_status' | 'transfer';
export type WebhookProcessingStatus = 'pending' | 'processed' | 'failed' | 'skipped';
export type AgentLiveStatus = 'available' | 'on_call' | 'wrap' | 'paused' | 'offline';

export interface WebhookEvent {
  id: string;
  idempotency_key: string;
  event_type: WebhookEventType;
  event_subtype: string | null;
  agent_name: string | null;
  agent_id: string | null;
  campaign: string | null;
  phone_number: string | null;
  event_timestamp: string;
  received_at: string;
  raw_payload: Record<string, unknown>;
  processing_status: WebhookProcessingStatus;
  processing_error: string | null;
  processed_at: string | null;
  source_workflow_id: string | null;
  source_ip: string | null;
}

export interface LiveAgentStatus {
  id: string;
  agent_name: string;
  agent_id: string | null;
  current_status: AgentLiveStatus;
  current_campaign: string | null;
  break_code: string | null;
  session_start: string | null;
  status_since: string;
  session_dials: number;
  session_connects: number;
  session_transfers: number;
  session_talk_time_sec: number;
  last_event_id: string | null;
  updated_at: string;
}

export interface LiveMetrics {
  metric_date: string;
  campaign: string;
  total_transfers: number;
  agents_active: number;
  agents_on_break: number;
  agents_logged_in: number;
  transfers_this_hour: number;
  hour_bucket: number | null;
  last_event_at: string | null;
  updated_at: string;
}

export interface LiveDashboardData {
  live_metrics: LiveMetrics | null;
  agent_statuses: LiveAgentStatus[];
  recent_events: Pick<WebhookEvent, 'event_type' | 'event_subtype' | 'agent_name' | 'campaign' | 'event_timestamp'>[];
  has_live_data: boolean;
}

// ═══════════════════════════════════════════════════════════
// Executive Portal Types
// ═══════════════════════════════════════════════════════════

export type CostCategory = 'dialer' | 'subscription' | 'other' | 'salary';
export type CostRateType = 'per_seat' | 'flat_monthly' | 'flat_daily' | 'flat_biweekly';
export type PnLDimension = 'total' | 'campaign' | 'agent' | 'team';
export type DateRangePreset = '7d' | '14d' | '30d' | 'mtd' | 'ytd' | 'custom';
export type DialerSource = 'all' | 'dialedin' | 'tld';

export interface CostConfig {
  id: string;
  category: CostCategory;
  subcategory: string | null;
  rate_type: CostRateType;
  rate_amount: number;
  campaign: string | null;
  description: string;
  effective_start: string;
  effective_end: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PnLSummary {
  period: { start: string; end: string };
  revenue: number;
  estimated_revenue: number;
  labor_cost: number;
  salary_cost: number;
  dialer_cost: number;
  subscription_cost: number;
  other_cost: number;
  total_cost: number;
  gross_profit: number;
  margin_pct: number;
  roi_pct: number;
  sla_transfers: number;
  billable_calls: number;
  hours_worked: number;
  agent_count: number;
  unmatched_agents: number;
  unmatched_agent_names: string[];
}

export interface PnLBreakdown {
  dimension_value: string;
  revenue: number;
  estimated_revenue: number;
  labor_cost: number;
  salary_cost: number;
  dialer_cost: number;
  subscription_cost: number;
  other_cost: number;
  total_cost: number;
  gross_profit: number;
  margin_pct: number;
  hours_worked: number;
  agent_count: number;
}

export interface PnLTrend {
  date: string;
  revenue: number;
  total_cost: number;
  labor_cost: number;
  gross_profit: number;
  margin_pct: number;
}

export interface PnLResponse {
  summary: PnLSummary;
  breakdown: PnLBreakdown[];
  trend: PnLTrend[];
}

export interface CostProjection {
  hourly: number;
  daily: number;
  weekly: number;
  monthly: number;
}

export interface ExpenseOverview {
  labor: CostProjection;
  dialer: CostProjection;
  subscriptions: CostProjection;
  other: CostProjection;
  total: CostProjection;
  active_agents: number;
  avg_hourly_wage: number;
}

export interface ExecutiveFilters {
  dateRange: DateRangePreset;
  startDate: string;
  endDate: string;
  campaign: string | null;
  agent: string | null;
  dialer: DialerSource;
}

export interface ExecutiveOverview {
  revenue_today: number;
  revenue_period: number;
  cost_period: number;
  profit_period: number;
  margin_pct: number;
  sla_today: number;
  active_agents: number;
  avg_tph: number;
  alerts_count: number;
  top_agents: { name: string; revenue: number; transfers: number }[];
}

export interface TLDAgentPerformance {
  id: string;
  report_date: string;
  agent_name: string;
  team: string | null;
  dials: number;
  connects: number;
  contacts: number;
  transfers: number;
  hours_worked: number;
  tph: number | null;
  connect_rate: number | null;
  conversion_rate: number | null;
}

export interface UnifiedDialerPerformance {
  source: 'dialedin' | 'tld';
  report_date: string;
  agent_name: string;
  team: string | null;
  dials: number;
  connects: number;
  transfers: number;
  hours_worked: number;
  tph: number;
}

// ═══════════════════════════════════════════════════════════
// GM Roster Types
// ═══════════════════════════════════════════════════════════

export type AgentTier = 'S' | 'A' | 'B' | 'C' | 'D';

export interface RosterAgent {
  agent_name: string;
  employee_id: string | null;
  team: string | null;
  campaign_type: 'aca' | 'medicare' | null;
  country: string | null;
  hire_date: string | null;
  days_active: number;

  // Performance (period averages)
  avg_tph: number;
  avg_transfers: number;
  avg_hours: number;
  avg_conversion: number;
  total_transfers: number;
  total_hours: number;
  total_dials: number;
  total_connects: number;
  days_worked: number;

  // Financials
  est_revenue: number;
  hourly_wage: number | null;
  est_cost: number;
  true_cost: number | null;
  pnl: number;
  pnl_per_hour: number;
  roi_pct: number;

  // Tier
  tier: AgentTier;

  // Trend
  sparkline: number[];
  trend: 'up' | 'down' | 'flat';
  trend_pct: number;

  // QA (if available)
  qa_score: number | null;
  qa_stats: AgentQAStats | null;
  qa_language: {
    professionalism: number | null;
    empathy: number | null;
    clarity: number | null;
    pace: string | null;
    tone_keywords: string[];
  } | null;

  // Profile
  user_image: string | null;
}

export interface RosterTeamSummary {
  team: string;
  campaign_type: 'aca' | 'medicare' | null;
  agent_count: number;
  total_revenue: number;
  total_cost: number;
  net_pnl: number;
  avg_pnl_per_hour: number;
  avg_tph: number;
  total_transfers: number;
  total_hours: number;
}

export interface PayrollPeriod {
  id: string;
  employee_id: string | null;
  agent_name: string;
  period_start: string;
  period_end: string;
  country: string;
  hours_worked: number;
  hourly_rate: number;
  hourly_pay: number;
  sla_transfers: number;
  commission: number;
  bonus: number;
  total_pay: number;
}

// ═══════════════════════════════════════════════════════════
// Cost Certainty Types
// ═══════════════════════════════════════════════════════════

export type CertaintyLevel = 'actual' | 'derived' | 'estimated';

export interface CertaintyAnnotation {
  level: CertaintyLevel;
  label: string;
  coverage_pct?: number;
}

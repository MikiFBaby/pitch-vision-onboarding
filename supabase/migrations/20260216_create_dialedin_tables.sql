-- DialedIn Report ETL Pipeline Tables
-- Ingests daily DialedIn/Chase dialer XLS reports and stores computed KPIs

-- 1. Ingested report metadata
CREATE TABLE IF NOT EXISTS dialedin_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    report_type TEXT NOT NULL,
    report_date DATE NOT NULL,
    date_range_start DATE,
    date_range_end DATE,
    raw_file_url TEXT,
    row_count INTEGER,
    ingestion_source TEXT NOT NULL DEFAULT 'manual',
    ingestion_status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    raw_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dialedin_reports_date ON dialedin_reports(report_date DESC);
CREATE INDEX idx_dialedin_reports_type ON dialedin_reports(report_type);
CREATE INDEX idx_dialedin_reports_status ON dialedin_reports(ingestion_status);
CREATE UNIQUE INDEX idx_dialedin_reports_unique
    ON dialedin_reports(filename, report_type, report_date);

-- 2. Daily aggregate KPIs (one row per date)
CREATE TABLE IF NOT EXISTS dialedin_daily_kpis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL UNIQUE,
    total_agents INTEGER DEFAULT 0,
    agents_with_transfers INTEGER DEFAULT 0,
    total_dials INTEGER DEFAULT 0,
    total_connects INTEGER DEFAULT 0,
    total_contacts INTEGER DEFAULT 0,
    total_transfers INTEGER DEFAULT 0,
    total_man_hours NUMERIC(10,2) DEFAULT 0,
    total_talk_time_min NUMERIC(10,2) DEFAULT 0,
    total_wait_time_min NUMERIC(10,2) DEFAULT 0,
    total_wrap_time_min NUMERIC(10,2) DEFAULT 0,
    connect_rate NUMERIC(8,4),
    contact_rate NUMERIC(8,4),
    conversion_rate NUMERIC(8,4),
    transfers_per_hour NUMERIC(8,2),
    dials_per_hour NUMERIC(8,2),
    dead_air_ratio NUMERIC(8,4),
    hung_up_ratio NUMERIC(8,4),
    waste_rate NUMERIC(8,4),
    transfer_success_rate NUMERIC(8,4),
    prev_day_transfers INTEGER,
    prev_day_tph NUMERIC(8,2),
    delta_transfers INTEGER,
    delta_tph NUMERIC(8,2),
    dispositions JSONB DEFAULT '{}',
    distribution JSONB DEFAULT '{}',
    raw_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_daily_kpis_date ON dialedin_daily_kpis(report_date DESC);

-- 3. Per-agent per-day performance
CREATE TABLE IF NOT EXISTS dialedin_agent_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL,
    agent_name TEXT NOT NULL,
    employee_id UUID,
    skill TEXT,
    subcampaign TEXT,
    dials INTEGER DEFAULT 0,
    connects INTEGER DEFAULT 0,
    contacts INTEGER DEFAULT 0,
    transfers INTEGER DEFAULT 0,
    hours_worked NUMERIC(6,2) DEFAULT 0,
    talk_time_min NUMERIC(10,2) DEFAULT 0,
    wait_time_min NUMERIC(10,2) DEFAULT 0,
    wrap_time_min NUMERIC(10,2) DEFAULT 0,
    logged_in_time_min NUMERIC(10,2) DEFAULT 0,
    tph NUMERIC(6,2),
    connects_per_hour NUMERIC(6,2),
    connect_rate NUMERIC(8,4),
    conversion_rate NUMERIC(8,4),
    dead_air_ratio NUMERIC(8,4),
    dispositions JSONB DEFAULT '{}',
    tph_rank INTEGER,
    conversion_rank INTEGER,
    dials_rank INTEGER,
    raw_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_agent_perf_unique
    ON dialedin_agent_performance(report_date, agent_name, COALESCE(skill, ''), COALESCE(subcampaign, ''));
CREATE INDEX idx_agent_perf_date ON dialedin_agent_performance(report_date DESC);
CREATE INDEX idx_agent_perf_agent ON dialedin_agent_performance(agent_name);
CREATE INDEX idx_agent_perf_skill ON dialedin_agent_performance(skill);
CREATE INDEX idx_agent_perf_tph ON dialedin_agent_performance(report_date DESC, tph DESC NULLS LAST);

-- 4. Skill/campaign level daily summary
CREATE TABLE IF NOT EXISTS dialedin_skill_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL,
    skill TEXT NOT NULL,
    subcampaign TEXT,
    agent_count INTEGER DEFAULT 0,
    total_dials INTEGER DEFAULT 0,
    total_connects INTEGER DEFAULT 0,
    total_contacts INTEGER DEFAULT 0,
    total_transfers INTEGER DEFAULT 0,
    total_man_hours NUMERIC(10,2) DEFAULT 0,
    avg_tph NUMERIC(6,2),
    connect_rate NUMERIC(8,4),
    conversion_rate NUMERIC(8,4),
    dispositions JSONB DEFAULT '{}',
    raw_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_skill_summary_unique
    ON dialedin_skill_summary(report_date, skill, COALESCE(subcampaign, ''));
CREATE INDEX idx_skill_summary_date ON dialedin_skill_summary(report_date DESC);

-- 5. Detected anomalies
CREATE TABLE IF NOT EXISTS dialedin_anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL,
    anomaly_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning',
    agent_name TEXT,
    skill TEXT,
    metric_name TEXT,
    metric_value NUMERIC,
    threshold_value NUMERIC,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_anomalies_date ON dialedin_anomalies(report_date DESC);
CREATE INDEX idx_anomalies_severity ON dialedin_anomalies(severity);

-- 6. Alert rules (configurable thresholds)
CREATE TABLE IF NOT EXISTS dialedin_alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    metric TEXT NOT NULL,
    operator TEXT NOT NULL DEFAULT 'gte',
    warning_threshold NUMERIC,
    critical_threshold NUMERIC,
    scope TEXT NOT NULL DEFAULT 'agent',
    min_hours_filter NUMERIC DEFAULT 2.0,
    is_active BOOLEAN DEFAULT TRUE,
    notify_roles JSONB DEFAULT '["executive"]',
    notify_emails TEXT[] DEFAULT '{}',
    cooldown_hours INTEGER DEFAULT 24,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default alert rules
INSERT INTO dialedin_alert_rules (name, metric, operator, warning_threshold, critical_threshold, scope, min_hours_filter, description) VALUES
    ('High Dead Air Ratio', 'dead_air_ratio', 'gte', 30.0, 50.0, 'agent', 2.0, 'Agent dead air exceeds safe threshold (% of connects)'),
    ('High Hung Up Ratio', 'hung_up_ratio', 'gte', 10.0, 30.0, 'agent', 2.0, 'Agent hung-up transfer rate is abnormally high (% of connects)'),
    ('Zero Transfers', 'zero_transfers', 'eq', 0, 0, 'agent', 4.0, 'Agent completed 4+ hour shift with zero transfers'),
    ('Low Transfers Per Hour', 'tph', 'lte', 0.5, 0.2, 'agent', 4.0, 'Agent TPH is critically low'),
    ('Low Daily Connect Rate', 'connect_rate', 'lte', 3.0, 2.0, 'daily_aggregate', 0, 'Overall connect rate dropped below threshold (%)'),
    ('Transfer Volume Drop', 'transfer_volume_delta', 'lte', -15.0, -30.0, 'daily_aggregate', 0, 'Daily transfers dropped significantly vs previous day (%)')
ON CONFLICT DO NOTHING;

-- 7. Generated alerts
CREATE TABLE IF NOT EXISTS dialedin_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL,
    rule_id UUID REFERENCES dialedin_alert_rules(id),
    severity TEXT NOT NULL,
    agent_name TEXT,
    skill TEXT,
    metric_name TEXT,
    metric_value NUMERIC,
    threshold_value NUMERIC,
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    email_sent BOOLEAN DEFAULT FALSE,
    email_sent_at TIMESTAMPTZ,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_date ON dialedin_alerts(report_date DESC);
CREATE INDEX idx_alerts_unacked ON dialedin_alerts(acknowledged, created_at DESC)
    WHERE acknowledged = FALSE;
CREATE INDEX idx_alerts_severity ON dialedin_alerts(severity);

-- 8. Chat conversation history
CREATE TABLE IF NOT EXISTS dialedin_chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_session ON dialedin_chat_history(session_id, created_at);
CREATE INDEX idx_chat_user ON dialedin_chat_history(user_id);

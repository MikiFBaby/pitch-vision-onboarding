-- Executive Portal Tables
-- Supports: cost configuration, P&L snapshots, TLD dialer placeholders

-- ═══════════════════════════════════════════════════════════
-- 1. executive_cost_config — Formula-based cost rates
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS executive_cost_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,              -- 'dialer' | 'subscription' | 'other'
    subcategory TEXT,                    -- e.g. 'dialedin_seats', 'tld_seats', 'n8n', 'crm'
    rate_type TEXT NOT NULL,             -- 'per_seat' | 'flat_monthly' | 'flat_daily'
    rate_amount NUMERIC(12,2) NOT NULL,
    campaign TEXT,                       -- nullable; for campaign-specific costs
    description TEXT NOT NULL,
    effective_start DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_end DATE,                  -- null = ongoing
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cost_config_category ON executive_cost_config(category);
CREATE INDEX idx_cost_config_active ON executive_cost_config(is_active, effective_start);

-- ═══════════════════════════════════════════════════════════
-- 2. executive_pnl_snapshots — Cached P&L computation results
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS executive_pnl_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    granularity TEXT NOT NULL DEFAULT 'daily',   -- 'daily' | 'weekly' | 'monthly'
    dimension TEXT NOT NULL DEFAULT 'total',      -- 'total' | 'campaign' | 'agent' | 'team'
    dimension_value TEXT DEFAULT '__all__',
    revenue NUMERIC(12,2) DEFAULT 0,             -- Retreaver actual
    estimated_revenue NUMERIC(12,2) DEFAULT 0,   -- DialedIn SLA-based
    labor_cost NUMERIC(12,2) DEFAULT 0,
    dialer_cost NUMERIC(12,2) DEFAULT 0,
    subscription_cost NUMERIC(12,2) DEFAULT 0,
    other_cost NUMERIC(12,2) DEFAULT 0,
    total_cost NUMERIC(12,2) DEFAULT 0,
    gross_profit NUMERIC(12,2) DEFAULT 0,
    margin_pct NUMERIC(8,4) DEFAULT 0,
    sla_transfers INTEGER DEFAULT 0,
    billable_calls INTEGER DEFAULT 0,
    hours_worked NUMERIC(10,2) DEFAULT 0,
    agent_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(snapshot_date, period_start, period_end, granularity, dimension, dimension_value)
);

CREATE INDEX idx_pnl_snapshots_date ON executive_pnl_snapshots(snapshot_date DESC);
CREATE INDEX idx_pnl_snapshots_dimension ON executive_pnl_snapshots(dimension, dimension_value);

-- ═══════════════════════════════════════════════════════════
-- 3. tld_agent_performance — Placeholder for TLD dialer
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tld_agent_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL,
    agent_name TEXT NOT NULL,
    team TEXT,
    dials INTEGER DEFAULT 0,
    connects INTEGER DEFAULT 0,
    contacts INTEGER DEFAULT 0,
    transfers INTEGER DEFAULT 0,
    hours_worked NUMERIC(6,2) DEFAULT 0,
    talk_time_min NUMERIC(10,2) DEFAULT 0,
    tph NUMERIC(6,2),
    connects_per_hour NUMERIC(6,2),
    connect_rate NUMERIC(8,4),
    conversion_rate NUMERIC(8,4),
    dispositions JSONB DEFAULT '{}',
    raw_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_tld_perf_unique ON tld_agent_performance(report_date, agent_name);
CREATE INDEX idx_tld_perf_date ON tld_agent_performance(report_date DESC);

-- ═══════════════════════════════════════════════════════════
-- 4. tld_live_agent_status — Placeholder for TLD live data
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tld_live_agent_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name TEXT NOT NULL UNIQUE,
    current_status TEXT NOT NULL DEFAULT 'offline',
    current_campaign TEXT,
    status_since TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_transfers INTEGER DEFAULT 0,
    session_dials INTEGER DEFAULT 0,
    session_connects INTEGER DEFAULT 0,
    session_talk_time_sec INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Retreaver Revenue Events
-- Stores real-time API pings and CSV-imported billable call records

CREATE TABLE IF NOT EXISTS retreaver_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dedup_key TEXT NOT NULL,
    event_timestamp TIMESTAMPTZ NOT NULL,
    caller_phone TEXT,
    target_phone TEXT,
    revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
    payout NUMERIC(10,2) DEFAULT 0,
    campaign_name TEXT,
    publisher_name TEXT,
    target_name TEXT,
    agent_name TEXT,
    subcampaign TEXT,
    caller_city TEXT,
    caller_state TEXT,
    caller_zip TEXT,
    connected_secs INTEGER,
    billable_minutes NUMERIC(8,2),
    converted BOOLEAN,
    call_status TEXT,
    source TEXT NOT NULL DEFAULT 'api_ping',
    s3_file_key TEXT,
    raw_payload JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_retreaver_events_dedup
    ON retreaver_events(dedup_key);
CREATE INDEX IF NOT EXISTS idx_retreaver_events_timestamp
    ON retreaver_events(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_retreaver_events_campaign
    ON retreaver_events(campaign_name, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_retreaver_events_agent
    ON retreaver_events(agent_name, event_timestamp DESC)
    WHERE agent_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_retreaver_events_date
    ON retreaver_events((event_timestamp::date));

-- Pre-aggregated daily rollups for fast dashboard queries
CREATE TABLE IF NOT EXISTS retreaver_daily_revenue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revenue_date DATE NOT NULL,
    campaign_name TEXT NOT NULL DEFAULT '__all__',
    agent_name TEXT,
    total_revenue NUMERIC(12,2) DEFAULT 0,
    total_payout NUMERIC(12,2) DEFAULT 0,
    total_calls INTEGER DEFAULT 0,
    avg_revenue_per_call NUMERIC(8,2) DEFAULT 0,
    total_connected_secs INTEGER DEFAULT 0,
    total_billable_minutes NUMERIC(10,2) DEFAULT 0,
    converted_count INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(revenue_date, campaign_name, COALESCE(agent_name, '__none__'))
);

CREATE INDEX IF NOT EXISTS idx_retreaver_daily_date
    ON retreaver_daily_revenue(revenue_date DESC);
CREATE INDEX IF NOT EXISTS idx_retreaver_daily_campaign
    ON retreaver_daily_revenue(campaign_name, revenue_date DESC);

-- Track which S3 CSV files have been imported
CREATE TABLE IF NOT EXISTS retreaver_import_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    s3_key TEXT NOT NULL UNIQUE,
    file_type TEXT NOT NULL,
    row_count INTEGER,
    imported_count INTEGER,
    skipped_count INTEGER,
    error_message TEXT,
    import_status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

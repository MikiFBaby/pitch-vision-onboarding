-- DialedIn Real-Time Webhook Tables
-- Receives agent status changes and transfer events from DialedIn Integration Portal

-- Table 1: Raw event storage (write-once, never modified after processing)
CREATE TABLE IF NOT EXISTS dialedin_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_subtype TEXT,
    agent_name TEXT,
    agent_id TEXT,
    campaign TEXT,
    phone_number TEXT,
    event_timestamp TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    raw_payload JSONB NOT NULL,
    processing_status TEXT NOT NULL DEFAULT 'pending',
    processing_error TEXT,
    processed_at TIMESTAMPTZ,
    source_workflow_id TEXT,
    source_ip TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_webhook_events_idempotency
    ON dialedin_webhook_events(idempotency_key);

CREATE INDEX idx_webhook_events_type
    ON dialedin_webhook_events(event_type, event_timestamp DESC);

CREATE INDEX idx_webhook_events_agent
    ON dialedin_webhook_events(agent_name, event_timestamp DESC);

CREATE INDEX idx_webhook_events_pending
    ON dialedin_webhook_events(processing_status)
    WHERE processing_status IN ('pending', 'failed');

CREATE INDEX idx_webhook_events_received
    ON dialedin_webhook_events(received_at DESC);


-- Table 2: Live agent status (upserted on every agent_status event)
CREATE TABLE IF NOT EXISTS dialedin_live_agent_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name TEXT NOT NULL UNIQUE,
    agent_id TEXT,
    current_status TEXT NOT NULL DEFAULT 'offline',
    current_campaign TEXT,
    break_code TEXT,
    session_start TIMESTAMPTZ,
    status_since TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_dials INTEGER DEFAULT 0,
    session_connects INTEGER DEFAULT 0,
    session_transfers INTEGER DEFAULT 0,
    session_talk_time_sec INTEGER DEFAULT 0,
    last_event_id UUID REFERENCES dialedin_webhook_events(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_live_status_campaign
    ON dialedin_live_agent_status(current_campaign);

CREATE INDEX idx_live_status_status
    ON dialedin_live_agent_status(current_status);


-- Table 3: Running daily counters (upserted per date + campaign)
CREATE TABLE IF NOT EXISTS dialedin_live_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_date DATE NOT NULL,
    campaign TEXT NOT NULL DEFAULT '__all__',
    total_transfers INTEGER DEFAULT 0,
    agents_active INTEGER DEFAULT 0,
    agents_on_break INTEGER DEFAULT 0,
    agents_logged_in INTEGER DEFAULT 0,
    transfers_this_hour INTEGER DEFAULT 0,
    hour_bucket INTEGER,
    last_event_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(metric_date, campaign)
);

CREATE INDEX idx_live_metrics_date
    ON dialedin_live_metrics(metric_date DESC);


-- Table 4: Webhook workflow config (per-workflow auth tokens)
CREATE TABLE IF NOT EXISTS dialedin_webhook_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_name TEXT NOT NULL,
    workflow_id TEXT NOT NULL UNIQUE,
    auth_token TEXT NOT NULL,
    event_type TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    field_mapping JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

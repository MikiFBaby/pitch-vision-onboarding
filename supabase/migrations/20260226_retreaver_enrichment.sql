-- Retreaver CSV-to-Ping Enrichment Support
-- Adds columns and indexes to support matching end-of-day CSV rows to existing API pings

-- Column for future CallUUID matching (if Retreaver adds it to pings)
ALTER TABLE retreaver_events ADD COLUMN IF NOT EXISTS call_uuid TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_retreaver_events_call_uuid
  ON retreaver_events(call_uuid) WHERE call_uuid IS NOT NULL;

-- Track which pings have been enriched by CSV data
ALTER TABLE retreaver_events ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

-- Composite index for phone+timestamp enrichment lookup
CREATE INDEX IF NOT EXISTS idx_retreaver_events_phone_ts
  ON retreaver_events(caller_phone, event_timestamp)
  WHERE source = 'api_ping';

-- Backfill caller_phone from target_phone (stale deployment stored phone in wrong column)
UPDATE retreaver_events
  SET caller_phone = target_phone
  WHERE source = 'api_ping'
    AND caller_phone IS NULL
    AND target_phone IS NOT NULL;

-- Track enrichment stats in import log
ALTER TABLE retreaver_import_log ADD COLUMN IF NOT EXISTS enriched_count INTEGER DEFAULT 0;
ALTER TABLE retreaver_import_log ADD COLUMN IF NOT EXISTS unmatched_count INTEGER DEFAULT 0;

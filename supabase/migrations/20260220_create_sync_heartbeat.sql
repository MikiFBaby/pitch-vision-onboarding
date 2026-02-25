-- Sync heartbeat table: Apps Script writes a timestamp every scheduled run.
-- Vercel cron monitors this to detect when the sync trigger stops.
CREATE TABLE IF NOT EXISTS sync_heartbeat (
    id integer PRIMARY KEY DEFAULT 1,
    last_beat timestamptz NOT NULL DEFAULT now(),
    synced_count integer NOT NULL DEFAULT 0,
    skipped_count integer NOT NULL DEFAULT 0,
    failed_count integer NOT NULL DEFAULT 0,
    CONSTRAINT single_row CHECK (id = 1)
);

-- Seed the single row
INSERT INTO sync_heartbeat (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Allow service_role full access (Apps Script uses service_role key)
ALTER TABLE sync_heartbeat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON sync_heartbeat
    FOR ALL USING (true) WITH CHECK (true);

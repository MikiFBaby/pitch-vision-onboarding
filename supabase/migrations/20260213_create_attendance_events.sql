-- ============================================================================
-- Attendance Events table (for lates, early leaves, no-shows)
-- Absences continue to go to existing "Non Booked Days Off" table
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Attendance Events" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "Agent Name" TEXT NOT NULL,
    "Event Type" TEXT NOT NULL,
    "Date" DATE NOT NULL,
    "Minutes" INTEGER,
    "Reason" TEXT,
    "Reported By" TEXT
);

CREATE INDEX idx_attendance_events_agent ON "Attendance Events"("Agent Name");
CREATE INDEX idx_attendance_events_date ON "Attendance Events"("Date");
CREATE INDEX idx_attendance_events_type ON "Attendance Events"("Event Type");

-- RLS (matches existing HR table pattern)
ALTER TABLE "Attendance Events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read attendance events"
    ON "Attendance Events" FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow public read access attendance events"
    ON "Attendance Events" FOR SELECT TO public USING (true);
CREATE POLICY "Allow service role to insert attendance events"
    ON "Attendance Events" FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Allow service role to delete attendance events"
    ON "Attendance Events" FOR DELETE TO service_role USING (true);

-- Realtime publication
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE "Attendance Events";
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Pending confirmations (internal — stores parsed events between parse → confirm)
-- ============================================================================

CREATE TABLE IF NOT EXISTS attendance_pending_confirmations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slack_user_id TEXT NOT NULL,
    slack_channel_id TEXT NOT NULL,
    message_ts TEXT,
    events JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_pending_status ON attendance_pending_confirmations(status);
CREATE INDEX idx_pending_user ON attendance_pending_confirmations(slack_user_id);

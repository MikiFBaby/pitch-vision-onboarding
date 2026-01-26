-- Processing jobs table for real-time milestone tracking
-- Used by QA Analysis workflow to communicate progress to frontend

CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  milestone TEXT,
  progress_percent INTEGER DEFAULT 0,
  estimated_seconds_remaining INTEGER,
  error_message TEXT,
  metadata JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  qa_result_id BIGINT REFERENCES "QA Results"(id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_processing_jobs_batch ON processing_jobs(batch_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_updated ON processing_jobs(updated_at DESC);

-- Enable RLS
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

-- Policy for access
CREATE POLICY "Allow all access" ON processing_jobs FOR ALL USING (true) WITH CHECK (true);

-- Enable real-time (required for frontend subscriptions)
-- This allows Supabase to broadcast changes to subscribed clients
DO $$
BEGIN
    -- Check if table is already in publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND tablename = 'processing_jobs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE processing_jobs;
    END IF;
END $$;

-- CRITICAL: Set REPLICA IDENTITY FULL for UPDATE events to work
-- Without this, Supabase Realtime won't send the updated row data
ALTER TABLE processing_jobs REPLICA IDENTITY FULL;

COMMENT ON TABLE processing_jobs IS 'Tracks real-time processing status for QA analysis jobs';
COMMENT ON COLUMN processing_jobs.batch_id IS 'Unique identifier for the processing batch - use this to subscribe';
COMMENT ON COLUMN processing_jobs.milestone IS 'Current processing step: upload_started, processing_started, audio_split_complete, transcription_started, transcription_complete, ai_analysis_started, analysis_complete, completed';
COMMENT ON COLUMN processing_jobs.progress_percent IS 'Overall progress percentage (0-100)';
COMMENT ON COLUMN processing_jobs.estimated_seconds_remaining IS 'Estimated time to completion in seconds';

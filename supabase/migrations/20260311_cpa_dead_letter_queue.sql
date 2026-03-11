-- Dead letter queue for CPA pipeline callback failures
-- Captures failed callbacks for automatic retry and manual inspection

CREATE TABLE IF NOT EXISTS cpa_dead_letter_queue (
  id SERIAL PRIMARY KEY,
  s3_key TEXT NOT NULL,
  batch_id TEXT,
  file_name TEXT,
  agent_name TEXT,
  phone_number TEXT,
  error_message TEXT,
  error_node TEXT,
  runpod_job_id TEXT,
  callback_payload JSONB,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  status TEXT DEFAULT 'pending',  -- pending, retrying, resolved, abandoned
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_retry_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

-- Index for cron retry queries (pending items under max retries)
CREATE INDEX IF NOT EXISTS idx_dlq_pending
  ON cpa_dead_letter_queue (status, retry_count)
  WHERE status IN ('pending', 'retrying');

-- Index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_dlq_created
  ON cpa_dead_letter_queue (created_at DESC);

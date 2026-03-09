-- S3 Recording Ingestion Tracking
-- Tracks recordings auto-discovered from Chase/DialedIn S3 bucket
-- Used by /api/cron/qa-s3-ingest to prevent re-processing

CREATE TABLE IF NOT EXISTS qa_s3_ingestion_log (
  id BIGSERIAL PRIMARY KEY,
  s3_key TEXT NOT NULL,
  s3_bucket TEXT NOT NULL,
  file_size BIGINT,
  filename TEXT NOT NULL,
  agent_name TEXT,
  phone_number TEXT,
  call_date DATE,
  call_time TIME,
  status TEXT DEFAULT 'pending',  -- pending | submitted | completed | failed | duplicate
  batch_id TEXT,                  -- n8n batch_id returned from webhook
  job_id TEXT,                    -- n8n job_id
  error_message TEXT,
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(s3_key, s3_bucket)
);

CREATE INDEX IF NOT EXISTS idx_s3_ingest_status ON qa_s3_ingestion_log(status);
CREATE INDEX IF NOT EXISTS idx_s3_ingest_date ON qa_s3_ingestion_log(call_date);
CREATE INDEX IF NOT EXISTS idx_s3_ingest_created ON qa_s3_ingestion_log(created_at DESC);

-- CPA (Compliance Pre-Audit) Filter columns on QA Results
ALTER TABLE "QA Results" ADD COLUMN IF NOT EXISTS cpa_status TEXT;
ALTER TABLE "QA Results" ADD COLUMN IF NOT EXISTS cpa_findings JSONB DEFAULT '[]';
ALTER TABLE "QA Results" ADD COLUMN IF NOT EXISTS cpa_confidence INTEGER;

CREATE INDEX IF NOT EXISTS idx_qa_results_cpa_status ON "QA Results"(cpa_status);

COMMENT ON TABLE qa_s3_ingestion_log IS 'Tracks recordings auto-ingested from Chase/DialedIn S3 bucket into QA pipeline';
COMMENT ON COLUMN "QA Results".cpa_status IS 'Compliance Pre-Audit status: pass, fail, or n/a (non-Medicare)';
COMMENT ON COLUMN "QA Results".cpa_findings IS 'Array of CPA check results: medicare_ab, rwb_card, transfer_consent';
COMMENT ON COLUMN "QA Results".cpa_confidence IS 'CPA confidence score 0-100';

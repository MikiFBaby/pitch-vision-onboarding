-- Add deep insights columns to QA Results table
-- These capture critical AI analysis data for compliance review

ALTER TABLE "QA Results" ADD COLUMN IF NOT EXISTS auto_fail_triggered BOOLEAN DEFAULT FALSE;
ALTER TABLE "QA Results" ADD COLUMN IF NOT EXISTS auto_fail_reasons JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "QA Results" ADD COLUMN IF NOT EXISTS critical_moments JSONB;
ALTER TABLE "QA Results" ADD COLUMN IF NOT EXISTS timeline_markers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "QA Results" ADD COLUMN IF NOT EXISTS suggested_listen_start TEXT;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_qa_results_auto_fail ON "QA Results"(auto_fail_triggered);

COMMENT ON COLUMN "QA Results".auto_fail_triggered IS 'Whether call triggered automatic compliance failure';
COMMENT ON COLUMN "QA Results".auto_fail_reasons IS 'Array of reasons for auto-fail (money mention, false promises, etc.)';
COMMENT ON COLUMN "QA Results".critical_moments IS 'Object with auto_fails, passes, and warnings arrays for quick review';
COMMENT ON COLUMN "QA Results".timeline_markers IS 'Array of {event, time} objects for QA navigation';
COMMENT ON COLUMN "QA Results".suggested_listen_start IS 'Timestamp where QA reviewer should start listening';

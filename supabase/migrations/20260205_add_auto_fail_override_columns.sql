-- Migration: Add auto-fail override columns to QA Results table
-- These columns allow QA reviewers to mark auto-fail violations as false positives
-- and persist the override decision with audit trail

ALTER TABLE "QA Results" ADD COLUMN IF NOT EXISTS auto_fail_overridden BOOLEAN DEFAULT FALSE;
ALTER TABLE "QA Results" ADD COLUMN IF NOT EXISTS auto_fail_override_reason TEXT;
ALTER TABLE "QA Results" ADD COLUMN IF NOT EXISTS auto_fail_override_at TIMESTAMPTZ;
ALTER TABLE "QA Results" ADD COLUMN IF NOT EXISTS auto_fail_override_by TEXT;

-- Index for filtering overridden calls (e.g., audit reports)
CREATE INDEX IF NOT EXISTS idx_qa_results_auto_fail_overridden ON "QA Results"(auto_fail_overridden);

COMMENT ON COLUMN "QA Results".auto_fail_overridden IS 'Whether a QA reviewer has overridden the auto-fail status (marked as false positive)';
COMMENT ON COLUMN "QA Results".auto_fail_override_reason IS 'QA reviewer explanation for why the auto-fail was a false positive';
COMMENT ON COLUMN "QA Results".auto_fail_override_at IS 'Timestamp when the override was applied';
COMMENT ON COLUMN "QA Results".auto_fail_override_by IS 'Name/email of the QA reviewer who applied the override';

-- Add unique constraint on s3_recording_key for UPSERT support
-- This enables idempotent callbacks — RunPod retries safely overwrite the same record
-- PostgreSQL allows multiple NULLs in UNIQUE constraints, so manual uploads (no s3_key) are unaffected

-- Drop the old non-unique index (superseded by the constraint below)
DROP INDEX IF EXISTS idx_qa_results_s3_recording_key;

-- Drop the partial unique index if it exists (PostgREST can't use partial indexes for ON CONFLICT)
DROP INDEX IF EXISTS idx_qa_results_s3_key_unique;

-- Add proper UNIQUE CONSTRAINT (required for PostgREST on_conflict parameter)
ALTER TABLE "QA Results" ADD CONSTRAINT uq_qa_results_s3_recording_key UNIQUE (s3_recording_key);

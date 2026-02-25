-- Add S3 file key column for report archival tracking
ALTER TABLE dialedin_reports ADD COLUMN IF NOT EXISTS s3_file_key TEXT;

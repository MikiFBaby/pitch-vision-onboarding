-- Add upload_source column to QA Results for tracking call origin
-- Values: 'cpa' (CPA pre-audit), 'cpa_pass' (CPA pass), 's3_auto' (S3 automated), 'manual' (manual upload)
ALTER TABLE "QA Results" ADD COLUMN IF NOT EXISTS upload_source TEXT;

COMMENT ON COLUMN "QA Results".upload_source IS 'Source of the upload: cpa, cpa_pass, s3_auto, manual';

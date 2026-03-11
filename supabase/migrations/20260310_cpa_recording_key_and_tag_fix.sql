-- Add s3_recording_key column for on-demand presigning
ALTER TABLE "QA Results" ADD COLUMN IF NOT EXISTS s3_recording_key TEXT;

-- Index for looking up by s3_recording_key
CREATE INDEX IF NOT EXISTS idx_qa_results_s3_recording_key
  ON "QA Results" (s3_recording_key)
  WHERE s3_recording_key IS NOT NULL;

-- Fix the auto_tag trigger to skip CPA hourly_dialer records
-- The existing trigger overrides tag='cpa_pass' with 'training' for score=100 calls
CREATE OR REPLACE FUNCTION set_auto_tag_by_compliance_score()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip CPA hourly_dialer records — they set their own tags (cpa_pass/cpa_fail)
  IF NEW.upload_type = 'hourly_dialer' THEN
    RETURN NEW;
  END IF;

  -- Original trigger logic
  IF NEW.auto_fail_overridden = true THEN
    NEW.tag := 'overridden';
  ELSIF NEW.auto_fail_triggered = true THEN
    NEW.tag := 'needs_review';
  ELSIF NEW.compliance_score >= 85 THEN
    NEW.tag := 'training';
  ELSIF NEW.compliance_score >= 60 THEN
    NEW.tag := 'acceptable';
  ELSIF NEW.compliance_score IS NOT NULL THEN
    NEW.tag := 'needs_review';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

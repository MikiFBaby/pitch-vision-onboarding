-- Add attestation tracking columns to onboarding_new_hires
-- for the ID verification attestation signed by the Payroll Specialist via DocuSeal.

ALTER TABLE onboarding_new_hires
  ADD COLUMN IF NOT EXISTS attestation_status TEXT DEFAULT 'not_sent'
    CHECK (attestation_status IN ('not_sent', 'sent', 'opened', 'signed', 'declined')),
  ADD COLUMN IF NOT EXISTS attestation_submission_id TEXT,
  ADD COLUMN IF NOT EXISTS attestation_signed_url TEXT,
  ADD COLUMN IF NOT EXISTS attestation_audit_url TEXT,
  ADD COLUMN IF NOT EXISTS attestation_signed_at TIMESTAMPTZ;

-- Index for fast webhook lookups by submission ID
CREATE INDEX IF NOT EXISTS idx_onboarding_attestation_sid
  ON onboarding_new_hires (attestation_submission_id)
  WHERE attestation_submission_id IS NOT NULL;

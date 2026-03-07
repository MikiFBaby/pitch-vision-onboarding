-- DecisionHR payroll integration: submission tracking + address fields for OCR

-- Submission tracking table
CREATE TABLE IF NOT EXISTS decisionhr_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employee_directory(id),
    new_hire_id UUID REFERENCES onboarding_new_hires(id),
    submitted_by TEXT NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    payload JSONB NOT NULL,
    file_storage_path TEXT,
    file_url TEXT,
    sharepoint_status TEXT NOT NULL DEFAULT 'pending',
    sharepoint_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decisionhr_sub_employee ON decisionhr_submissions(employee_id);

-- Address fields on employee_directory (populated by OCR from Photo ID)
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS street_address TEXT;
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS zip_code TEXT;

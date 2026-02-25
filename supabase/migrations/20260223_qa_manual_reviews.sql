-- Manual QA review entries from Google Sheets audits
-- Each row = one reviewed call with a compliance violation noted

CREATE TABLE IF NOT EXISTS qa_manual_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  review_date DATE NOT NULL,
  review_time TEXT,
  agent_name TEXT NOT NULL,
  phone_number TEXT,
  violation TEXT NOT NULL,
  reviewer TEXT,
  campaign TEXT,
  sheet_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dedup constraint: same agent + phone + date + violation = one entry
CREATE UNIQUE INDEX IF NOT EXISTS idx_qa_manual_reviews_dedup
  ON qa_manual_reviews(agent_name, phone_number, review_date, violation);

-- Lookup by agent name (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_qa_manual_reviews_agent
  ON qa_manual_reviews(LOWER(agent_name));

-- Lookup by date range
CREATE INDEX IF NOT EXISTS idx_qa_manual_reviews_date
  ON qa_manual_reviews(review_date DESC);

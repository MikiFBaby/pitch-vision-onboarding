-- Rename columns to snake_case
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Call ID" TO call_id;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Campaign Type" TO campaign_type;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Agent Name" TO agent_name;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Phone Number" TO phone_number;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Call Duration" TO call_duration;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Call Date" TO call_date;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Call Time" TO call_time;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Call Status" TO call_status;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Call Score" TO call_score;
-- Keep strictly as text backup if needed, or drop later
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Risk Level" TO risk_level;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Checklist" TO checklist;
-- Ensure this is JSONB
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Violations" TO violations;
-- Ensure this is JSONB
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Review Flags" TO review_flags;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Coaching Notes" TO coaching_notes;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Summary" TO summary;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Key Quotes" TO key_quotes;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Call Recording URL" TO recording_url;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Call Analyzed Date/Time" TO analyzed_at;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Transcript" TO transcript;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "QA Status" TO qa_status;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "QA Reviewed By" TO qa_reviewed_by;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "QA Reviewed At" TO qa_reviewed_at;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "QA Notes" TO qa_notes;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Review Priority" TO review_priority;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Buyer" TO buyer;
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Compliance Score" TO compliance_score;
-- Integer
ALTER TABLE "Pitch Perfect"
    RENAME COLUMN "Call Analysis" TO call_analysis;
-- JSONB Raw Backup
-- Convert Checklist to JSONB if it's currently Text (using safe cast)
-- Note: If it fails, we might need a more complex cast, but for now assuming empty/null or valid json string
ALTER TABLE "Pitch Perfect"
ALTER COLUMN checklist TYPE jsonb USING checklist::jsonb;
ALTER TABLE "Pitch Perfect"
ALTER COLUMN violations TYPE jsonb USING violations::jsonb;
ALTER TABLE "Pitch Perfect"
ALTER COLUMN coaching_notes TYPE jsonb USING coaching_notes::jsonb;
ALTER TABLE "Pitch Perfect"
ALTER COLUMN key_quotes TYPE jsonb USING key_quotes::jsonb;
-- This might clash with existing text array structure if any, verify first.
-- Assuming key_quotes was text, we move to jsonb.
-- Add missing columns from JSON schema
ALTER TABLE "Pitch Perfect"
ADD COLUMN IF NOT EXISTS duration_assessment jsonb;
ALTER TABLE "Pitch Perfect"
ADD COLUMN IF NOT EXISTS language_assessment jsonb;
ALTER TABLE "Pitch Perfect"
ADD COLUMN IF NOT EXISTS focus_areas jsonb;
-- Also ensure compliance_score is integer
ALTER TABLE "Pitch Perfect"
ALTER COLUMN compliance_score TYPE integer USING compliance_score::integer;
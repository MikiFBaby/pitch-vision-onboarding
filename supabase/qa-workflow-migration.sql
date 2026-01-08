-- QA Review Workflow Schema Updates
-- Run this in Supabase SQL Editor

-- Add QA workflow columns to Pitch Perfect table
ALTER TABLE "public"."Pitch Perfect" 
ADD COLUMN IF NOT EXISTS "QA Status" text DEFAULT 'pending';

ALTER TABLE "public"."Pitch Perfect" 
ADD COLUMN IF NOT EXISTS "QA Reviewed By" text;

ALTER TABLE "public"."Pitch Perfect" 
ADD COLUMN IF NOT EXISTS "QA Reviewed At" timestamptz;

ALTER TABLE "public"."Pitch Perfect" 
ADD COLUMN IF NOT EXISTS "QA Notes" text;

ALTER TABLE "public"."Pitch Perfect" 
ADD COLUMN IF NOT EXISTS "Review Priority" text DEFAULT 'normal';

-- Add index for faster QA status filtering
CREATE INDEX IF NOT EXISTS idx_pitch_perfect_qa_status 
ON "public"."Pitch Perfect" ("QA Status");

CREATE INDEX IF NOT EXISTS idx_pitch_perfect_review_priority 
ON "public"."Pitch Perfect" ("Review Priority");

-- Comment: Valid values for QA Status: 'pending', 'approved', 'rejected', 'escalated', 'training_flagged'
-- Comment: Valid values for Review Priority: 'urgent', 'normal', 'low'

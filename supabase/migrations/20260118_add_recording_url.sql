-- Add recording_url column to QA Results table
-- This stores the R2 URL for audio playback in the UI

ALTER TABLE "QA Results" ADD COLUMN IF NOT EXISTS recording_url TEXT;

COMMENT ON COLUMN "QA Results".recording_url IS 'R2 URL for audio playback';

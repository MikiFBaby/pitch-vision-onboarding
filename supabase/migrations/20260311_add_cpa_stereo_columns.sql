-- Add stereo channel splitting + LA detection columns for CPA pipeline v4.0
-- These columns are populated by the CPA callback workflow

ALTER TABLE "QA Results"
  ADD COLUMN IF NOT EXISTS channel_count INTEGER,
  ADD COLUMN IF NOT EXISTS split_mode TEXT,
  ADD COLUMN IF NOT EXISTS la_segment_count INTEGER,
  ADD COLUMN IF NOT EXISTS la_text TEXT,
  ADD COLUMN IF NOT EXISTS speaker_swap_detected BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS speaker_swap_scores JSONB,
  ADD COLUMN IF NOT EXISTS transcript_corrections JSONB;

COMMENT ON COLUMN "QA Results".channel_count IS 'Number of audio channels (1=mono, 2=stereo)';
COMMENT ON COLUMN "QA Results".split_mode IS 'How audio was processed: stereo, mono_diarize_fallback';
COMMENT ON COLUMN "QA Results".la_segment_count IS 'Number of transcript segments attributed to Licensed Agent';
COMMENT ON COLUMN "QA Results".la_text IS 'Full text spoken by the Licensed Agent';
COMMENT ON COLUMN "QA Results".speaker_swap_detected IS 'Whether agent/customer channels were swapped';
COMMENT ON COLUMN "QA Results".speaker_swap_scores IS 'Swap detection scores per speaker';
COMMENT ON COLUMN "QA Results".transcript_corrections IS 'WhisperX normalization corrections applied';

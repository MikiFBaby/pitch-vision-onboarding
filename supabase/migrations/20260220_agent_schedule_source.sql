-- Add source column to Agent Schedule to distinguish onboarding-created vs sheets-synced rows
ALTER TABLE "Agent Schedule" ADD COLUMN IF NOT EXISTS source text DEFAULT 'sheets';

-- Backfill existing rows
UPDATE "Agent Schedule" SET source = 'sheets' WHERE source IS NULL;

-- New onboarding checklist item: Schedule Assignment
INSERT INTO onboarding_checklist_items (id, title, description, category, sort_order, country)
VALUES (
  'c0a80121-0004-4000-8000-000000000001',
  'Schedule Assignment',
  'Assign the weekly Mon-Fri shift schedule for the new agent.',
  'setup',
  12,
  NULL
) ON CONFLICT (id) DO NOTHING;

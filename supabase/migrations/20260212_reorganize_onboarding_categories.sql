-- Reorganize onboarding checklist categories:
-- 1. Move Portal Training → 'setup'
-- 2. Move Payroll items → 'compliance' (new category)

-- Portal Training → Setup
UPDATE onboarding_checklist_items
SET category = 'setup'
WHERE id = 'c0a80121-0002-4000-8000-000000000004';

-- Push to DecisionHR (USA) → Compliance
UPDATE onboarding_checklist_items
SET category = 'compliance'
WHERE id = 'c0a80121-0002-4000-8000-000000000005';

-- Push to Payworks (Canada) → Compliance
UPDATE onboarding_checklist_items
SET category = 'compliance'
WHERE id = 'c0a80121-0002-4000-8000-000000000006';

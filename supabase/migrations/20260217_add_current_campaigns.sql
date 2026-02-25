-- Add current_campaigns column to employee_directory
-- Stores campaign assignments derived from Slack channel membership
-- Only populated for role = 'Agent'; leadership/QA/managers are excluded

ALTER TABLE employee_directory
ADD COLUMN IF NOT EXISTS current_campaigns text[] DEFAULT '{}';

-- Index for filtering agents by campaign
CREATE INDEX IF NOT EXISTS idx_employee_directory_campaigns
ON employee_directory USING GIN (current_campaigns);

COMMENT ON COLUMN employee_directory.current_campaigns IS 'Campaign assignments from Slack channel membership (Agent role only). Values: Medicare, ACA, Medicare WhatIF';

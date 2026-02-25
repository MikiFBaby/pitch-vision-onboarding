-- ============================================================================
-- Agent Portal Launch — invite tracking, access control, app config
-- ============================================================================

-- Invite tracking on employee_directory
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ;
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS invite_status TEXT
  CHECK (invite_status IN ('pending', 'sent', 'failed'));

-- Per-agent portal access override on users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS portal_access_override TEXT
  CHECK (portal_access_override IN ('granted', 'blocked'));
-- NULL = follow global setting, 'granted' = always allowed in, 'blocked' = always blocked

-- Global app config (key-value store)
CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by TEXT
);

INSERT INTO app_config (key, value, description) VALUES
    ('agent_portal_access', '"disabled"', 'Global switch: "enabled" or "disabled" for agent portal access')
ON CONFLICT (key) DO NOTHING;

-- Migration script to add new profile columns and relax constraints for testing
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE;

-- Relax email uniqueness for testing
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique;

-- Full table definition (for fresh setups)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT UNIQUE NOT NULL,
  email TEXT, -- UNIQUE constraint removed for testing
  role TEXT DEFAULT 'agent' CHECK (role IN ('agent', 'qa', 'manager', 'executive', 'partner')),
  first_name TEXT,
  last_name TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'pending_approval')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  profile_completed BOOLEAN DEFAULT FALSE,
  bio TEXT,
  interests TEXT[] DEFAULT '{}',
  avatar_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (firebase_uid = auth.uid()::text);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (firebase_uid = auth.uid()::text);

CREATE POLICY "Executives can view all" ON users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE firebase_uid = auth.uid()::text AND role = 'executive')
  );

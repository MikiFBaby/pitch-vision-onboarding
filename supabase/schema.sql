-- 1. Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('agent', 'qa', 'manager', 'executive')),
  first_name TEXT,
  last_name TEXT,
  team_id UUID,
  phone_number TEXT,
  hire_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'pending_approval')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  profile_completed BOOLEAN DEFAULT FALSE,
  CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);

-- 2. Invitations Table
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('agent', 'qa', 'manager', 'executive')),
  first_name TEXT,
  last_name TEXT,
  team_id UUID,
  token TEXT UNIQUE NOT NULL,
  invited_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMPTZ
);

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);

-- 3. Teams Table
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name TEXT NOT NULL,
  manager_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Audit Log Table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES users(id),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ROW LEVEL SECURITY (RLS) Policies

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Users Table Policies
CREATE POLICY "Users can view own profile"
ON users FOR SELECT
USING (firebase_uid = auth.uid());

CREATE POLICY "Users can update own profile"
ON users FOR UPDATE
USING (firebase_uid = auth.uid())
WITH CHECK (firebase_uid = auth.uid());

CREATE POLICY "Managers can view their team"
ON users FOR SELECT
USING (
  role = 'manager' AND 
  team_id IN (
    SELECT team_id FROM users WHERE firebase_uid = auth.uid()
  )
);

CREATE POLICY "Executives can view all users"
ON users FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE firebase_uid = auth.uid() AND role = 'executive'
  )
);

CREATE POLICY "Executives can manage users"
ON users FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE firebase_uid = auth.uid() AND role = 'executive'
  )
);

-- Invitations Table Policies
CREATE POLICY "Executives can manage invitations"
ON invitations FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE firebase_uid = auth.uid() AND role = 'executive'
  )
);

CREATE POLICY "Anyone can view their own invitation by token"
ON invitations FOR SELECT
USING (true);

-- Automation logs table for tracking n8n workflow executions
-- Created for QA Analysis v3 workflow

CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_name TEXT NOT NULL,
  execution_id TEXT,
  batch_id TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  node_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_automation_logs_flow ON automation_logs(flow_name);
CREATE INDEX IF NOT EXISTS idx_automation_logs_status ON automation_logs(status);
CREATE INDEX IF NOT EXISTS idx_automation_logs_created ON automation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_batch ON automation_logs(batch_id);

-- Enable RLS
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

-- Policy for service role (n8n workflow)
CREATE POLICY "Service role full access" ON automation_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE automation_logs IS 'Tracks n8n workflow executions for monitoring and debugging';

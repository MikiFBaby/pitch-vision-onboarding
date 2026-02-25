ALTER TABLE dialedin_agent_performance ADD COLUMN IF NOT EXISTS team TEXT;
CREATE INDEX IF NOT EXISTS idx_agent_perf_team ON dialedin_agent_performance(team);

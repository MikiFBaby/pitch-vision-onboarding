-- DialedIn Analytics Expansion
-- Coaching events table + performance indexes for multi-date queries

-- Coaching events table (Feature 6: Coaching Impact Tracker)
CREATE TABLE IF NOT EXISTS dialedin_coaching_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  coach_name TEXT,
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'coaching'
    CHECK (event_type IN ('coaching', 'warning', 'pip', 'training', 'note')),
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coaching_agent ON dialedin_coaching_events(agent_name);
CREATE INDEX IF NOT EXISTS idx_coaching_date ON dialedin_coaching_events(event_date DESC);

-- Performance indexes for multi-date agent queries (Features 1, 5, 7, 8)
CREATE INDEX IF NOT EXISTS idx_agent_perf_name_date
  ON dialedin_agent_performance(agent_name, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_agent_perf_team_date
  ON dialedin_agent_performance(team, report_date DESC);

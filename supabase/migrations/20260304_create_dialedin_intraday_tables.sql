-- Intraday Agent Summary snapshots (scraped from DialedIn portal every 30 min)
CREATE TABLE IF NOT EXISTS dialedin_intraday_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_at TIMESTAMPTZ NOT NULL,
  snapshot_date DATE NOT NULL,
  agent_name TEXT NOT NULL,
  team TEXT,
  dialed INT DEFAULT 0,
  connects INT DEFAULT 0,
  contacts INT DEFAULT 0,
  hours_worked NUMERIC(6,2) DEFAULT 0,
  transfers INT DEFAULT 0,
  connects_per_hour NUMERIC(6,2) DEFAULT 0,
  sla_hr NUMERIC(6,2) DEFAULT 0,
  conversion_rate_pct NUMERIC(5,2) DEFAULT 0,
  talk_time_min NUMERIC(8,2) DEFAULT 0,
  wrap_time_min NUMERIC(8,2) DEFAULT 0,
  logged_in_time_min NUMERIC(8,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_intraday_agent_snapshot
  ON dialedin_intraday_snapshots(agent_name, snapshot_at);

CREATE INDEX IF NOT EXISTS idx_intraday_date
  ON dialedin_intraday_snapshots(snapshot_date);

-- Scrape health tracking
CREATE TABLE IF NOT EXISTS dialedin_intraday_scrape_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL,
  agent_count INT,
  duration_ms INT,
  error_message TEXT,
  snapshot_at TIMESTAMPTZ
);

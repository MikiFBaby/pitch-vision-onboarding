-- Add pause_time_min and adjusted_tph to dialedin_agent_performance
-- pause_time_min: aggregated from AgentAnalysis report (time_paused_min)
-- adjusted_tph: transfers / ((logged_in - pause - wrap + 30) / 60)

ALTER TABLE dialedin_agent_performance
  ADD COLUMN IF NOT EXISTS pause_time_min NUMERIC(10,2) DEFAULT 0;

ALTER TABLE dialedin_agent_performance
  ADD COLUMN IF NOT EXISTS adjusted_tph NUMERIC(6,2);

CREATE INDEX IF NOT EXISTS idx_agent_perf_adjusted_tph
  ON dialedin_agent_performance(report_date DESC, adjusted_tph DESC NULLS LAST);

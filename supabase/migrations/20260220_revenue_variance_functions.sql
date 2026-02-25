-- Revenue Variance RPC Functions
-- Compare DialedIn SLA transfers vs Retreaver billable calls

-- Daily SLA vs Billable (fast LEFT JOIN)
CREATE OR REPLACE FUNCTION revenue_variance_daily(start_date DATE, end_date DATE)
RETURNS TABLE (
  report_date DATE,
  sla_transfers INTEGER,
  sla_hours NUMERIC,
  retreaver_calls INTEGER,
  retreaver_revenue NUMERIC
) AS $$
  SELECT dk.report_date,
    dk.total_transfers::INTEGER,
    dk.total_man_hours,
    COALESCE(rd.total_calls, 0)::INTEGER,
    COALESCE(rd.total_revenue, 0)
  FROM dialedin_daily_kpis dk
  LEFT JOIN retreaver_daily_revenue rd
    ON rd.revenue_date = dk.report_date
    AND rd.campaign_name = '__all__'
  WHERE dk.report_date BETWEEN start_date AND end_date
  ORDER BY dk.report_date;
$$ LANGUAGE SQL STABLE;

-- Agent-level variance
CREATE OR REPLACE FUNCTION revenue_variance_by_agent(start_date DATE, end_date DATE)
RETURNS TABLE (
  agent_name TEXT, team TEXT,
  sla_transfers BIGINT, sla_hours NUMERIC,
  retreaver_calls BIGINT, retreaver_revenue NUMERIC
) AS $$
  SELECT dap.agent_name, dap.team,
    SUM(dap.transfers)::BIGINT,
    SUM(dap.hours_worked),
    COALESCE(ret.calls, 0)::BIGINT,
    COALESCE(ret.revenue, 0)
  FROM (
    SELECT agent_name, team, transfers, hours_worked
    FROM dialedin_agent_performance
    WHERE report_date BETWEEN start_date AND end_date
  ) dap
  LEFT JOIN (
    SELECT agent_name, COUNT(*)::BIGINT AS calls, SUM(revenue) AS revenue
    FROM retreaver_events
    WHERE event_timestamp >= start_date::TIMESTAMP
      AND event_timestamp < (end_date + 1)::TIMESTAMP
      AND agent_name IS NOT NULL AND agent_name != ''
    GROUP BY agent_name
  ) ret ON LOWER(TRIM(ret.agent_name)) = LOWER(TRIM(dap.agent_name))
  GROUP BY dap.agent_name, dap.team, ret.calls, ret.revenue
  ORDER BY SUM(dap.transfers) DESC;
$$ LANGUAGE SQL STABLE;

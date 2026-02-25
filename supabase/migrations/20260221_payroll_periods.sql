-- Payroll period data for true cost-per-agent calculations
-- Captures total compensation: hourly pay + commissions + bonuses

CREATE TABLE IF NOT EXISTS payroll_periods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employee_directory(id),
  agent_name TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  country TEXT NOT NULL CHECK (country IN ('USA', 'Canada')),
  hours_worked NUMERIC(8,2) DEFAULT 0,
  hourly_rate NUMERIC(8,2) DEFAULT 0,
  hourly_pay NUMERIC(10,2) DEFAULT 0,
  sla_transfers INTEGER DEFAULT 0,
  commission NUMERIC(10,2) DEFAULT 0,
  bonus NUMERIC(10,2) DEFAULT 0,
  total_pay NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_name, period_start, period_end)
);

-- Index for fast lookups by employee and date range
CREATE INDEX IF NOT EXISTS idx_payroll_periods_employee ON payroll_periods(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_dates ON payroll_periods(period_start, period_end);

-- RLS: admin-only access
ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on payroll_periods"
  ON payroll_periods FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

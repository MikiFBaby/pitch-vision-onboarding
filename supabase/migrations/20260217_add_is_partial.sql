-- Add is_partial flag for partial KPI computations (Agent Summary-only)
ALTER TABLE dialedin_daily_kpis ADD COLUMN IF NOT EXISTS is_partial BOOLEAN DEFAULT false;

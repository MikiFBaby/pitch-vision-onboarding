-- Pitch Points Reward System
-- Creates all tables for the agent reward currency system

-- 1. Global configuration
CREATE TABLE IF NOT EXISTS pitch_points_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by TEXT
);

INSERT INTO pitch_points_config (key, value, description) VALUES
    ('expiry_days', '90', 'Number of days before earned points expire'),
    ('system_enabled', 'true', 'Master switch for the Pitch Points system'),
    ('leaderboard_visible', 'true', 'Whether the leaderboard is visible to agents'),
    ('store_enabled', 'true', 'Whether the reward store is open for redemptions'),
    ('max_manager_bonus_per_day', '100', 'Max bonus points a manager can issue to one agent per day')
ON CONFLICT (key) DO NOTHING;

-- 2. Earning rules (configurable by HR)
CREATE TABLE IF NOT EXISTS pitch_points_earning_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_key TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    points_amount INTEGER NOT NULL DEFAULT 0,
    multiplier NUMERIC(4,2) DEFAULT 1.0,
    threshold_min NUMERIC(10,2),
    threshold_max NUMERIC(10,2),
    streak_count INTEGER,
    period_days INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    max_per_day INTEGER,
    max_per_week INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_earning_rules_category ON pitch_points_earning_rules(category);
CREATE INDEX IF NOT EXISTS idx_earning_rules_active ON pitch_points_earning_rules(is_active);

-- Seed default earning rules
INSERT INTO pitch_points_earning_rules (rule_key, category, label, description, points_amount, threshold_min, threshold_max, streak_count, period_days, multiplier) VALUES
    ('qa_score_85_89', 'qa_performance', 'QA Score 85-89', 'Earn points for a compliant QA score of 85-89', 10, 85, 89, NULL, NULL, 1.0),
    ('qa_score_90_94', 'qa_performance', 'QA Score 90-94', 'Earn points for a strong QA score of 90-94', 20, 90, 94, NULL, NULL, 1.0),
    ('qa_score_95_99', 'qa_performance', 'QA Score 95-99', 'Earn points for an excellent QA score of 95-99', 35, 95, 99, NULL, NULL, 1.0),
    ('qa_score_100', 'qa_performance', 'Perfect QA Score', 'Bonus points for a perfect 100 QA score', 50, 100, 100, NULL, NULL, 1.0),
    ('streak_calls_5', 'compliance_streak', '5-Call Compliance Streak', 'Five consecutive compliant calls', 15, NULL, NULL, 5, NULL, 1.0),
    ('streak_calls_10', 'compliance_streak', '10-Call Compliance Streak', 'Ten consecutive compliant calls', 40, NULL, NULL, 10, NULL, 1.0),
    ('streak_calls_25', 'compliance_streak', '25-Call Compliance Streak', 'Twenty-five consecutive compliant calls', 100, NULL, NULL, 25, NULL, 1.0),
    ('sla_tier_1', 'sla_performance', 'SLA 4-5/hr (Base)', 'Base SLA reward for 4-5 avg per hour', 10, 4.0, 4.99, NULL, NULL, 1.0),
    ('sla_tier_2', 'sla_performance', 'SLA 5-6/hr (2x)', 'Double SLA reward for 5-6 avg per hour', 20, 5.0, 5.99, NULL, NULL, 2.0),
    ('sla_tier_3', 'sla_performance', 'SLA 6+/hr (3x)', 'Triple SLA reward for 6+ avg per hour', 30, 6.0, 99.0, NULL, NULL, 3.0),
    ('attendance_perfect_week', 'attendance', 'Perfect Attendance Week', 'Zero unexcused absences for the week', 25, NULL, NULL, NULL, 7, 1.0),
    ('attendance_perfect_month', 'attendance', 'Perfect Attendance Month', 'Zero unexcused absences for the month', 100, NULL, NULL, NULL, 30, 1.0),
    ('milestone_training_complete', 'milestone', 'Training Completed', 'Completed all education training modules', 200, NULL, NULL, NULL, NULL, 1.0),
    ('milestone_tenure_90', 'milestone', '90-Day Tenure', 'Reached 90 days of employment', 100, NULL, NULL, NULL, 90, 1.0),
    ('milestone_tenure_180', 'milestone', '6-Month Tenure', 'Reached 6 months of employment', 200, NULL, NULL, NULL, 180, 1.0),
    ('milestone_tenure_365', 'milestone', '1-Year Tenure', 'Reached 1 year of employment', 500, NULL, NULL, NULL, 365, 1.0),
    ('manager_bonus', 'manual', 'Manager Bonus', 'Bonus points awarded by a manager', 0, NULL, NULL, NULL, NULL, 1.0)
ON CONFLICT (rule_key) DO NOTHING;

-- 3. Transaction ledger (immutable)
CREATE TABLE IF NOT EXISTS pitch_points_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    employee_id UUID,
    type TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'expire', 'admin_adjust', 'manager_bonus')),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    rule_id UUID REFERENCES pitch_points_earning_rules(id),
    rule_key TEXT,
    source_type TEXT,
    source_id TEXT,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    expires_at TIMESTAMPTZ,
    expired BOOLEAN DEFAULT FALSE,
    issued_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pp_txn_user ON pitch_points_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_pp_txn_type ON pitch_points_transactions(type);
CREATE INDEX IF NOT EXISTS idx_pp_txn_created ON pitch_points_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_txn_expires ON pitch_points_transactions(expires_at) WHERE expires_at IS NOT NULL AND expired = FALSE;
CREATE INDEX IF NOT EXISTS idx_pp_txn_source ON pitch_points_transactions(source_type, source_id);

-- 4. Balance cache (updated via trigger)
CREATE TABLE IF NOT EXISTS pitch_points_balance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),
    employee_id UUID,
    current_balance INTEGER NOT NULL DEFAULT 0,
    lifetime_earned INTEGER NOT NULL DEFAULT 0,
    lifetime_redeemed INTEGER NOT NULL DEFAULT 0,
    lifetime_expired INTEGER NOT NULL DEFAULT 0,
    current_streak_calls INTEGER DEFAULT 0,
    current_streak_days INTEGER DEFAULT 0,
    longest_streak_calls INTEGER DEFAULT 0,
    longest_streak_days INTEGER DEFAULT 0,
    last_streak_reset_at TIMESTAMPTZ,
    last_earned_at TIMESTAMPTZ,
    last_redeemed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pp_balance_amount ON pitch_points_balance(current_balance DESC);
CREATE INDEX IF NOT EXISTS idx_pp_balance_lifetime ON pitch_points_balance(lifetime_earned DESC);

-- 5. Store catalog
CREATE TABLE IF NOT EXISTS pitch_points_store_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN ('digital_perk', 'physical_good', 'recognition', 'experience')),
    point_cost INTEGER NOT NULL CHECK (point_cost > 0),
    image_url TEXT,
    stock_quantity INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    requires_approval BOOLEAN DEFAULT TRUE,
    fulfillment_instructions TEXT,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_pp_store_active ON pitch_points_store_items(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_pp_store_category ON pitch_points_store_items(category);

-- 6. Redemption requests
CREATE TABLE IF NOT EXISTS pitch_points_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    employee_id UUID,
    store_item_id UUID NOT NULL REFERENCES pitch_points_store_items(id),
    transaction_id UUID REFERENCES pitch_points_transactions(id),
    point_cost INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'fulfilled', 'rejected', 'cancelled')),
    agent_notes TEXT,
    hr_notes TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    fulfilled_at TIMESTAMPTZ,
    fulfilled_by UUID REFERENCES users(id),
    rejection_reason TEXT,
    refunded BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pp_redemptions_user ON pitch_points_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_pp_redemptions_status ON pitch_points_redemptions(status);
CREATE INDEX IF NOT EXISTS idx_pp_redemptions_pending ON pitch_points_redemptions(status, created_at) WHERE status = 'pending';

-- 7. SLA daily metrics (parsed from DiledIn/Chase reports)
CREATE TABLE IF NOT EXISTS sla_daily_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name TEXT NOT NULL,
    employee_id UUID,
    report_date DATE NOT NULL,
    dialer_source TEXT DEFAULT 'diledin',
    sla_avg_per_hour NUMERIC(6,2),
    total_calls INTEGER,
    total_hours_worked NUMERIC(6,2),
    raw_data JSONB DEFAULT '{}',
    parsed_at TIMESTAMPTZ DEFAULT NOW(),
    points_processed BOOLEAN DEFAULT FALSE,
    points_processed_at TIMESTAMPTZ,
    UNIQUE(agent_name, report_date, dialer_source)
);

CREATE INDEX IF NOT EXISTS idx_sla_metrics_date ON sla_daily_metrics(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_sla_metrics_employee ON sla_daily_metrics(employee_id);
CREATE INDEX IF NOT EXISTS idx_sla_metrics_unprocessed ON sla_daily_metrics(points_processed) WHERE points_processed = FALSE;

-- 8. Trigger: auto-update balance on transaction insert
CREATE OR REPLACE FUNCTION update_pitch_points_balance()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO pitch_points_balance (user_id, employee_id, current_balance, lifetime_earned, lifetime_redeemed, lifetime_expired, last_earned_at, last_redeemed_at)
    VALUES (
        NEW.user_id,
        NEW.employee_id,
        NEW.balance_after,
        CASE WHEN NEW.amount > 0 THEN NEW.amount ELSE 0 END,
        CASE WHEN NEW.type = 'redeem' THEN ABS(NEW.amount) ELSE 0 END,
        CASE WHEN NEW.type = 'expire' THEN ABS(NEW.amount) ELSE 0 END,
        CASE WHEN NEW.type IN ('earn', 'manager_bonus', 'admin_adjust') AND NEW.amount > 0 THEN NOW() ELSE NULL END,
        CASE WHEN NEW.type = 'redeem' THEN NOW() ELSE NULL END
    )
    ON CONFLICT (user_id) DO UPDATE SET
        current_balance = NEW.balance_after,
        employee_id = COALESCE(NEW.employee_id, pitch_points_balance.employee_id),
        lifetime_earned = pitch_points_balance.lifetime_earned + CASE WHEN NEW.amount > 0 THEN NEW.amount ELSE 0 END,
        lifetime_redeemed = pitch_points_balance.lifetime_redeemed + CASE WHEN NEW.type = 'redeem' THEN ABS(NEW.amount) ELSE 0 END,
        lifetime_expired = pitch_points_balance.lifetime_expired + CASE WHEN NEW.type = 'expire' THEN ABS(NEW.amount) ELSE 0 END,
        last_earned_at = CASE WHEN NEW.type IN ('earn', 'manager_bonus', 'admin_adjust') AND NEW.amount > 0 THEN NOW() ELSE pitch_points_balance.last_earned_at END,
        last_redeemed_at = CASE WHEN NEW.type = 'redeem' THEN NOW() ELSE pitch_points_balance.last_redeemed_at END,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_pitch_points_balance
AFTER INSERT ON pitch_points_transactions
FOR EACH ROW EXECUTE FUNCTION update_pitch_points_balance();

-- 9. Enable RLS (Row Level Security) for agent-facing tables
ALTER TABLE pitch_points_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE pitch_points_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pitch_points_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pitch_points_store_items ENABLE ROW LEVEL SECURITY;

-- Agents can read their own balance
CREATE POLICY "Users can view own balance" ON pitch_points_balance
    FOR SELECT USING (auth.uid()::text = user_id::text);

-- Agents can read their own transactions
CREATE POLICY "Users can view own transactions" ON pitch_points_transactions
    FOR SELECT USING (auth.uid()::text = user_id::text);

-- Agents can read their own redemptions
CREATE POLICY "Users can view own redemptions" ON pitch_points_redemptions
    FOR SELECT USING (auth.uid()::text = user_id::text);

-- Anyone authenticated can browse active store items
CREATE POLICY "Authenticated users can view active store items" ON pitch_points_store_items
    FOR SELECT USING (is_active = TRUE);

-- Service role bypasses RLS for API routes (supabaseAdmin)

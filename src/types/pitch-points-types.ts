// Pitch Points Reward System Types

export type EarningCategory =
  | 'qa_performance'
  | 'compliance_streak'
  | 'sla_performance'
  | 'attendance'
  | 'milestone'
  | 'manual';

export type TransactionType =
  | 'earn'
  | 'redeem'
  | 'expire'
  | 'admin_adjust'
  | 'manager_bonus';

export type SourceType =
  | 'qa_review'
  | 'sla_report'
  | 'attendance'
  | 'milestone'
  | 'manual'
  | 'redemption'
  | 'expiry';

export type StoreCategory =
  | 'digital_perk'
  | 'physical_good'
  | 'recognition'
  | 'experience';

export type RedemptionStatus =
  | 'pending'
  | 'approved'
  | 'fulfilled'
  | 'rejected'
  | 'cancelled';

export interface EarningRule {
  id: string;
  rule_key: string;
  category: EarningCategory;
  label: string;
  description: string | null;
  points_amount: number;
  multiplier: number;
  threshold_min: number | null;
  threshold_max: number | null;
  streak_count: number | null;
  period_days: number | null;
  is_active: boolean;
  max_per_day: number | null;
  max_per_week: number | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface PointsTransaction {
  id: string;
  user_id: string;
  employee_id: string | null;
  type: TransactionType;
  amount: number;
  balance_after: number;
  rule_id: string | null;
  rule_key: string | null;
  source_type: SourceType | null;
  source_id: string | null;
  description: string;
  metadata: Record<string, unknown>;
  expires_at: string | null;
  expired: boolean;
  issued_by: string | null;
  created_at: string;
}

export interface PointsBalance {
  id: string;
  user_id: string;
  employee_id: string | null;
  current_balance: number;
  lifetime_earned: number;
  lifetime_redeemed: number;
  lifetime_expired: number;
  current_streak_calls: number;
  current_streak_days: number;
  longest_streak_calls: number;
  longest_streak_days: number;
  last_streak_reset_at: string | null;
  last_earned_at: string | null;
  last_redeemed_at: string | null;
  updated_at: string;
}

export interface StoreItem {
  id: string;
  name: string;
  description: string | null;
  category: StoreCategory;
  point_cost: number;
  image_url: string | null;
  stock_quantity: number | null;
  is_active: boolean;
  is_featured: boolean;
  requires_approval: boolean;
  fulfillment_instructions: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface Redemption {
  id: string;
  user_id: string;
  employee_id: string | null;
  store_item_id: string;
  transaction_id: string | null;
  point_cost: number;
  status: RedemptionStatus;
  agent_notes: string | null;
  hr_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  fulfilled_at: string | null;
  fulfilled_by: string | null;
  rejection_reason: string | null;
  refunded: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  store_item?: StoreItem;
  user?: { first_name: string; last_name: string; email: string; avatar_url: string | null };
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  employee_id: string | null;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  current_balance: number;
  lifetime_earned: number;
  current_streak_calls: number;
  current_streak_days: number;
}

export interface SLADailyMetric {
  id: string;
  agent_name: string;
  employee_id: string | null;
  report_date: string;
  dialer_source: string;
  sla_avg_per_hour: number | null;
  total_calls: number | null;
  total_hours_worked: number | null;
  raw_data: Record<string, unknown>;
  points_processed: boolean;
  points_processed_at: string | null;
}

export interface PitchPointsConfig {
  expiry_days: number;
  system_enabled: boolean;
  leaderboard_visible: boolean;
  store_enabled: boolean;
  max_manager_bonus_per_day: number;
}

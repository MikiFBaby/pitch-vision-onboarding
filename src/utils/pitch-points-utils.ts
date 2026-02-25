import { supabaseAdmin } from '@/lib/supabase-admin';
import type {
  EarningRule,
  PointsTransaction,
  PointsBalance,
  PitchPointsConfig,
  TransactionType,
  SourceType,
} from '@/types/pitch-points-types';

// ── Config ──────────────────────────────────────────────────────────

export async function getConfig(): Promise<PitchPointsConfig> {
  const { data } = await supabaseAdmin
    .from('pitch_points_config')
    .select('key, value');

  const configMap: Record<string, string> = {};
  (data || []).forEach((row: { key: string; value: string }) => {
    configMap[row.key] = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
  });

  return {
    expiry_days: parseInt(configMap.expiry_days || '90', 10),
    system_enabled: configMap.system_enabled !== 'false',
    leaderboard_visible: configMap.leaderboard_visible !== 'false',
    store_enabled: configMap.store_enabled !== 'false',
    max_manager_bonus_per_day: parseInt(configMap.max_manager_bonus_per_day || '100', 10),
  };
}

// ── Balance ─────────────────────────────────────────────────────────

export async function getBalance(userId: string): Promise<PointsBalance | null> {
  const { data } = await supabaseAdmin
    .from('pitch_points_balance')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

export async function getOrCreateBalance(userId: string, employeeId?: string): Promise<PointsBalance> {
  const existing = await getBalance(userId);
  if (existing) return existing;

  const { data } = await supabaseAdmin
    .from('pitch_points_balance')
    .insert({ user_id: userId, employee_id: employeeId || null, current_balance: 0 })
    .select()
    .single();
  return data!;
}

// ── Transactions ────────────────────────────────────────────────────

interface CreateTransactionParams {
  userId: string;
  employeeId?: string | null;
  type: TransactionType;
  amount: number;
  ruleId?: string | null;
  ruleKey?: string | null;
  sourceType?: SourceType | null;
  sourceId?: string | null;
  description: string;
  metadata?: Record<string, unknown>;
  issuedBy?: string | null;
}

export async function createTransaction(params: CreateTransactionParams): Promise<PointsTransaction> {
  const balance = await getOrCreateBalance(params.userId, params.employeeId || undefined);
  const balanceAfter = balance.current_balance + params.amount;

  const config = await getConfig();
  const expiresAt = params.amount > 0 && params.type !== 'redeem'
    ? new Date(Date.now() + config.expiry_days * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data, error } = await supabaseAdmin
    .from('pitch_points_transactions')
    .insert({
      user_id: params.userId,
      employee_id: params.employeeId || null,
      type: params.type,
      amount: params.amount,
      balance_after: balanceAfter,
      rule_id: params.ruleId || null,
      rule_key: params.ruleKey || null,
      source_type: params.sourceType || null,
      source_id: params.sourceId || null,
      description: params.description,
      metadata: params.metadata || {},
      expires_at: expiresAt,
      issued_by: params.issuedBy || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create transaction: ${error.message}`);
  return data;
}

// ── FIFO Redemption ─────────────────────────────────────────────────

export async function redeemPoints(
  userId: string,
  amount: number,
  storeItemId: string,
  description: string,
  employeeId?: string | null,
): Promise<PointsTransaction> {
  const balance = await getOrCreateBalance(userId, employeeId || undefined);

  if (balance.current_balance < amount) {
    throw new Error('Insufficient balance');
  }

  // Create the debit transaction (negative amount)
  const transaction = await createTransaction({
    userId,
    employeeId,
    type: 'redeem',
    amount: -amount,
    sourceType: 'redemption',
    sourceId: storeItemId,
    description,
  });

  return transaction;
}

// ── Earning Rules ───────────────────────────────────────────────────

export async function getActiveRules(category?: string): Promise<EarningRule[]> {
  let query = supabaseAdmin
    .from('pitch_points_earning_rules')
    .select('*')
    .eq('is_active', true);

  if (category) {
    query = query.eq('category', category);
  }

  const { data } = await query.order('points_amount', { ascending: true });
  return data || [];
}

export function matchScoreToRule(score: number, rules: EarningRule[]): EarningRule | null {
  // Find the highest-value matching rule for a score
  let bestMatch: EarningRule | null = null;
  for (const rule of rules) {
    if (
      rule.threshold_min !== null &&
      rule.threshold_max !== null &&
      score >= rule.threshold_min &&
      score <= rule.threshold_max
    ) {
      if (!bestMatch || rule.points_amount > bestMatch.points_amount) {
        bestMatch = rule;
      }
    }
  }
  return bestMatch;
}

// ── Rate Limiting ───────────────────────────────────────────────────

export async function checkRateLimit(
  userId: string,
  ruleKey: string,
  maxPerDay: number | null,
  maxPerWeek: number | null,
): Promise<boolean> {
  if (!maxPerDay && !maxPerWeek) return true;

  const now = new Date();

  if (maxPerDay) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const { count } = await supabaseAdmin
      .from('pitch_points_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('rule_key', ruleKey)
      .gte('created_at', dayStart);
    if ((count || 0) >= maxPerDay) return false;
  }

  if (maxPerWeek) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const { count } = await supabaseAdmin
      .from('pitch_points_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('rule_key', ruleKey)
      .gte('created_at', weekStart.toISOString());
    if ((count || 0) >= maxPerWeek) return false;
  }

  return true;
}

// ── Streak Helpers ──────────────────────────────────────────────────

export async function updateStreak(
  userId: string,
  isCompliant: boolean,
): Promise<{ newStreak: number; streakBroken: boolean }> {
  const balance = await getOrCreateBalance(userId);

  if (isCompliant) {
    const newStreak = balance.current_streak_calls + 1;
    const longestStreak = Math.max(newStreak, balance.longest_streak_calls);

    await supabaseAdmin
      .from('pitch_points_balance')
      .update({
        current_streak_calls: newStreak,
        longest_streak_calls: longestStreak,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    return { newStreak, streakBroken: false };
  } else {
    await supabaseAdmin
      .from('pitch_points_balance')
      .update({
        current_streak_calls: 0,
        last_streak_reset_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    return { newStreak: 0, streakBroken: true };
  }
}

// ── Expiring Soon ───────────────────────────────────────────────────

export async function getExpiringSoonCount(userId: string, withinDays: number = 7): Promise<number> {
  const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabaseAdmin
    .from('pitch_points_transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('type', 'earn')
    .eq('expired', false)
    .lte('expires_at', cutoff)
    .gt('expires_at', new Date().toISOString());

  return (data || []).reduce((sum, row) => sum + row.amount, 0);
}

// ── Agent Name Matching ─────────────────────────────────────────────

export async function matchAgentNameToUser(
  agentName: string,
): Promise<{ userId: string; employeeId: string } | null> {
  const parts = agentName.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');

  // Try exact match first
  const { data: employee } = await supabaseAdmin
    .from('employee_directory')
    .select('id, email')
    .ilike('first_name', firstName)
    .ilike('last_name', lastName)
    .eq('employee_status', 'Active')
    .maybeSingle();

  if (!employee) return null;

  // Find the user account linked to this employee
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', employee.email)
    .maybeSingle();

  if (!user) return null;

  return { userId: user.id, employeeId: employee.id };
}

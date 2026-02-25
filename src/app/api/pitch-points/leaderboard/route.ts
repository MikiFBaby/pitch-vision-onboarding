import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { LeaderboardEntry } from '@/types/pitch-points-types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const period = searchParams.get('period') || 'all'; // 'all', 'month', 'week'
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);

    if (period === 'all') {
      // All-time: query from balance table (fast, pre-aggregated)
      const { data: balances, error } = await supabaseAdmin
        .from('pitch_points_balance')
        .select('user_id, employee_id, current_balance, lifetime_earned, current_streak_calls, current_streak_days')
        .order('lifetime_earned', { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Join with user names
      const userIds = (balances || []).map((b: { user_id: string }) => b.user_id);
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, first_name, last_name, avatar_url')
        .in('id', userIds);

      const userMap = new Map((users || []).map((u: { id: string; first_name: string; last_name: string; avatar_url: string | null }) => [u.id, u]));

      const leaderboard: LeaderboardEntry[] = (balances || []).map((b: { user_id: string; employee_id: string | null; current_balance: number; lifetime_earned: number; current_streak_calls: number; current_streak_days: number }, i: number) => {
        const user = userMap.get(b.user_id);
        return {
          rank: i + 1,
          user_id: b.user_id,
          employee_id: b.employee_id,
          first_name: user?.first_name || 'Unknown',
          last_name: user?.last_name || '',
          avatar_url: user?.avatar_url || null,
          current_balance: b.current_balance,
          lifetime_earned: b.lifetime_earned,
          current_streak_calls: b.current_streak_calls,
          current_streak_days: b.current_streak_days,
        };
      });

      return NextResponse.json({ success: true, leaderboard, period });
    }

    // Period-based: aggregate from transactions
    const now = new Date();
    let startDate: Date;
    if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - startDate.getDay());
      startDate.setHours(0, 0, 0, 0);
    } else {
      // month
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const { data: transactions, error } = await supabaseAdmin
      .from('pitch_points_transactions')
      .select('user_id, amount')
      .in('type', ['earn', 'manager_bonus'])
      .gt('amount', 0)
      .gte('created_at', startDate.toISOString());

    if (error) throw error;

    // Aggregate per user
    const totals = new Map<string, number>();
    (transactions || []).forEach((t: { user_id: string; amount: number }) => {
      totals.set(t.user_id, (totals.get(t.user_id) || 0) + t.amount);
    });

    // Sort and limit
    const sorted = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    const userIds = sorted.map(([uid]) => uid);
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, avatar_url')
      .in('id', userIds);

    const { data: balances } = await supabaseAdmin
      .from('pitch_points_balance')
      .select('user_id, current_balance, current_streak_calls, current_streak_days, employee_id')
      .in('user_id', userIds);

    const userMap = new Map((users || []).map((u: { id: string; first_name: string; last_name: string; avatar_url: string | null }) => [u.id, u]));
    const balanceMap = new Map((balances || []).map((b: { user_id: string; current_balance: number; current_streak_calls: number; current_streak_days: number; employee_id: string | null }) => [b.user_id, b]));

    const leaderboard: LeaderboardEntry[] = sorted.map(([uid, earned], i) => {
      const user = userMap.get(uid);
      const bal = balanceMap.get(uid);
      return {
        rank: i + 1,
        user_id: uid,
        employee_id: bal?.employee_id || null,
        first_name: user?.first_name || 'Unknown',
        last_name: user?.last_name || '',
        avatar_url: user?.avatar_url || null,
        current_balance: bal?.current_balance || 0,
        lifetime_earned: earned,
        current_streak_calls: bal?.current_streak_calls || 0,
        current_streak_days: bal?.current_streak_days || 0,
      };
    });

    return NextResponse.json({ success: true, leaderboard, period });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

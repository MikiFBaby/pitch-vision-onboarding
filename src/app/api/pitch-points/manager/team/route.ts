import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const managerId = request.nextUrl.searchParams.get('managerId');
    if (!managerId) {
      return NextResponse.json({ success: false, error: 'Missing managerId' }, { status: 400 });
    }

    // For now, show all agents' balances (team assignment can be added later)
    const { data: agents, error: agentError } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, email, avatar_url')
      .eq('role', 'agent')
      .eq('status', 'active');

    if (agentError) throw agentError;

    const agentIds = (agents || []).map((a: { id: string }) => a.id);

    const { data: balances } = await supabaseAdmin
      .from('pitch_points_balance')
      .select('*')
      .in('user_id', agentIds);

    const balanceMap = new Map(
      (balances || []).map((b: { user_id: string }) => [b.user_id, b]),
    );

    const team = (agents || []).map((agent: { id: string; first_name: string; last_name: string; email: string; avatar_url: string | null }) => ({
      ...agent,
      balance: balanceMap.get(agent.id) || {
        current_balance: 0,
        lifetime_earned: 0,
        current_streak_calls: 0,
        last_earned_at: null,
      },
    }));

    return NextResponse.json({ success: true, team });
  } catch (error) {
    console.error('Error fetching team:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

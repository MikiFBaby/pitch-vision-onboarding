import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createTransaction, getConfig } from '@/utils/pitch-points-utils';

export async function POST(request: NextRequest) {
  try {
    const { managerId, agentUserId, amount, reason } = await request.json();

    if (!managerId || !agentUserId || !amount || !reason) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: managerId, agentUserId, amount, reason' },
        { status: 400 },
      );
    }

    if (amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Amount must be positive' },
        { status: 400 },
      );
    }

    // Verify manager role
    const { data: manager } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', managerId)
      .maybeSingle();

    if (!manager || !['manager', 'hr', 'executive'].includes(manager.role)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: only managers, HR, and executives can issue bonus points' },
        { status: 403 },
      );
    }

    // Check daily limit
    const config = await getConfig();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: todayBonuses } = await supabaseAdmin
      .from('pitch_points_transactions')
      .select('amount')
      .eq('issued_by', managerId)
      .eq('user_id', agentUserId)
      .eq('type', 'manager_bonus')
      .gte('created_at', todayStart.toISOString());

    const todayTotal = (todayBonuses || []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
    if (todayTotal + amount > config.max_manager_bonus_per_day) {
      return NextResponse.json(
        { success: false, error: `Daily limit exceeded. Max ${config.max_manager_bonus_per_day} points per agent per day. Already issued ${todayTotal} today.` },
        { status: 400 },
      );
    }

    // Get agent's employee_id
    const { data: agentUser } = await supabaseAdmin
      .from('users')
      .select('first_name, last_name')
      .eq('id', agentUserId)
      .maybeSingle();

    const transaction = await createTransaction({
      userId: agentUserId,
      type: 'manager_bonus',
      amount,
      ruleKey: 'manager_bonus',
      sourceType: 'manual',
      sourceId: managerId,
      description: `Manager bonus: ${reason}`,
      metadata: { reason, issued_by_id: managerId },
      issuedBy: managerId,
    });

    return NextResponse.json({
      success: true,
      transaction,
      agent: agentUser ? `${agentUser.first_name} ${agentUser.last_name}` : agentUserId,
    });
  } catch (error) {
    console.error('Error issuing bonus:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

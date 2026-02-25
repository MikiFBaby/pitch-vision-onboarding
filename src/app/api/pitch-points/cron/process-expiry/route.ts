import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getConfig } from '@/utils/pitch-points-utils';

export async function POST() {
  try {
    const config = await getConfig();
    if (!config.system_enabled) {
      return NextResponse.json({ success: true, message: 'System disabled', expired: 0 });
    }

    const now = new Date().toISOString();

    // Find all expired earning transactions that haven't been processed
    const { data: expiredEarnings, error } = await supabaseAdmin
      .from('pitch_points_transactions')
      .select('id, user_id, employee_id, amount')
      .eq('type', 'earn')
      .eq('expired', false)
      .lt('expires_at', now)
      .gt('amount', 0)
      .order('created_at', { ascending: true });

    if (error) throw error;

    let expiredCount = 0;
    let totalExpiredPoints = 0;

    for (const earning of (expiredEarnings || [])) {
      // Get current balance
      const { data: balance } = await supabaseAdmin
        .from('pitch_points_balance')
        .select('current_balance')
        .eq('user_id', earning.user_id)
        .maybeSingle();

      const currentBalance = balance?.current_balance || 0;
      const expireAmount = Math.min(earning.amount, currentBalance);

      if (expireAmount <= 0) {
        // Just mark as expired, nothing to deduct
        await supabaseAdmin
          .from('pitch_points_transactions')
          .update({ expired: true })
          .eq('id', earning.id);
        continue;
      }

      const newBalance = currentBalance - expireAmount;

      // Create expiry transaction
      await supabaseAdmin
        .from('pitch_points_transactions')
        .insert({
          user_id: earning.user_id,
          employee_id: earning.employee_id,
          type: 'expire',
          amount: -expireAmount,
          balance_after: newBalance,
          source_type: 'expiry',
          source_id: earning.id,
          description: `Points expired (${expireAmount} points)`,
          metadata: { original_transaction_id: earning.id },
        });

      // Mark original as expired
      await supabaseAdmin
        .from('pitch_points_transactions')
        .update({ expired: true })
        .eq('id', earning.id);

      expiredCount++;
      totalExpiredPoints += expireAmount;
    }

    return NextResponse.json({
      success: true,
      expired_transactions: expiredCount,
      total_points_expired: totalExpiredPoints,
      total_checked: (expiredEarnings || []).length,
    });
  } catch (error) {
    console.error('Error processing expiry:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

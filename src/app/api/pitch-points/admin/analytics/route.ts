import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const period = request.nextUrl.searchParams.get('period') || '30d';
    const days = parseInt(period.replace('d', ''), 10) || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Total points issued
    const { data: earned } = await supabaseAdmin
      .from('pitch_points_transactions')
      .select('amount')
      .in('type', ['earn', 'manager_bonus'])
      .gt('amount', 0)
      .gte('created_at', startDate);

    const totalIssued = (earned || []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);

    // Total points redeemed
    const { data: redeemed } = await supabaseAdmin
      .from('pitch_points_transactions')
      .select('amount')
      .eq('type', 'redeem')
      .gte('created_at', startDate);

    const totalRedeemed = (redeemed || []).reduce((sum: number, t: { amount: number }) => sum + Math.abs(t.amount), 0);

    // Total points expired
    const { data: expired } = await supabaseAdmin
      .from('pitch_points_transactions')
      .select('amount')
      .eq('type', 'expire')
      .gte('created_at', startDate);

    const totalExpired = (expired || []).reduce((sum: number, t: { amount: number }) => sum + Math.abs(t.amount), 0);

    // Active participants (unique users with transactions in period)
    const { data: participants } = await supabaseAdmin
      .from('pitch_points_transactions')
      .select('user_id')
      .gte('created_at', startDate);

    const uniqueParticipants = new Set((participants || []).map((p: { user_id: string }) => p.user_id)).size;

    // Pending redemptions count
    const { count: pendingRedemptions } = await supabaseAdmin
      .from('pitch_points_redemptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Category breakdown
    const { data: categoryData } = await supabaseAdmin
      .from('pitch_points_transactions')
      .select('source_type, amount')
      .in('type', ['earn', 'manager_bonus'])
      .gt('amount', 0)
      .gte('created_at', startDate);

    const categoryBreakdown: Record<string, number> = {};
    (categoryData || []).forEach((t: { source_type: string | null; amount: number }) => {
      const cat = t.source_type || 'other';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + t.amount;
    });

    return NextResponse.json({
      success: true,
      analytics: {
        total_points_issued: totalIssued,
        total_points_redeemed: totalRedeemed,
        total_points_expired: totalExpired,
        active_participants: uniqueParticipants,
        pending_redemptions: pendingRedemptions || 0,
        category_breakdown: Object.entries(categoryBreakdown).map(([category, points]) => ({ category, points })),
        period: `${days}d`,
      },
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

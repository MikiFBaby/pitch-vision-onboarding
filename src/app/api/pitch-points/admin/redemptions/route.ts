import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createTransaction } from '@/utils/pitch-points-utils';

export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get('status');

    let query = supabaseAdmin
      .from('pitch_points_redemptions')
      .select('*, store_item:pitch_points_store_items(name, category, image_url, point_cost), user:users!pitch_points_redemptions_user_id_fkey(first_name, last_name, email, avatar_url)')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, redemptions: data || [] });
  } catch (error) {
    console.error('Error fetching redemptions:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { redemptionId, action, reviewerId, notes, rejectionReason } = await request.json();

    if (!redemptionId || !action || !reviewerId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 },
      );
    }

    const validActions = ['approve', 'reject', 'fulfill'];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { success: false, error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
        { status: 400 },
      );
    }

    // Fetch the redemption
    const { data: redemption, error: fetchError } = await supabaseAdmin
      .from('pitch_points_redemptions')
      .select('*')
      .eq('id', redemptionId)
      .single();

    if (fetchError || !redemption) {
      return NextResponse.json(
        { success: false, error: 'Redemption not found' },
        { status: 404 },
      );
    }

    const now = new Date().toISOString();

    if (action === 'approve') {
      const { error } = await supabaseAdmin
        .from('pitch_points_redemptions')
        .update({
          status: 'approved',
          reviewed_by: reviewerId,
          reviewed_at: now,
          hr_notes: notes || null,
          updated_at: now,
        })
        .eq('id', redemptionId);

      if (error) throw error;
    } else if (action === 'reject') {
      // Refund the points
      await createTransaction({
        userId: redemption.user_id,
        employeeId: redemption.employee_id,
        type: 'admin_adjust',
        amount: redemption.point_cost, // positive = refund
        sourceType: 'redemption',
        sourceId: redemptionId,
        description: `Refund: Redemption rejected${rejectionReason ? ` - ${rejectionReason}` : ''}`,
        metadata: { original_redemption_id: redemptionId },
        issuedBy: reviewerId,
      });

      const { error } = await supabaseAdmin
        .from('pitch_points_redemptions')
        .update({
          status: 'rejected',
          reviewed_by: reviewerId,
          reviewed_at: now,
          rejection_reason: rejectionReason || null,
          hr_notes: notes || null,
          refunded: true,
          updated_at: now,
        })
        .eq('id', redemptionId);

      if (error) throw error;
    } else if (action === 'fulfill') {
      const { error } = await supabaseAdmin
        .from('pitch_points_redemptions')
        .update({
          status: 'fulfilled',
          fulfilled_at: now,
          fulfilled_by: reviewerId,
          hr_notes: notes || null,
          updated_at: now,
        })
        .eq('id', redemptionId);

      if (error) throw error;
    }

    return NextResponse.json({ success: true, action, redemptionId });
  } catch (error) {
    console.error('Error processing redemption action:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

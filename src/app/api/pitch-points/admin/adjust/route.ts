import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createTransaction } from '@/utils/pitch-points-utils';

export async function POST(request: NextRequest) {
  try {
    const { userId, amount, reason, adminId } = await request.json();

    if (!userId || amount === undefined || !reason || !adminId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: userId, amount, reason, adminId' },
        { status: 400 },
      );
    }

    // Verify admin is HR or executive
    const { data: admin } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', adminId)
      .maybeSingle();

    if (!admin || !['hr', 'executive'].includes(admin.role)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: only HR and executives can make admin adjustments' },
        { status: 403 },
      );
    }

    const transaction = await createTransaction({
      userId,
      type: 'admin_adjust',
      amount,
      sourceType: 'manual',
      sourceId: adminId,
      description: `Admin adjustment: ${reason}`,
      metadata: { reason, adjusted_by: adminId },
      issuedBy: adminId,
    });

    return NextResponse.json({ success: true, transaction });
  } catch (error) {
    console.error('Error adjusting balance:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

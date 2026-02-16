import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { alertId, acknowledgedBy, notes } = await request.json();

    if (!alertId) {
      return NextResponse.json({ error: 'alertId is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('dialedin_alerts')
      .update({
        acknowledged: true,
        acknowledged_by: acknowledgedBy || 'executive',
        acknowledged_at: new Date().toISOString(),
        notes: notes || null,
      })
      .eq('id', alertId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to acknowledge alert' },
      { status: 500 },
    );
  }
}

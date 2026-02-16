import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const unacknowledged = searchParams.get('unacknowledged') === 'true';
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  try {
    let query = supabaseAdmin
      .from('dialedin_alerts')
      .select('*, dialedin_alert_rules(name, description)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (date) {
      query = query.eq('report_date', date);
    }

    if (unacknowledged) {
      query = query.eq('acknowledged', false);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch alerts' },
      { status: 500 },
    );
  }
}

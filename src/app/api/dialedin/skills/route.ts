import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  try {
    let query = supabaseAdmin
      .from('dialedin_skill_summary')
      .select('*')
      .order('total_transfers', { ascending: false });

    if (date) {
      query = query.eq('report_date', date);
    } else {
      const { data: latest } = await supabaseAdmin
        .from('dialedin_daily_kpis')
        .select('report_date')
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest) {
        query = query.eq('report_date', latest.report_date);
      }
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch skills' },
      { status: 500 },
    );
  }
}

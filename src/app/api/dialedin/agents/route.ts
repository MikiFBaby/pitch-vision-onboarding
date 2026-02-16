import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const skill = searchParams.get('skill');
  const sort = searchParams.get('sort') || 'tph';
  const limit = parseInt(searchParams.get('limit') || '100', 10);
  const ranking = searchParams.get('ranking'); // 'top' or 'bottom'

  try {
    let query = supabaseAdmin
      .from('dialedin_agent_performance')
      .select('*');

    if (date) {
      query = query.eq('report_date', date);
    } else {
      // Default: most recent date
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

    if (skill) {
      query = query.eq('skill', skill);
    }

    // Sorting
    const ascending = ranking === 'bottom';
    const sortCol = sort === 'conversion' ? 'conversion_rate'
      : sort === 'dials' ? 'dials'
      : sort === 'hours' ? 'hours_worked'
      : 'tph';

    query = query.order(sortCol, { ascending, nullsFirst: false }).limit(limit);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch agents' },
      { status: 500 },
    );
  }
}

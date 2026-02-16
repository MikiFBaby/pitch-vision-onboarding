import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const range = searchParams.get('range'); // '7d', '30d', or 'YYYY-MM-DD,YYYY-MM-DD'

  try {
    let query = supabaseAdmin
      .from('dialedin_daily_kpis')
      .select('*')
      .order('report_date', { ascending: false });

    if (date && !range) {
      query = query.eq('report_date', date);
    } else if (range) {
      if (range.includes(',')) {
        const [start, end] = range.split(',');
        query = query.gte('report_date', start).lte('report_date', end);
      } else {
        const days = parseInt(range.replace('d', ''), 10) || 7;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        query = query.gte('report_date', startDate.toISOString().split('T')[0]);
      }
    } else {
      // Default: last 7 days
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      query = query.gte('report_date', startDate.toISOString().split('T')[0]);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch KPIs' },
      { status: 500 },
    );
  }
}

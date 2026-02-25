import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { computeWoW } from '@/utils/dialedin-analytics';
import type { DailyKPIs } from '@/types/dialedin-types';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 21); // 3 weeks for safety

    const { data, error } = await supabaseAdmin
      .from('dialedin_daily_kpis')
      .select('*')
      .gte('report_date', startDate.toISOString().split('T')[0])
      .order('report_date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const kpis = (data || []) as DailyKPIs[];
    const wow = computeWoW(kpis);

    return NextResponse.json({ data: wow, daily: kpis });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to compute WoW' },
      { status: 500 },
    );
  }
}

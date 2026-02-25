import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { mean } from '@/utils/dialedin-analytics';
import type { DailyKPIs, DowHeatmapEntry } from '@/types/dialedin-types';

export const runtime = 'nodejs';

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function GET(request: NextRequest) {
  const days = parseInt(request.nextUrl.searchParams.get('days') || '30', 10);

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabaseAdmin
      .from('dialedin_daily_kpis')
      .select('report_date, transfers_per_hour, total_transfers, connect_rate, conversion_rate, total_man_hours')
      .gte('report_date', startDate.toISOString().split('T')[0])
      .order('report_date', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by day of week
    const buckets: Map<number, DailyKPIs[]> = new Map();
    for (let i = 0; i < 7; i++) buckets.set(i, []);

    for (const row of data || []) {
      const dow = new Date(row.report_date + 'T12:00:00Z').getUTCDay();
      buckets.get(dow)!.push(row as DailyKPIs);
    }

    const result: DowHeatmapEntry[] = [];
    for (let i = 0; i < 7; i++) {
      const days = buckets.get(i) || [];
      result.push({
        dow: i,
        label: DOW_LABELS[i],
        avg_tph: days.length > 0 ? mean(days.map((d) => d.transfers_per_hour)) : 0,
        avg_transfers: days.length > 0 ? mean(days.map((d) => d.total_transfers)) : 0,
        avg_connect_rate: days.length > 0 ? mean(days.map((d) => d.connect_rate)) : 0,
        avg_conversion_rate: days.length > 0 ? mean(days.map((d) => d.conversion_rate)) : 0,
        avg_hours: days.length > 0 ? mean(days.map((d) => d.total_man_hours)) : 0,
        count: days.length,
      });
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to compute DOW heatmap' },
      { status: 500 },
    );
  }
}

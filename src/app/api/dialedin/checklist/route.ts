import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { REPORT_TYPE_CONFIG, type ReportType } from '@/types/dialedin-types';

export const runtime = 'nodejs';

const ALL_REPORT_TYPES = Object.keys(REPORT_TYPE_CONFIG) as ReportType[];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json({ error: 'date parameter required' }, { status: 400 });
  }

  try {
    // Get all reports for this date
    const { data: reports, error } = await supabaseAdmin
      .from('dialedin_reports')
      .select('report_type, row_count, created_at, ingestion_status')
      .eq('report_date', date)
      .in('ingestion_status', ['processing', 'completed']);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Build lookup of received report types
    const receivedMap = new Map<string, { rows: number; receivedAt: string; status: string }>();
    for (const r of (reports || [])) {
      receivedMap.set(r.report_type, {
        rows: r.row_count || 0,
        receivedAt: r.created_at,
        status: r.ingestion_status,
      });
    }

    // Check if KPIs have been computed for this date
    const { data: kpiRow } = await supabaseAdmin
      .from('dialedin_daily_kpis')
      .select('report_date, updated_at')
      .eq('report_date', date)
      .maybeSingle();

    const received = ALL_REPORT_TYPES.filter((t) => receivedMap.has(t)).length;
    const complete = received === ALL_REPORT_TYPES.length;

    return NextResponse.json({
      date,
      received,
      total: ALL_REPORT_TYPES.length,
      complete,
      computed: !!kpiRow,
      computedAt: kpiRow?.updated_at || null,
      reports: ALL_REPORT_TYPES.map((type) => {
        const info = receivedMap.get(type);
        return info
          ? { type, received: true, rows: info.rows, receivedAt: info.receivedAt }
          : { type, received: false };
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch checklist' },
      { status: 500 },
    );
  }
}

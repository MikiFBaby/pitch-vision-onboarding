import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { subtractDays, mean } from '@/utils/dialedin-analytics';
import type { CoachingImpact } from '@/types/dialedin-types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get('event_id');
  const agentName = request.nextUrl.searchParams.get('agent');
  const window = parseInt(request.nextUrl.searchParams.get('window') || '7', 10);

  if (!eventId && !agentName) {
    return NextResponse.json({ error: 'event_id or agent parameter required' }, { status: 400 });
  }

  try {
    // Get the coaching event
    let event;
    if (eventId) {
      const { data, error } = await supabaseAdmin
        .from('dialedin_coaching_events')
        .select('*')
        .eq('id', eventId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      event = data;
    }

    if (!event) {
      return NextResponse.json({ error: 'Coaching event not found' }, { status: 404 });
    }

    const eventDate = event.event_date;
    const beforeStart = subtractDays(eventDate, window);

    // Add window days after
    const afterEnd = new Date(eventDate + 'T12:00:00Z');
    afterEnd.setUTCDate(afterEnd.getUTCDate() + window);
    const afterEndStr = afterEnd.toISOString().split('T')[0];

    // Fetch before window
    const { data: before } = await supabaseAdmin
      .from('dialedin_agent_performance')
      .select('tph, conversion_rate, connect_rate')
      .ilike('agent_name', event.agent_name)
      .gte('report_date', beforeStart)
      .lt('report_date', eventDate);

    // Fetch after window
    const { data: after } = await supabaseAdmin
      .from('dialedin_agent_performance')
      .select('tph, conversion_rate, connect_rate')
      .ilike('agent_name', event.agent_name)
      .gt('report_date', eventDate)
      .lte('report_date', afterEndStr);

    const beforeTph = mean((before || []).map((r) => Number(r.tph) || 0));
    const afterTph = mean((after || []).map((r) => Number(r.tph) || 0));
    const beforeConv = mean((before || []).map((r) => Number(r.conversion_rate) || 0));
    const afterConv = mean((after || []).map((r) => Number(r.conversion_rate) || 0));
    const beforeConnect = mean((before || []).map((r) => Number(r.connect_rate) || 0));
    const afterConnect = mean((after || []).map((r) => Number(r.connect_rate) || 0));

    const tphDelta = afterTph - beforeTph;

    const result: CoachingImpact = {
      event,
      before: {
        avg_tph: Math.round(beforeTph * 100) / 100,
        avg_conv: Math.round(beforeConv * 10) / 10,
        avg_connect: Math.round(beforeConnect * 10) / 10,
        days: (before || []).length,
      },
      after: {
        avg_tph: Math.round(afterTph * 100) / 100,
        avg_conv: Math.round(afterConv * 10) / 10,
        avg_connect: Math.round(afterConnect * 10) / 10,
        days: (after || []).length,
      },
      impact: {
        tph_delta: Math.round(tphDelta * 100) / 100,
        tph_pct_change: beforeTph > 0 ? Math.round((tphDelta / beforeTph) * 10000) / 100 : 0,
        conv_delta: Math.round((afterConv - beforeConv) * 10) / 10,
        improved: afterTph > beforeTph,
      },
    };

    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to compute coaching impact' },
      { status: 500 },
    );
  }
}

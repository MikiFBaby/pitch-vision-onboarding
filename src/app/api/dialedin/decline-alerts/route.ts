import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isExcludedTeam } from '@/utils/dialedin-revenue';
import { computeDeclineStreak } from '@/utils/dialedin-analytics';
import { getCached, setCache } from '@/utils/dialedin-cache';
import type { DeclineAlert } from '@/types/dialedin-types';

export const runtime = 'nodejs';

const CACHE_TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const days = parseInt(request.nextUrl.searchParams.get('days') || '7', 10);
  const minConsecutive = parseInt(request.nextUrl.searchParams.get('min_consecutive') || '3', 10);

  const cacheKey = `decline-alerts:${days}:${minConsecutive}`;
  const cached = getCached<DeclineAlert[]>(cacheKey);
  if (cached) return NextResponse.json({ data: cached });

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: recentPerf, error } = await supabaseAdmin
      .from('dialedin_agent_performance')
      .select('agent_name, team, report_date, tph, hours_worked')
      .gte('report_date', startDate.toISOString().split('T')[0])
      .gte('hours_worked', 2)
      .order('agent_name')
      .order('report_date', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by agent
    const grouped = new Map<string, { team: string | null; days: { tph: number }[] }>();
    for (const row of recentPerf || []) {
      if (isExcludedTeam(row.team)) continue;
      const existing = grouped.get(row.agent_name) || { team: row.team, days: [] };
      existing.days.push({ tph: Number(row.tph) || 0 });
      grouped.set(row.agent_name, existing);
    }

    const decliners: DeclineAlert[] = [];

    for (const [agent, data] of grouped) {
      if (data.days.length < minConsecutive + 1) continue;

      const tphValues = data.days.map((d) => d.tph);
      const streak = computeDeclineStreak(tphValues);

      if (streak >= minConsecutive) {
        const first = tphValues[0];
        const last = tphValues[tphValues.length - 1];
        decliners.push({
          agent_name: agent,
          team: data.team,
          consecutive_decline_days: streak,
          tph_start: Math.round(first * 100) / 100,
          tph_end: Math.round(last * 100) / 100,
          drop_pct: first > 0 ? Math.round(((first - last) / first) * 10000) / 100 : 0,
          sparkline: tphValues,
          severity: streak >= 5 ? 'critical' : 'warning',
        });
      }
    }

    decliners.sort((a, b) => b.consecutive_decline_days - a.consecutive_decline_days);

    setCache(cacheKey, decliners, CACHE_TTL);
    return NextResponse.json({ data: decliners });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to compute decline alerts' },
      { status: 500 },
    );
  }
}

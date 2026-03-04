import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isExcludedTeam } from '@/utils/dialedin-revenue';
import { buildSparkline, subtractDays, mean, std, computeConsistencyScore } from '@/utils/dialedin-analytics';
import { getCached, setCache } from '@/utils/dialedin-cache';
import { fetchNewHireSet, isNewHireAgent } from '@/utils/dialedin-new-hires';
import type { AgentTrend } from '@/types/dialedin-types';

export const runtime = 'nodejs';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const days = parseInt(searchParams.get('days') || '30', 10);
  const limit = parseInt(searchParams.get('limit') || '100', 10);
  const minHours = parseFloat(searchParams.get('min_hours') || '0');

  try {
    // Determine target date
    let targetDate = date;
    if (!targetDate) {
      const { data: latest } = await supabaseAdmin
        .from('dialedin_daily_kpis')
        .select('report_date')
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      targetDate = latest?.report_date || null;
    }

    if (!targetDate) {
      return NextResponse.json({ data: {} });
    }

    const cacheKey = `agent-trends:${targetDate}:${days}:${limit}:${minHours}`;
    const cached = getCached<Record<string, AgentTrend>>(cacheKey);
    if (cached) {
      return NextResponse.json({ data: cached });
    }

    // Step 1: Get agents for target date
    let agentQuery = supabaseAdmin
      .from('dialedin_agent_performance')
      .select('agent_name, team')
      .eq('report_date', targetDate)
      .order('tph', { ascending: false })
      .limit(limit);

    if (minHours > 0) {
      agentQuery = agentQuery.gte('hours_worked', minHours);
    }

    const { data: topAgents, error: agentErr } = await agentQuery;
    if (agentErr) {
      return NextResponse.json({ error: agentErr.message }, { status: 500 });
    }

    const newHireSet = await fetchNewHireSet(supabaseAdmin);
    const agentNames = (topAgents || [])
      .filter((a: { agent_name: string; team: string | null }) => !isExcludedTeam(a.team) && !isNewHireAgent(a.agent_name, newHireSet))
      .map((a: { agent_name: string }) => a.agent_name);

    if (agentNames.length === 0) {
      return NextResponse.json({ data: {} });
    }

    // Step 2: Fetch history for those agents
    const startDate = subtractDays(targetDate, days);
    const { data: history, error: histErr } = await supabaseAdmin
      .from('dialedin_agent_performance')
      .select('agent_name, report_date, tph, transfers, hours_worked')
      .in('agent_name', agentNames)
      .gte('report_date', startDate)
      .lte('report_date', targetDate)
      .order('report_date', { ascending: true });

    if (histErr) {
      return NextResponse.json({ error: histErr.message }, { status: 500 });
    }

    // Step 3: Group by agent and build sparklines
    const grouped = new Map<string, { report_date: string; tph: number }[]>();
    for (const row of history || []) {
      const arr = grouped.get(row.agent_name) || [];
      arr.push({ report_date: row.report_date, tph: Number(row.tph) || 0 });
      grouped.set(row.agent_name, arr);
    }

    const result: Record<string, AgentTrend> = {};

    for (const agentName of agentNames) {
      const agentHistory = grouped.get(agentName) || [];
      const tphValues = agentHistory.filter((h) => h.tph > 0).map((h) => h.tph);
      const sparkline = buildSparkline(agentHistory, startDate, targetDate);

      // Determine all dates present
      const dates: string[] = [];
      const current = new Date(startDate + 'T12:00:00Z');
      const end = new Date(targetDate + 'T12:00:00Z');
      while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setUTCDate(current.getUTCDate() + 1);
      }

      const avgTph = mean(tphValues);
      const stdTph = std(tphValues);

      // Trend: compare last 7 days avg vs prior 7 days avg
      const recentDays = tphValues.slice(-7);
      const priorDays = tphValues.slice(-14, -7);
      const recentAvg = mean(recentDays);
      const priorAvg = mean(priorDays);
      const trend: 'up' | 'down' | 'flat' =
        priorAvg === 0 ? 'flat' :
        recentAvg > priorAvg * 1.05 ? 'up' :
        recentAvg < priorAvg * 0.95 ? 'down' : 'flat';

      result[agentName] = {
        sparkline,
        dates,
        avg_tph: Math.round(avgTph * 100) / 100,
        stddev_tph: Math.round(stdTph * 100) / 100,
        consistency_score: computeConsistencyScore(tphValues),
        trend,
        days_worked: tphValues.length,
        min_tph: tphValues.length > 0 ? Math.min(...tphValues) : 0,
        max_tph: tphValues.length > 0 ? Math.max(...tphValues) : 0,
      };
    }

    setCache(cacheKey, result, CACHE_TTL);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch agent trends' },
      { status: 500 },
    );
  }
}

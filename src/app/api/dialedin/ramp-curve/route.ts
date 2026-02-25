import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { diffInDays, mean } from '@/utils/dialedin-analytics';
import { getCached, setCache } from '@/utils/dialedin-cache';
import type { RampCurveData, RampCurveAgent } from '@/types/dialedin-types';

export const runtime = 'nodejs';

const CACHE_TTL = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  const maxDays = parseInt(request.nextUrl.searchParams.get('days_since_hire') || '90', 10);

  const cacheKey = `ramp-curve:${maxDays}`;
  const cached = getCached<RampCurveData>(cacheKey);
  if (cached) return NextResponse.json({ data: cached });

  try {
    // Get recent hires (within last N days)
    const hiredAfter = new Date();
    hiredAfter.setDate(hiredAfter.getDate() - maxDays);

    const { data: newHires, error: hireErr } = await supabaseAdmin
      .from('employee_directory')
      .select('first_name, last_name, hired_at')
      .eq('employee_status', 'Active')
      .eq('role', 'Agent')
      .gte('hired_at', hiredAfter.toISOString().split('T')[0])
      .not('hired_at', 'is', null);

    if (hireErr) {
      return NextResponse.json({ error: hireErr.message }, { status: 500 });
    }

    if (!newHires || newHires.length === 0) {
      return NextResponse.json({ data: { agents: [], avg_ramp: [] } });
    }

    // Build name list for performance lookup
    const nameMap = new Map<string, string>(); // lowercase name → hire_date
    for (const h of newHires) {
      const name = `${h.first_name} ${h.last_name}`.trim();
      nameMap.set(name.toLowerCase(), typeof h.hired_at === 'string' ? h.hired_at.split('T')[0] : h.hired_at);
    }

    const nameList = Array.from(nameMap.keys());

    // Fetch performance for these agents
    const { data: performance, error: perfErr } = await supabaseAdmin
      .from('dialedin_agent_performance')
      .select('agent_name, report_date, tph, transfers, hours_worked')
      .in('agent_name', newHires.map((h) => `${h.first_name} ${h.last_name}`.trim()))
      .order('report_date', { ascending: true });

    if (perfErr) {
      return NextResponse.json({ error: perfErr.message }, { status: 500 });
    }

    // Build per-agent ramp curves
    const agents: RampCurveAgent[] = [];
    const dayBuckets = new Map<number, number[]>(); // day_number → [tph values]

    for (const [lowerName, hireDate] of nameMap) {
      const agentPerf = (performance || []).filter(
        (p) => p.agent_name.toLowerCase() === lowerName,
      );

      if (agentPerf.length === 0) continue;

      const ramp: Array<{ day: number; tph: number }> = [];
      for (const p of agentPerf) {
        const dayNum = diffInDays(p.report_date, hireDate);
        if (dayNum < 0 || dayNum > maxDays) continue;
        const tph = Number(p.tph) || 0;
        ramp.push({ day: dayNum, tph });

        // Aggregate for avg curve
        const existing = dayBuckets.get(dayNum) || [];
        existing.push(tph);
        dayBuckets.set(dayNum, existing);
      }

      if (ramp.length > 0) {
        const latest = ramp[ramp.length - 1];
        agents.push({
          name: agentPerf[0].agent_name,
          hire_date: hireDate,
          days_since_hire: diffInDays(new Date().toISOString().split('T')[0], hireDate),
          current_tph: Math.round(latest.tph * 100) / 100,
          ramp,
        });
      }
    }

    // Build average ramp curve
    const avg_ramp: Array<{ day: number; avg_tph: number; agent_count: number }> = [];
    const sortedDays = Array.from(dayBuckets.keys()).sort((a, b) => a - b);
    for (const day of sortedDays) {
      const values = dayBuckets.get(day)!;
      avg_ramp.push({
        day,
        avg_tph: Math.round(mean(values) * 100) / 100,
        agent_count: values.length,
      });
    }

    const result: RampCurveData = { agents, avg_ramp };
    setCache(cacheKey, result, CACHE_TTL);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to compute ramp curve' },
      { status: 500 },
    );
  }
}

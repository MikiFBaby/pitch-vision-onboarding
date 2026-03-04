import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchNewHireSet } from '@/utils/dialedin-new-hires';
import { getBreakEvenTPH } from '@/utils/dialedin-revenue';

export const runtime = 'nodejs';

interface SnapshotRow {
  snapshot_at: string;
  agent_name: string;
  team: string | null;
  dialed: number;
  connects: number;
  contacts: number;
  hours_worked: number;
  transfers: number;
  connects_per_hour: number;
  sla_hr: number;
  conversion_rate_pct: number;
  talk_time_min: number;
  wrap_time_min: number;
  logged_in_time_min: number;
  pause_time_min: number;
  time_avail_min: number;
}

// Break allowance prorating (same formula as dialedin-kpi.ts)
const FULL_BREAK_ALLOWANCE_MIN = 69.6;
const BREAK_ALLOWANCE_RATIO = 0.145;
function getBreakAllowanceMin(loggedInMin: number): number {
  return Math.min(FULL_BREAK_ALLOWANCE_MIN, loggedInMin * BREAK_ALLOWANCE_RATIO);
}

/** Compute adjusted SLA/hr: transfers / ((logged_in - wrap - pause + break_allowance) / 60) */
function computeAdjustedSlaHr(r: SnapshotRow): number {
  const pauseMin = r.pause_time_min || 0;
  const paidMin = r.logged_in_time_min - r.wrap_time_min - pauseMin + getBreakAllowanceMin(r.logged_in_time_min);
  const paidHrs = Math.max(paidMin, 0) / 60;
  return paidHrs > 0 ? r.transfers / paidHrs : 0;
}

/**
 * GET /api/dialedin/intraday
 *
 * Query params:
 *   date          - YYYY-MM-DD (default: today)
 *   agent         - Filter to a single agent by name (case-insensitive)
 *   team          - Filter agents by team substring (comma-separated for multi-team)
 *   include_rank  - "true" to add rank field to each agent (by adjusted SLA/hr)
 *   include_trend - "false" to omit hourly_trend (lighter payload)
 *
 * Returns intraday Agent Summary snapshots:
 * - Latest snapshot totals (SLA, production hours, agent count)
 * - Hourly trend data (SLA accumulation by hour)
 * - Agent-level breakdown from the most recent snapshot
 * - When agent filter is set: agent_hourly_trend (per-agent progression)
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const dateParam = params.get('date');
  const agentFilter = params.get('agent');
  const teamFilter = params.get('team');
  const includeRank = params.get('include_rank') === 'true';
  const includeTrend = params.get('include_trend') !== 'false'; // default true

  const today = new Date();
  const targetDate =
    dateParam ||
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Fetch ALL snapshots for the target date (for hourly trend)
  const { data: allSnapshots, error } = await supabaseAdmin
    .from('dialedin_intraday_snapshots')
    .select('*')
    .eq('snapshot_date', targetDate)
    .order('snapshot_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!allSnapshots || allSnapshots.length === 0) {
    return NextResponse.json({
      latest_snapshot_at: null,
      stale: true,
      minutes_since_update: 0,
      totals: {
        sla_total: 0,
        production_hours: 0,
        active_agents: 0,
        avg_sla_hr: 0,
        team_sla_hr: 0,
        adjusted_sla_hr: 0,
        total_dialed: 0,
        total_connects: 0,
      },
      hourly_trend: [],
      agents: [],
      break_even: { aca: getBreakEvenTPH('Jade ACA Team'), medicare: getBreakEvenTPH('Aragon Team A') },
    });
  }

  // Exclude Pitch Health (separate department) — offshore teams are kept for executive overview
  const rows = (allSnapshots as SnapshotRow[]).filter(
    (r) => !r.team || !r.team.toLowerCase().includes('pitch health'),
  );

  // Find distinct snapshot timestamps
  const snapshotTimes = [...new Set(rows.map((r) => r.snapshot_at))].sort();
  const latestTime = snapshotTimes[snapshotTimes.length - 1];

  // Get latest snapshot rows (one per agent) — always compute from ALL agents for totals/rank
  const latestRows = rows.filter((r) => r.snapshot_at === latestTime);

  // Check staleness (>10 min old — scraper runs every 5 min)
  const latestDate = new Date(latestTime);
  const minutesAgo = (Date.now() - latestDate.getTime()) / 60_000;
  const stale = minutesAgo > 10;

  // Fetch new hires to exclude from team averages
  const newHires = await fetchNewHireSet(supabaseAdmin);

  // ── Compute totals from latest snapshot (all agents, pre-filter) ──
  const slaTotal = latestRows.reduce((sum, r) => sum + r.transfers, 0);
  const productionHours = latestRows.reduce((sum, r) => sum + r.hours_worked, 0);
  const totalDialed = latestRows.reduce((sum, r) => sum + r.dialed, 0);
  const totalConnects = latestRows.reduce((sum, r) => sum + r.connects, 0);
  const activeAgents = latestRows.filter((r) => r.hours_worked > 0).length;

  // Adjusted production hours (logged_in - wrap - pause + break_allowance)
  const totalAdjustedHours = latestRows.reduce((sum, r) => {
    const pauseMin = r.pause_time_min || 0;
    const paidMin = r.logged_in_time_min - r.wrap_time_min - pauseMin + getBreakAllowanceMin(r.logged_in_time_min);
    return sum + Math.max(paidMin, 0) / 60;
  }, 0);

  // Team averages (exclude new hires)
  const veteranRows = latestRows.filter(
    (r) => r.hours_worked > 0 && !newHires.has(r.agent_name),
  );
  const avgSlaHr =
    veteranRows.length > 0
      ? veteranRows.reduce((sum, r) => sum + r.sla_hr, 0) / veteranRows.length
      : 0;
  const teamSlaHr =
    productionHours > 0 ? slaTotal / productionHours : 0;
  const adjustedSlaHr =
    totalAdjustedHours > 0 ? slaTotal / totalAdjustedHours : 0;

  // ── Build full agent list with optional rank ──
  const allAgents = latestRows
    .filter((r) => r.hours_worked > 0 || r.transfers > 0)
    .map((r) => {
      const adj = computeAdjustedSlaHr(r);
      return {
        name: r.agent_name,
        team: r.team,
        sla_hr: r.sla_hr,
        adjusted_sla_hr: Math.round(adj * 100) / 100,
        transfers: r.transfers,
        hours_worked: r.hours_worked,
        dialed: r.dialed,
        connects: r.connects,
        connects_per_hour: r.connects_per_hour,
        conversion_rate_pct: r.conversion_rate_pct,
        logged_in_time_min: r.logged_in_time_min,
        pause_time_min: r.pause_time_min || 0,
        is_new_hire: newHires.has(r.agent_name),
        rank: undefined as number | undefined,
      };
    })
    .sort((a, b) => b.adjusted_sla_hr - a.adjusted_sla_hr);

  // Assign rank if requested (computed across ALL agents before filtering)
  if (includeRank) {
    allAgents.forEach((a, i) => { a.rank = i + 1; });
  }

  // ── Apply agent/team filters ──
  let filteredAgents = allAgents;

  if (agentFilter) {
    const needle = agentFilter.toLowerCase().trim();
    filteredAgents = allAgents.filter((a) => a.name.toLowerCase().trim() === needle);
  }

  if (teamFilter) {
    const teamNeedles = teamFilter.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (teamNeedles.length > 0) {
      filteredAgents = filteredAgents.filter((a) =>
        a.team && teamNeedles.some((t) => a.team!.toLowerCase().includes(t)),
      );
    }
  }

  // ── Recompute filtered totals when team/agent filter is active ──
  let responseTotals;
  if (agentFilter || teamFilter) {
    const fSla = filteredAgents.reduce((s, a) => s + a.transfers, 0);
    const fHours = filteredAgents.reduce((s, a) => s + a.hours_worked, 0);
    const fActive = filteredAgents.filter((a) => a.hours_worked > 0).length;
    const fVeterans = filteredAgents.filter((a) => a.hours_worked > 0 && !a.is_new_hire);
    const fAvgSla = fVeterans.length > 0
      ? fVeterans.reduce((s, a) => s + a.sla_hr, 0) / fVeterans.length
      : 0;
    const fAdjValues = fVeterans.map((a) => a.adjusted_sla_hr).filter((v) => v > 0);
    const fAvgAdj = fAdjValues.length > 0
      ? fAdjValues.reduce((s, v) => s + v, 0) / fAdjValues.length
      : 0;
    responseTotals = {
      sla_total: fSla,
      production_hours: Math.round(fHours * 100) / 100,
      active_agents: fActive,
      avg_sla_hr: Math.round(fAvgSla * 100) / 100,
      team_sla_hr: fHours > 0 ? Math.round((fSla / fHours) * 100) / 100 : 0,
      adjusted_sla_hr: Math.round(fAvgAdj * 100) / 100,
      total_dialed: filteredAgents.reduce((s, a) => s + a.dialed, 0),
      total_connects: filteredAgents.reduce((s, a) => s + a.connects, 0),
    };
  } else {
    responseTotals = {
      sla_total: slaTotal,
      production_hours: Math.round(productionHours * 100) / 100,
      active_agents: activeAgents,
      avg_sla_hr: Math.round(avgSlaHr * 100) / 100,
      team_sla_hr: Math.round(teamSlaHr * 100) / 100,
      adjusted_sla_hr: Math.round(adjustedSlaHr * 100) / 100,
      total_dialed: totalDialed,
      total_connects: totalConnects,
    };
  }

  // ── Hourly trend (aggregate) ──
  let hourlyTrend: { hour: number; sla_total: number; production_hours: number; agent_count: number; snapshot_at: string }[] = [];

  if (includeTrend) {
    const hourlyMap = new Map<number, { sla_total: number; production_hours: number; agent_count: number; snapshot_at: string }>();
    for (const time of snapshotTimes) {
      let snapRows = rows.filter((r) => r.snapshot_at === time);

      // Apply same team filter to hourly trend when filtering
      if (teamFilter) {
        const teamNeedles = teamFilter.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        snapRows = snapRows.filter((r) =>
          r.team && teamNeedles.some((t) => r.team!.toLowerCase().includes(t)),
        );
      }

      const etHour = parseInt(
        new Date(time).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }),
      );

      hourlyMap.set(etHour, {
        sla_total: snapRows.reduce((s, r) => s + r.transfers, 0),
        production_hours: snapRows.reduce((s, r) => s + r.hours_worked, 0),
        agent_count: snapRows.filter((r) => r.hours_worked > 0).length,
        snapshot_at: time,
      });
    }

    hourlyTrend = Array.from(hourlyMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([hour, data]) => ({ hour, ...data }));
  }

  // ── Per-agent hourly trend (when agent filter is set) ──
  let agentHourlyTrend: { hour: number; sla_total: number; production_hours: number; agent_count: number; snapshot_at: string }[] | undefined;

  if (agentFilter && includeTrend) {
    const needle = agentFilter.toLowerCase().trim();
    const agentHourlyMap = new Map<number, { sla_total: number; production_hours: number; agent_count: number; snapshot_at: string }>();

    for (const time of snapshotTimes) {
      const agentRow = rows.find((r) => r.snapshot_at === time && r.agent_name.toLowerCase().trim() === needle);
      if (!agentRow) continue;

      const etHour = parseInt(
        new Date(time).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }),
      );

      agentHourlyMap.set(etHour, {
        sla_total: agentRow.transfers,
        production_hours: agentRow.hours_worked,
        agent_count: 1,
        snapshot_at: time,
      });
    }

    agentHourlyTrend = Array.from(agentHourlyMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([hour, data]) => ({ hour, ...data }));
  }

  // Break-even thresholds
  const breakEven = {
    aca: getBreakEvenTPH('Jade ACA Team'),
    medicare: getBreakEvenTPH('Aragon Team A'),
  };

  // ── Build response ──
  const response: Record<string, unknown> = {
    latest_snapshot_at: latestTime,
    stale,
    minutes_since_update: Math.round(minutesAgo),
    totals: responseTotals,
    agents: filteredAgents,
    break_even: breakEven,
  };

  if (includeTrend) {
    response.hourly_trend = hourlyTrend;
  }

  if (agentHourlyTrend) {
    response.agent_hourly_trend = agentHourlyTrend;
  }

  if (includeRank) {
    response.total_agents_ranked = allAgents.length;
  }

  return NextResponse.json(response);
}

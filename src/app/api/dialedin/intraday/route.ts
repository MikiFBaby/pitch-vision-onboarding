import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchNewHireSet } from '@/utils/dialedin-new-hires';
import { getBreakEvenTPH, getRevenuePerTransfer } from '@/utils/dialedin-revenue';
import { getCadToUsdRate, convertWageToUsd } from '@/utils/fx';
import { getCached, setCache } from '@/utils/dialedin-cache';
import { jsonWithCache } from '@/utils/api-cache';

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

/** Map team name to a campaign family for campaign-scoped leaderboard ranking */
function getCampaignFamily(team: string | null): string {
  if (!team) return 'other';
  const t = team.toLowerCase();
  if (t.includes('aragon') || t.includes('whatif') || t.includes('what if') || t.includes('elite') || t.includes('brandon') || t.includes('fym') || (t.includes('pitch') && !t.includes('meal'))) return 'medicare';
  if (t.includes('jade') || t.includes('aca')) return 'aca';
  if (t.includes('hospital')) return 'hospital';
  if (t.includes('home care')) return 'home_care';
  if (t.includes('meal')) return 'pitch_meals';
  return 'other';
}

const CAMPAIGN_FAMILY_LABELS: Record<string, string> = {
  medicare: 'Medicare',
  aca: 'ACA',
  hospital: 'Hospital',
  home_care: 'Home Care',
  pitch_meals: 'Pitch Meals',
  other: 'All',
};

/** Compute adjusted SLA/hr: transfers / ((logged_in - wrap - pause + break_allowance) / 60) */
function computeAdjustedSlaHr(r: SnapshotRow): number {
  const pauseMin = r.pause_time_min || 0;
  const paidMin = r.logged_in_time_min - r.wrap_time_min - pauseMin + getBreakAllowanceMin(r.logged_in_time_min);
  const paidHrs = Math.max(paidMin, 0) / 60;
  return paidHrs > 0 ? r.transfers / paidHrs : 0;
}

/** Cache key + TTL for employee_directory lookup (team inference + wages) */
const EMP_DIRECTORY_CACHE_KEY = 'emp-directory-lookup';
const EMP_DIRECTORY_TTL = 10 * 60_000; // 10 min

interface EmpLookupEntry {
  team: string | null;
  wage: number;
  country: string | null;
}

async function getEmpDirectoryLookup(): Promise<Map<string, EmpLookupEntry>> {
  const cached = getCached<[string, EmpLookupEntry][]>(EMP_DIRECTORY_CACHE_KEY);
  if (cached) return new Map(cached);

  // Single query for both team inference AND wage data (consolidates 2 queries)
  const { data: employees } = await supabaseAdmin
    .from('employee_directory')
    .select('first_name, last_name, dialedin_name, current_campaigns, hourly_wage, country, role')
    .eq('employee_status', 'Active');

  const lookup = new Map<string, EmpLookupEntry>();
  if (employees && employees.length > 0) {
    for (const emp of employees) {
      const camps = Array.isArray(emp.current_campaigns)
        ? emp.current_campaigns.join(',').toLowerCase()
        : (emp.current_campaigns || '').toLowerCase();

      let inferredTeam: string | null = null;
      if (camps) {
        if (camps.includes('aca') || camps.includes('jade')) inferredTeam = 'Jade ACA Team';
        else if (camps.includes('whatif') || camps.includes('what if')) inferredTeam = 'Team WhatIf';
        else if (camps.includes('hospital')) inferredTeam = 'Hospital';
        else if (camps.includes('home care')) inferredTeam = 'Home Care';
        else if (camps.includes('medicare')) inferredTeam = 'Aragon';
      }

      const wage = Number(emp.hourly_wage) || 0;
      const entry: EmpLookupEntry = { team: inferredTeam, wage, country: emp.country };

      if (emp.dialedin_name) {
        lookup.set(emp.dialedin_name.toLowerCase().trim(), entry);
      }
      const full = `${(emp.first_name || '').trim()} ${(emp.last_name || '').trim()}`.trim().toLowerCase();
      if (full && !lookup.has(full)) {
        lookup.set(full, entry);
      }
    }
  }

  setCache(EMP_DIRECTORY_CACHE_KEY, Array.from(lookup.entries()), EMP_DIRECTORY_TTL);
  return lookup;
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
 *   include_economics - "true" to enrich with cost/revenue (joins employee_directory wages)
 *
 * Returns intraday Agent Summary snapshots:
 * - Latest snapshot totals (SLA, production hours, agent count)
 * - Hourly trend data (SLA accumulation by hour)
 * - Agent-level breakdown from the most recent snapshot
 * - When agent filter is set: agent_hourly_trend (per-agent progression)
 */
// Cache TTLs
const TREND_CACHE_TTL = 3 * 60_000;   // 3 min — trend data changes every 5 min (scraper interval)
const AGENTS_CACHE_TTL = 60_000;       // 1 min — agent snapshot updates more frequently

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const dateParam = params.get('date');
  const agentFilter = params.get('agent');
  const teamFilter = params.get('team');
  const includeRank = params.get('include_rank') === 'true';
  const includeTrend = params.get('include_trend') !== 'false'; // default true
  const includeEconomics = params.get('include_economics') === 'true';

  // Use ET date — snapshot_date stores ET-local dates, not UTC
  const targetDate =
    dateParam ||
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  // ── Response cache: avoid re-computing identical requests within TTL ──
  const responseCacheKey = `intraday:${targetDate}:${teamFilter || 'all'}:${agentFilter || 'all'}:rank=${includeRank}:trend=${includeTrend}:econ=${includeEconomics}`;
  const cachedResponse = getCached<Record<string, unknown>>(responseCacheKey);
  if (cachedResponse) {
    return jsonWithCache(cachedResponse, 60, 120);
  }

  // ── Step 1: Find the latest snapshot timestamp for this date ──
  const { data: latestSnap } = await supabaseAdmin
    .from('dialedin_intraday_snapshots')
    .select('snapshot_at')
    .eq('snapshot_date', targetDate)
    .order('snapshot_at', { ascending: false })
    .limit(1);

  if (!latestSnap || latestSnap.length === 0) {
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

  const latestTime = latestSnap[0].snapshot_at;

  // ── Steps 2 + 4 + momentum baseline in parallel ──
  const momentumPromise = includeRank
    ? (async () => {
        const target = new Date(new Date(latestTime).getTime() - 2 * 60 * 60 * 1000).toISOString();
        const { data: oldSnap } = await supabaseAdmin
          .from('dialedin_intraday_snapshots')
          .select('snapshot_at')
          .eq('snapshot_date', targetDate)
          .lte('snapshot_at', target)
          .order('snapshot_at', { ascending: false })
          .limit(1);
        if (!oldSnap || oldSnap.length === 0) return new Map<string, number>();
        const { data: oldRows } = await supabaseAdmin
          .from('dialedin_intraday_snapshots')
          .select('agent_name, sla_hr')
          .eq('snapshot_date', targetDate)
          .eq('snapshot_at', oldSnap[0].snapshot_at);
        const map = new Map<string, number>();
        for (const r of (oldRows || [])) map.set(r.agent_name, Number(r.sla_hr) || 0);
        return map;
      })()
    : Promise.resolve(new Map<string, number>());

  const [latestDataResult, newHires, momentumBaseline] = await Promise.all([
    supabaseAdmin
      .from('dialedin_intraday_snapshots')
      .select('snapshot_at, agent_name, team, dialed, connects, contacts, hours_worked, transfers, connects_per_hour, sla_hr, conversion_rate_pct, talk_time_min, wrap_time_min, logged_in_time_min, pause_time_min, time_avail_min')
      .eq('snapshot_date', targetDate)
      .eq('snapshot_at', latestTime),
    fetchNewHireSet(supabaseAdmin),
    momentumPromise,
  ]);

  if (latestDataResult.error) {
    return NextResponse.json({ error: latestDataResult.error.message }, { status: 500 });
  }

  // Exclude Pitch Health (separate department) and QA/HR staff (internal, not agents)
  const QA_HR_PATTERN = /\b(QA|HR|HR-Assistant)$/i;
  const latestRows = ((latestDataResult.data || []) as SnapshotRow[]).filter(
    (r) => {
      if (r.team && r.team.toLowerCase().includes('pitch health')) return false;
      if (QA_HR_PATTERN.test(r.agent_name)) return false;
      return true;
    },
  );

  // ── Step 3: Team inference for agents with NULL team (cached lookup) ──
  // Also used later for economics enrichment — single cached query for both
  const empLookup = await getEmpDirectoryLookup();
  const nullTeamAgents = latestRows.filter((r) => !r.team);
  if (nullTeamAgents.length > 0) {
    for (const row of nullTeamAgents) {
      const key = row.agent_name.toLowerCase().trim();
      const emp = empLookup.get(key);
      if (emp?.team) {
        (row as { team: string | null }).team = emp.team;
      }
    }
  }

  // Check staleness (>10 min old — scraper runs every 5 min)
  const latestDate = new Date(latestTime);
  const minutesAgo = (Date.now() - latestDate.getTime()) / 60_000;
  const stale = minutesAgo > 10;

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
    (r) => r.hours_worked > 0 && !newHires.has(r.agent_name.toLowerCase().trim()),
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
      const pauseMin = r.pause_time_min || 0;
      const paidMin = r.logged_in_time_min - r.wrap_time_min - pauseMin + getBreakAllowanceMin(r.logged_in_time_min);
      return {
        name: r.agent_name,
        team: r.team,
        sla_hr: r.sla_hr,
        adjusted_sla_hr: Math.round(adj * 100) / 100,
        transfers: r.transfers,
        hours_worked: r.hours_worked,
        paid_hours: Math.round(Math.max(paidMin, 0) / 60 * 100) / 100,
        dialed: r.dialed,
        connects: r.connects,
        connects_per_hour: r.connects_per_hour,
        conversion_rate_pct: r.conversion_rate_pct,
        logged_in_time_min: r.logged_in_time_min,
        pause_time_min: pauseMin,
        is_new_hire: newHires.has(r.agent_name.toLowerCase().trim()),
        rank: undefined as number | undefined,
        campaign_rank: undefined as number | undefined,
        campaign_agents_ranked: undefined as number | undefined,
        campaign_family: undefined as string | undefined,
      };
    })
    .sort((a, b) => b.adjusted_sla_hr - a.adjusted_sla_hr);

  // Assign rank + momentum if requested (computed across ALL agents before filtering)
  if (includeRank) {
    allAgents.forEach((a, i) => { a.rank = i + 1; });

    // Campaign-scoped ranking: group by campaign family, rank within each group
    const familyGroups = new Map<string, typeof allAgents>();
    for (const agent of allAgents) {
      const family = getCampaignFamily(agent.team);
      agent.campaign_family = family;
      if (!familyGroups.has(family)) familyGroups.set(family, []);
      familyGroups.get(family)!.push(agent);
    }
    for (const [, group] of familyGroups) {
      // Already sorted by adjusted_sla_hr desc — just assign sequential rank
      group.forEach((a, i) => {
        a.campaign_rank = i + 1;
        a.campaign_agents_ranked = group.length;
      });
    }

    // Momentum: compare current sla_hr vs 2h ago
    if (momentumBaseline.size > 0) {
      for (const agent of allAgents) {
        const prev = momentumBaseline.get(agent.name);
        if (prev !== undefined) {
          (agent as Record<string, unknown>).sla_hr_2h_ago = Math.round(prev * 100) / 100;
          const delta = agent.sla_hr - prev;
          (agent as Record<string, unknown>).momentum = delta > 0.3 ? 'up' : delta < -0.3 ? 'down' : 'steady';
        }
      }
    }
  }

  // ── Economics enrichment (wage × hours = cost, transfers × rate = revenue) ──
  // Reuses empLookup (cached, no extra DB query)
  let hasEconomics = false;

  if (includeEconomics) {
    hasEconomics = true;
    const cadToUsd = await getCadToUsdRate();

    // Enrich each agent with economics from cached empLookup
    for (const agent of allAgents) {
      const key = agent.name.toLowerCase().trim();
      const emp = empLookup.get(key);
      if (emp && emp.wage > 0) {
        const wageUsd = Math.round(convertWageToUsd(emp.wage, emp.country, cadToUsd) * 100) / 100;
        const laborCost = wageUsd * agent.hours_worked;
        const revenueRate = getRevenuePerTransfer(agent.team);
        const revenueEst = agent.transfers * revenueRate;
        (agent as Record<string, unknown>).wage_usd = wageUsd;
        (agent as Record<string, unknown>).labor_cost = Math.round(laborCost * 100) / 100;
        (agent as Record<string, unknown>).cost_per_sla = agent.transfers > 0
          ? Math.round((laborCost / agent.transfers) * 100) / 100 : 0;
        (agent as Record<string, unknown>).revenue_est = Math.round(revenueEst * 100) / 100;
        (agent as Record<string, unknown>).roi = laborCost > 0
          ? Math.round((revenueEst / laborCost) * 100) / 100 : 0;
        (agent as Record<string, unknown>).wage_matched = true;
      } else {
        (agent as Record<string, unknown>).wage_matched = false;
      }
    }
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

  // ── Aggregate economics into totals ──
  if (hasEconomics) {
    const source = (agentFilter || teamFilter) ? filteredAgents : allAgents;
    const matched = source.filter((a) => (a as Record<string, unknown>).wage_matched === true);
    const unmatched = source.filter((a) => (a as Record<string, unknown>).wage_matched === false);
    const totalLaborCost = matched.reduce((s, a) => s + ((a as Record<string, unknown>).labor_cost as number || 0), 0);
    const totalRevenueEst = matched.reduce((s, a) => s + ((a as Record<string, unknown>).revenue_est as number || 0), 0);
    const totalSla = source.reduce((s, a) => s + a.transfers, 0);

    Object.assign(responseTotals, {
      total_labor_cost: Math.round(totalLaborCost * 100) / 100,
      total_revenue_est: Math.round(totalRevenueEst * 100) / 100,
      live_profit: Math.round((totalRevenueEst - totalLaborCost) * 100) / 100,
      avg_cost_per_sla: totalSla > 0 ? Math.round((totalLaborCost / totalSla) * 100) / 100 : 0,
      wage_match_pct: source.length > 0 ? Math.round((matched.length / source.length) * 1000) / 10 : 100,
      matched_agents: matched.length,
      unmatched_agents: unmatched.length,
    });
  }

  // ── Hourly trend (aggregate) ──
  // Uses Postgres RPC to aggregate in-DB — returns ~15 rows instead of fetching ~65K
  let hourlyTrend: { hour: number; sla_total: number; production_hours: number; agent_count: number; snapshot_at: string }[] = [];
  let agentHourlyTrend: { hour: number; sla_total: number; production_hours: number; agent_count: number; snapshot_at: string }[] | undefined;

  if (includeTrend) {
    // Team trend via RPC — single DB round trip replaces 7-13 paginated queries
    const { data: rpcTrend } = await supabaseAdmin.rpc('get_intraday_hourly_trend', {
      p_date: targetDate,
      p_team_filter: agentFilter ? null : (teamFilter || null),
    });

    if (rpcTrend && rpcTrend.length > 0) {
      hourlyTrend = rpcTrend.map((r: { hour: number; snapshot_at: string; sla_total: number; production_hours: number; agent_count: number }) => ({
        hour: r.hour,
        sla_total: Number(r.sla_total),
        production_hours: Number(r.production_hours),
        agent_count: Number(r.agent_count),
        snapshot_at: r.snapshot_at,
      }));
    }

    // Per-agent hourly trend (only when single agent filter is active)
    // This is a small dataset — fetch just this agent's rows
    if (agentFilter) {
      const { data: agentSnaps } = await supabaseAdmin
        .from('dialedin_intraday_snapshots')
        .select('snapshot_at, transfers, hours_worked')
        .eq('snapshot_date', targetDate)
        .ilike('agent_name', agentFilter)
        .order('snapshot_at', { ascending: true });

      if (agentSnaps && agentSnaps.length > 0) {
        const agentHourlyMap = new Map<number, { sla_total: number; production_hours: number; agent_count: number; snapshot_at: string }>();
        for (const row of agentSnaps) {
          const etHour = parseInt(
            new Date(row.snapshot_at).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }),
          );
          agentHourlyMap.set(etHour, {
            sla_total: row.transfers,
            production_hours: row.hours_worked,
            agent_count: 1,
            snapshot_at: row.snapshot_at,
          });
        }
        agentHourlyTrend = Array.from(agentHourlyMap.entries())
          .sort(([a], [b]) => a - b)
          .map(([hour, data]) => ({ hour, ...data }));
      }
    }
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
    economics_enabled: includeEconomics,
  };

  if (includeTrend) {
    response.hourly_trend = hourlyTrend;
  }

  if (agentHourlyTrend) {
    response.agent_hourly_trend = agentHourlyTrend;
  }

  if (includeRank) {
    response.total_agents_ranked = allAgents.length;
    response.campaign_family_labels = CAMPAIGN_FAMILY_LABELS;
  }

  // Cache the response — trend requests cached longer (data only changes every 5 min scraper cycle)
  const cacheTtl = includeTrend ? TREND_CACHE_TTL : AGENTS_CACHE_TTL;
  setCache(responseCacheKey, response, cacheTtl);

  return jsonWithCache(response, 60, 120);
}

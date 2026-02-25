import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getRevenuePerTransfer, getCampaignType, isExcludedTeam } from '@/utils/dialedin-revenue';
import {
  getYearStart, getMonthStart, todayStr, safeDiv,
  getMondayOfWeek, addDays,
  getDayLabel, getWeekLabel, getMonthLabel,
  bucketByWeek, bucketByMonth,
  getStartDateFromPeriod,
} from '@/utils/dialedin-analytics';
import { getCached, setCache } from '@/utils/dialedin-cache';
import type {
  RevenueSummary, TeamROI, RetreaverRevenueSummary,
  TimeSeriesBucket, VarianceSummary, VarianceDateRow,
  VarianceCampaignRow, VarianceAgentRow, TimeGranularity,
} from '@/types/dialedin-types';

export const runtime = 'nodejs';

const CACHE_TTL = 60 * 1000; // 60 seconds — supports live auto-refresh

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const period = params.get('period') || 'ytd';
  const granularity = (params.get('granularity') || 'daily') as TimeGranularity;
  const includeVariance = params.get('variance') === 'true';

  let startDate: string;
  let endDate = todayStr();

  if (period.includes(',')) {
    const [s, e] = period.split(',');
    startDate = s;
    endDate = e;
  } else {
    startDate = getStartDateFromPeriod(period);
  }

  const cacheKey = `revenue:${startDate}:${endDate}:${granularity}:${includeVariance}`;
  const cached = getCached<RevenueSummary>(cacheKey);
  if (cached) {
    return NextResponse.json({ data: cached });
  }

  try {
    // Fetch agent performance for the period
    const { data: agents, error: agentErr } = await supabaseAdmin
      .from('dialedin_agent_performance')
      .select('agent_name, team, transfers, hours_worked, dials, connects')
      .gte('report_date', startDate)
      .lte('report_date', endDate);

    if (agentErr) {
      return NextResponse.json({ error: agentErr.message }, { status: 500 });
    }

    // Fetch wages
    const { data: employees } = await supabaseAdmin
      .from('employee_directory')
      .select('first_name, last_name, hourly_wage')
      .eq('employee_status', 'Active')
      .not('hourly_wage', 'is', null);

    const wageMap = new Map<string, number>();
    for (const emp of employees || []) {
      const name = `${emp.first_name} ${emp.last_name}`.trim().toLowerCase();
      if (emp.hourly_wage != null) wageMap.set(name, Number(emp.hourly_wage));
    }

    // Fetch daily KPIs for trend chart
    const { data: dailyKpis } = await supabaseAdmin
      .from('dialedin_daily_kpis')
      .select('report_date, total_transfers, total_man_hours, total_agents')
      .gte('report_date', startDate)
      .lte('report_date', endDate)
      .order('report_date', { ascending: true });

    // Aggregate by team
    const teamMap = new Map<string, {
      transfers: number; hours: number; dials: number; connects: number;
      agents: Set<string>;
    }>();

    for (const a of agents || []) {
      if (isExcludedTeam(a.team)) continue;
      const team = a.team || 'Unassigned';
      const existing = teamMap.get(team) || {
        transfers: 0, hours: 0, dials: 0, connects: 0,
        agents: new Set<string>(),
      };
      existing.transfers += a.transfers;
      existing.hours += a.hours_worked;
      existing.dials += a.dials;
      existing.connects += a.connects;
      existing.agents.add(a.agent_name);
      teamMap.set(team, existing);
    }

    // Compute per-team revenue
    let totalRevenue = 0;
    let totalCost = 0;
    let totalTransfers = 0;
    let totalHours = 0;
    const byTeam: TeamROI[] = [];

    for (const [team, data] of teamMap) {
      const rate = getRevenuePerTransfer(team);
      const revenue = data.transfers * rate;

      const agentWages = Array.from(data.agents)
        .map((n) => wageMap.get(n.toLowerCase()))
        .filter(Boolean) as number[];
      const avgWage = agentWages.length > 0 ? agentWages.reduce((a, b) => a + b, 0) / agentWages.length : 0;
      const teamCost = data.hours * avgWage;
      const profit = revenue - teamCost;

      byTeam.push({
        team,
        campaign_type: getCampaignType(team),
        transfers: data.transfers,
        revenue: Math.round(revenue * 100) / 100,
        cost: Math.round(teamCost * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        hours: Math.round(data.hours * 10) / 10,
        agents: data.agents.size,
        tph: Math.round(safeDiv(data.transfers, data.hours) * 100) / 100,
        rev_per_hour: Math.round(safeDiv(revenue, data.hours) * 100) / 100,
        roi_pct: teamCost > 0 ? Math.round((profit / teamCost) * 10000) / 100 : 0,
      });

      totalRevenue += revenue;
      totalCost += teamCost;
      totalTransfers += data.transfers;
      totalHours += data.hours;
    }

    byTeam.sort((a, b) => b.profit - a.profit);

    // Build daily revenue trend
    const blendedRate = totalTransfers > 0 ? totalRevenue / totalTransfers : 7.0;
    const costPerHr = totalHours > 0 ? totalCost / totalHours : 0;

    const dailyRevenue = (dailyKpis || []).map((d) => {
      const rev = d.total_transfers * blendedRate;
      const cost = d.total_man_hours * costPerHr;
      return {
        date: d.report_date,
        revenue: Math.round(rev * 100) / 100,
        cost: Math.round(cost * 100) / 100,
      };
    });

    const workingDays = new Set((dailyKpis || []).map((d) => d.report_date)).size;
    const totalProfit = totalRevenue - totalCost;

    // ── Fetch Retreaver actuals (from retreaver_events directly) ──
    let retreaver: RetreaverRevenueSummary | undefined;
    try {
      retreaver = await buildRetreaverSummary(startDate, endDate);
    } catch {
      // Non-critical
    }

    // ── Build time series ──
    let timeSeries: TimeSeriesBucket[] | undefined;
    if (granularity !== 'daily' || includeVariance) {
      timeSeries = buildTimeSeries(dailyKpis || [], retreaver, granularity, blendedRate, costPerHr);
    }

    // ── Build variance ──
    let variance: VarianceSummary | undefined;
    if (includeVariance) {
      variance = await buildVariance(startDate, endDate, dailyKpis || [], retreaver, blendedRate);
    }

    const result: RevenueSummary = {
      period: { start: startDate, end: endDate },
      totals: {
        revenue: Math.round(totalRevenue * 100) / 100,
        cost: Math.round(totalCost * 100) / 100,
        profit: Math.round(totalProfit * 100) / 100,
        margin_pct: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 10000) / 100 : 0,
        total_transfers: totalTransfers,
        total_hours: Math.round(totalHours * 10) / 10,
        working_days: workingDays,
      },
      by_team: byTeam,
      daily_revenue: dailyRevenue,
      retreaver,
      time_series: timeSeries,
      variance,
    };

    setCache(cacheKey, result, CACHE_TTL);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to compute revenue' },
      { status: 500 },
    );
  }
}

// ═══════════════════════════════════════════════════════════
// Helper: Build Retreaver Summary (queries retreaver_events directly)
// ═══════════════════════════════════════════════════════════

async function buildRetreaverSummary(
  startDate: string,
  endDate: string,
): Promise<RetreaverRevenueSummary | undefined> {
  // Query retreaver_events directly (bypasses broken aggregate table)
  // Paginate since PostgREST default limit is 1000
  interface EventRow {
    revenue: number;
    payout: number;
    event_timestamp: string;
    campaign_name: string | null;
    agent_name: string | null;
    connected_secs: number | null;
    billable_minutes: number | null;
  }

  const allEvents: EventRow[] = [];
  const PAGE_SIZE = 1000; // Supabase PostgREST max rows per request
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('retreaver_events')
      .select('revenue, payout, event_timestamp, campaign_name, agent_name, connected_secs, billable_minutes')
      .gte('event_timestamp', `${startDate}T00:00:00Z`)
      .lte('event_timestamp', `${endDate}T23:59:59Z`)
      .range(from, from + PAGE_SIZE - 1);

    if (error || !data) break;
    allEvents.push(...(data as EventRow[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (allEvents.length === 0) return undefined;

  // Aggregate totals + group by date/campaign/agent in one pass
  let totalRev = 0, totalPay = 0, totalSecs = 0, totalMins = 0, totalConv = 0;
  const dateMap = new Map<string, { revenue: number; payout: number; calls: number }>();
  const campMap = new Map<string, { revenue: number; payout: number; calls: number; converted: number }>();
  const agentMap = new Map<string, { revenue: number; calls: number; campaigns: Set<string> }>();

  for (const e of allEvents) {
    const rev = Number(e.revenue) || 0;
    const pay = Number(e.payout) || 0;
    totalRev += rev;
    totalPay += pay;
    totalSecs += Number(e.connected_secs) || 0;
    totalMins += Number(e.billable_minutes) || 0;
    if (rev > 0) totalConv++;

    // By date
    const date = e.event_timestamp.slice(0, 10);
    const de = dateMap.get(date) || { revenue: 0, payout: 0, calls: 0 };
    de.revenue += rev;
    de.payout += pay;
    de.calls += 1;
    dateMap.set(date, de);

    // By campaign
    const camp = e.campaign_name || 'Unknown';
    const ce = campMap.get(camp) || { revenue: 0, payout: 0, calls: 0, converted: 0 };
    ce.revenue += rev;
    ce.payout += pay;
    ce.calls += 1;
    if (rev > 0) ce.converted++;
    campMap.set(camp, ce);

    // By agent
    if (e.agent_name) {
      const ae = agentMap.get(e.agent_name) || { revenue: 0, calls: 0, campaigns: new Set<string>() };
      ae.revenue += rev;
      ae.calls += 1;
      if (e.campaign_name) ae.campaigns.add(e.campaign_name);
      agentMap.set(e.agent_name, ae);
    }
  }

  return {
    period: { start: startDate, end: endDate },
    totals: {
      revenue: Math.round(totalRev * 100) / 100,
      payout: Math.round(totalPay * 100) / 100,
      calls: allEvents.length,
      avg_per_call: totalConv > 0 ? Math.round((totalRev / totalConv) * 100) / 100 : 0,
      avg_per_call_diluted: allEvents.length > 0 ? Math.round((totalRev / allEvents.length) * 100) / 100 : 0,
      connected_secs: Math.round(totalSecs),
      billable_minutes: Math.round(totalMins * 100) / 100,
      converted: totalConv,
    },
    by_campaign: Array.from(campMap.entries())
      .map(([campaign, d]) => ({
        campaign,
        revenue: Math.round(d.revenue * 100) / 100,
        payout: Math.round(d.payout * 100) / 100,
        calls: d.calls,
        avg_per_call: d.calls > 0 ? Math.round((d.revenue / d.calls) * 100) / 100 : 0,
        converted: d.converted,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    by_agent: Array.from(agentMap.entries())
      .map(([agent, d]) => ({
        agent,
        revenue: Math.round(d.revenue * 100) / 100,
        calls: d.calls,
        avg_per_call: d.calls > 0 ? Math.round((d.revenue / d.calls) * 100) / 100 : 0,
        campaigns: [...d.campaigns],
      }))
      .sort((a, b) => b.revenue - a.revenue),
    daily_trend: Array.from(dateMap.entries())
      .map(([date, d]) => ({
        date,
        revenue: Math.round(d.revenue * 100) / 100,
        payout: Math.round(d.payout * 100) / 100,
        calls: d.calls,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    by_state: [],
  };
}

// ═══════════════════════════════════════════════════════════
// Helper: Build Time Series Buckets
// ═══════════════════════════════════════════════════════════

interface DayRow {
  date: string;
  sla_transfers: number;
  sla_hours: number;
  sla_agents: number;
  billable_calls: number;
  actual_revenue: number;
  estimated_revenue: number;
  cost: number;
}

function buildTimeSeries(
  dailyKpis: { report_date: string; total_transfers: number; total_man_hours: number; total_agents: number }[],
  retreaver: RetreaverRevenueSummary | undefined,
  granularity: TimeGranularity,
  blendedRate: number,
  costPerHr: number,
): TimeSeriesBucket[] {
  // Build per-day lookup for Retreaver data
  const retMap = new Map<string, { calls: number; revenue: number }>();
  if (retreaver?.daily_trend) {
    for (const d of retreaver.daily_trend) {
      retMap.set(d.date, { calls: d.calls, revenue: d.revenue });
    }
  }

  // Build day rows
  const dayRows: DayRow[] = dailyKpis.map((d) => {
    const ret = retMap.get(d.report_date);
    const estRev = d.total_transfers * blendedRate;
    const cost = d.total_man_hours * costPerHr;
    return {
      date: d.report_date,
      sla_transfers: d.total_transfers,
      sla_hours: d.total_man_hours,
      sla_agents: d.total_agents,
      billable_calls: ret?.calls ?? 0,
      actual_revenue: ret?.revenue ?? 0,
      estimated_revenue: Math.round(estRev * 100) / 100,
      cost: Math.round(cost * 100) / 100,
    };
  });

  if (granularity === 'daily') {
    return dayRows.map((d) => {
      const profit = (d.actual_revenue > 0 ? d.actual_revenue : d.estimated_revenue) - d.cost;
      return {
        bucket_start: d.date,
        bucket_label: getDayLabel(d.date),
        sla_transfers: d.sla_transfers,
        billable_calls: d.billable_calls,
        estimated_revenue: d.estimated_revenue,
        actual_revenue: d.actual_revenue,
        cost: d.cost,
        profit: Math.round(profit * 100) / 100,
        hours: Math.round(d.sla_hours * 10) / 10,
        agents: d.sla_agents,
        rev_per_hour: d.sla_hours > 0
          ? Math.round(((d.actual_revenue > 0 ? d.actual_revenue : d.estimated_revenue) / d.sla_hours) * 100) / 100
          : 0,
      };
    });
  }

  // Group by week or month
  const groups = granularity === 'weekly'
    ? bucketByWeek(dayRows)
    : bucketByMonth(dayRows);

  const buckets: TimeSeriesBucket[] = [];
  for (const [key, rows] of groups) {
    const slaTransfers = rows.reduce((s, r) => s + r.sla_transfers, 0);
    const billableCalls = rows.reduce((s, r) => s + r.billable_calls, 0);
    const estRev = rows.reduce((s, r) => s + r.estimated_revenue, 0);
    const actRev = rows.reduce((s, r) => s + r.actual_revenue, 0);
    const cost = rows.reduce((s, r) => s + r.cost, 0);
    const hours = rows.reduce((s, r) => s + r.sla_hours, 0);
    const agents = Math.round(rows.reduce((s, r) => s + r.sla_agents, 0) / rows.length);
    const bestRev = actRev > 0 ? actRev : estRev;
    const profit = bestRev - cost;

    buckets.push({
      bucket_start: granularity === 'weekly' ? key : `${key}-01`,
      bucket_label: granularity === 'weekly' ? getWeekLabel(key) : getMonthLabel(key),
      sla_transfers: slaTransfers,
      billable_calls: billableCalls,
      estimated_revenue: Math.round(estRev * 100) / 100,
      actual_revenue: Math.round(actRev * 100) / 100,
      cost: Math.round(cost * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      hours: Math.round(hours * 10) / 10,
      agents,
      rev_per_hour: hours > 0 ? Math.round((bestRev / hours) * 100) / 100 : 0,
    });
  }

  return buckets.sort((a, b) => a.bucket_start.localeCompare(b.bucket_start));
}

// ═══════════════════════════════════════════════════════════
// Helper: Build Variance Summary
// ═══════════════════════════════════════════════════════════

async function buildVariance(
  startDate: string,
  endDate: string,
  dailyKpis: { report_date: string; total_transfers: number; total_man_hours: number; total_agents: number }[],
  retreaver: RetreaverRevenueSummary | undefined,
  blendedRate: number,
): Promise<VarianceSummary> {
  // Build per-date Retreaver lookup
  const retDateMap = new Map<string, { calls: number; revenue: number }>();
  if (retreaver?.daily_trend) {
    for (const d of retreaver.daily_trend) {
      retDateMap.set(d.date, { calls: d.calls, revenue: d.revenue });
    }
  }

  // By date
  const byDate: VarianceDateRow[] = dailyKpis.map((d) => {
    const ret = retDateMap.get(d.report_date);
    const sla = d.total_transfers;
    const bill = ret?.calls ?? 0;
    const estRev = sla * blendedRate;
    const actRev = ret?.revenue ?? 0;
    return {
      date: d.report_date,
      sla_transfers: sla,
      billable_calls: bill,
      gap: sla - bill,
      conversion_rate: sla > 0 ? Math.round((bill / sla) * 10000) / 100 : 0,
      estimated_revenue: Math.round(estRev * 100) / 100,
      actual_revenue: Math.round(actRev * 100) / 100,
    };
  });

  // By campaign — match Retreaver campaigns against SLA campaign types
  const byCampaign: VarianceCampaignRow[] = [];
  if (retreaver?.by_campaign) {
    for (const rc of retreaver.by_campaign) {
      byCampaign.push({
        campaign: rc.campaign,
        sla_transfers: 0, // SLA doesn't break down by Retreaver campaign
        billable_calls: rc.calls,
        gap: 0,
        conversion_rate: 0,
        estimated_revenue: 0,
        actual_revenue: Math.round(rc.revenue * 100) / 100,
      });
    }
  }

  // By agent — try RPC first, fall back to client-side join
  let byAgent: VarianceAgentRow[] = [];
  try {
    const { data: agentVariance } = await supabaseAdmin.rpc('revenue_variance_by_agent', {
      start_date: startDate,
      end_date: endDate,
    });

    if (agentVariance && agentVariance.length > 0) {
      byAgent = agentVariance.map((a: Record<string, unknown>) => {
        const sla = Number(a.sla_transfers) || 0;
        const bill = Number(a.retreaver_calls) || 0;
        const estRev = sla * blendedRate;
        const actRev = Number(a.retreaver_revenue) || 0;
        return {
          agent_name: a.agent_name as string,
          team: (a.team as string) || null,
          sla_transfers: sla,
          billable_calls: bill,
          gap: sla - bill,
          conversion_rate: sla > 0 ? Math.round((bill / sla) * 10000) / 100 : 0,
          estimated_revenue: Math.round(estRev * 100) / 100,
          actual_revenue: Math.round(actRev * 100) / 100,
        };
      });
    }
  } catch {
    // RPC not yet deployed — that's fine, byAgent stays empty
  }

  // Compute totals
  const totalSLA = byDate.reduce((s, d) => s + d.sla_transfers, 0);
  const totalBill = byDate.reduce((s, d) => s + d.billable_calls, 0);
  const totalEstRev = byDate.reduce((s, d) => s + d.estimated_revenue, 0);
  const totalActRev = byDate.reduce((s, d) => s + d.actual_revenue, 0);

  return {
    totals: {
      sla_transfers: totalSLA,
      billable_calls: totalBill,
      gap: totalSLA - totalBill,
      conversion_rate: totalSLA > 0 ? Math.round((totalBill / totalSLA) * 10000) / 100 : 0,
      estimated_revenue: Math.round(totalEstRev * 100) / 100,
      actual_revenue: Math.round(totalActRev * 100) / 100,
      revenue_variance: Math.round((totalActRev - totalEstRev) * 100) / 100,
    },
    by_date: byDate,
    by_campaign: byCampaign,
    by_agent: byAgent.slice(0, 50),
  };
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isExcludedTeam, getCampaignType, getRevenuePerTransfer } from "@/utils/dialedin-revenue";
import type { AgentTier, AgentQAStats, RosterAgent, RosterTeamSummary } from "@/types/dialedin-types";

export const runtime = "nodejs";

function parsePeriod(period: string): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);

  if (period === "ytd") {
    return { startDate: `${now.getFullYear()}-01-01`, endDate };
  }
  if (period === "mtd") {
    return {
      startDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
      endDate,
    };
  }
  if (period.includes(",")) {
    const [s, e] = period.split(",");
    return { startDate: s, endDate: e };
  }
  if (period.endsWith("d")) {
    const days = parseInt(period) || 30;
    const d = new Date();
    d.setDate(d.getDate() - days);
    return { startDate: d.toISOString().slice(0, 10), endDate };
  }
  // Default 30d
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return { startDate: d.toISOString().slice(0, 10), endDate };
}

function computeTier(pnlPerHour: number, avgTph: number, totalHours: number): AgentTier {
  // Need minimum 8 hours total to tier (avoid noisy short-timers)
  if (totalHours < 8) return "D";
  if (avgTph < 2.0 || pnlPerHour < 0) return "D";
  if (avgTph < 3.0) return "C";
  if (avgTph < 4.5) return "B";
  if (avgTph < 6.0) return "A";
  return "S";
}

function computeTrend(sparkline: number[]): { trend: "up" | "down" | "flat"; pct: number } {
  if (sparkline.length < 4) return { trend: "flat", pct: 0 };
  const mid = Math.floor(sparkline.length / 2);
  const recent = sparkline.slice(mid);
  const prior = sparkline.slice(0, mid);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
  if (priorAvg === 0) return { trend: "flat", pct: 0 };
  const pct = ((recentAvg - priorAvg) / priorAvg) * 100;
  if (pct > 5) return { trend: "up", pct: Math.round(pct * 10) / 10 };
  if (pct < -5) return { trend: "down", pct: Math.round(pct * 10) / 10 };
  return { trend: "flat", pct: Math.round(pct * 10) / 10 };
}

// ── Paginated fetchers (avoids Supabase 1000-row silent cap) ──

interface PerfRow {
  agent_name: string;
  team: string | null;
  employee_id: string | null;
  report_date: string;
  transfers: number;
  hours_worked: number;
  tph: number;
  conversion_rate: number | null;
  dials: number;
  connects: number;
}

async function fetchAllRosterPerf(startDate: string, endDate: string): Promise<PerfRow[]> {
  const all: PerfRow[] = [];
  const PAGE = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("dialedin_agent_performance")
      .select("agent_name, team, employee_id, report_date, transfers, hours_worked, tph, conversion_rate, dials, connects")
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .range(from, from + PAGE - 1);

    if (error) throw error;
    if (!data) break;
    all.push(...(data as PerfRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

interface QARow {
  agent_name: string;
  compliance_score: number | null;
  auto_fail_triggered: boolean | null;
  auto_fail_overridden: boolean | null;
  risk_level: string | null;
  language_assessment: Record<string, unknown> | null;
  created_at: string;
}

async function fetchAllRosterQA(startDate: string, endDate: string): Promise<QARow[]> {
  const all: QARow[] = [];
  const PAGE = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("qa_call_analyses")
      .select("agent_name, compliance_score, auto_fail_triggered, auto_fail_overridden, risk_level, language_assessment, created_at")
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59`)
      .range(from, from + PAGE - 1);

    if (error) throw error;
    if (!data) break;
    all.push(...(data as QARow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

// ── QA aggregation per agent ──

interface QAAggregate {
  total_score: number;
  count: number;
  auto_fail_count: number;
  auto_fail_overridden_count: number;
  risk_high: number;
  risk_medium: number;
  risk_low: number;
  latest_date: string;
  // Language assessment accumulators
  prof_total: number;
  prof_count: number;
  empathy_total: number;
  empathy_count: number;
  clarity_total: number;
  clarity_count: number;
  pace_counts: Record<string, number>;
  tone_keywords: Map<string, number>;
}

function buildQAStats(agg: QAAggregate): AgentQAStats & {
  qa_language: {
    professionalism: number | null;
    empathy: number | null;
    clarity: number | null;
    pace: string | null;
    tone_keywords: string[];
  };
} {
  const avgScore = agg.count > 0 ? Math.round(agg.total_score / agg.count) : 0;
  const autoFailRate = agg.count > 0 ? Math.round((agg.auto_fail_count / agg.count) * 1000) / 10 : 0;
  const passRate = agg.count > 0
    ? Math.round(((agg.count - agg.auto_fail_count) / agg.count) * 1000) / 10
    : 0;

  // Dominant pace
  let dominantPace: string | null = null;
  let maxPaceCount = 0;
  for (const [pace, cnt] of Object.entries(agg.pace_counts)) {
    if (cnt > maxPaceCount) {
      maxPaceCount = cnt;
      dominantPace = pace;
    }
  }

  // Top tone keywords (by frequency, max 5)
  const sortedKeywords = Array.from(agg.tone_keywords.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([kw]) => kw);

  return {
    agent_name: "", // filled by caller
    total_calls: agg.count,
    avg_score: avgScore,
    auto_fail_count: agg.auto_fail_count,
    auto_fail_rate: autoFailRate,
    risk_breakdown: { high: agg.risk_high, medium: agg.risk_medium, low: agg.risk_low },
    latest_call_date: agg.latest_date,
    pass_rate: passRate,
    qa_language: {
      professionalism: agg.prof_count > 0 ? Math.round((agg.prof_total / agg.prof_count) * 10) / 10 : null,
      empathy: agg.empathy_count > 0 ? Math.round((agg.empathy_total / agg.empathy_count) * 10) / 10 : null,
      clarity: agg.clarity_count > 0 ? Math.round((agg.clarity_total / agg.clarity_count) * 10) / 10 : null,
      pace: dominantPace,
      tone_keywords: sortedKeywords,
    },
  };
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const period = sp.get("period") || "30d";
  const tierFilter = sp.get("tier"); // S, A, B, C, D
  const teamFilter = sp.get("team");
  const profitFilter = sp.get("profit"); // "positive" | "negative"

  const { startDate, endDate } = parsePeriod(period);

  try {
    // Parallel fetches — perf and QA use paginated helpers
    const [perfData, empResult, payrollResult, qaData] = await Promise.all([
      fetchAllRosterPerf(startDate, endDate),

      // 2. Employee directory (wages, country, hire dates, avatar)
      supabaseAdmin
        .from("employee_directory")
        .select("id, first_name, last_name, hourly_wage, country, hired_at, employee_status, user_image")
        .eq("employee_status", "Active"),

      // 3. Payroll data for true cost
      supabaseAdmin
        .from("payroll_periods")
        .select("employee_id, agent_name, hours_worked, total_pay, hourly_rate")
        .gte("period_end", startDate)
        .lte("period_start", endDate),

      fetchAllRosterQA(startDate, endDate),
    ]);

    const employees = empResult.data || [];
    const payrollData = payrollResult.data || [];

    // Build employee lookup
    const empById = new Map<string, (typeof employees)[0]>();
    for (const emp of employees) {
      empById.set(emp.id, emp);
    }

    // Build payroll lookup by employee_id
    const payrollByEmp = new Map<string, { total_pay: number; hours: number; rate: number }>();
    for (const p of payrollData) {
      if (!p.employee_id) continue;
      const existing = payrollByEmp.get(p.employee_id);
      if (existing) {
        existing.total_pay += p.total_pay || 0;
        existing.hours += p.hours_worked || 0;
      } else {
        payrollByEmp.set(p.employee_id, {
          total_pay: p.total_pay || 0,
          hours: p.hours_worked || 0,
          rate: p.hourly_rate || 0,
        });
      }
    }

    // Build QA lookup with full aggregation
    const qaByAgent = new Map<string, QAAggregate>();
    for (const q of qaData) {
      if (!q.agent_name) continue;
      let agg = qaByAgent.get(q.agent_name);
      if (!agg) {
        agg = {
          total_score: 0, count: 0,
          auto_fail_count: 0, auto_fail_overridden_count: 0,
          risk_high: 0, risk_medium: 0, risk_low: 0,
          latest_date: q.created_at,
          prof_total: 0, prof_count: 0,
          empathy_total: 0, empathy_count: 0,
          clarity_total: 0, clarity_count: 0,
          pace_counts: {},
          tone_keywords: new Map(),
        };
        qaByAgent.set(q.agent_name, agg);
      }

      if (q.compliance_score != null) {
        agg.total_score += q.compliance_score;
        agg.count++;
      }
      if (q.auto_fail_triggered) agg.auto_fail_count++;
      if (q.auto_fail_overridden) agg.auto_fail_overridden_count++;

      const risk = (q.risk_level || "").toLowerCase();
      if (risk === "high") agg.risk_high++;
      else if (risk === "medium") agg.risk_medium++;
      else if (risk === "low") agg.risk_low++;

      if (q.created_at > agg.latest_date) agg.latest_date = q.created_at;

      // Language assessment extraction
      const la = q.language_assessment;
      if (la) {
        const prof = typeof la.professionalism_score === "number" ? la.professionalism_score : null;
        if (prof != null) { agg.prof_total += prof; agg.prof_count++; }

        const emp = typeof la.empathy_displayed === "number" ? la.empathy_displayed
          : typeof la.empathy === "number" ? la.empathy : null;
        if (emp != null) { agg.empathy_total += emp; agg.empathy_count++; }

        const clar = typeof la.clarity === "number" ? la.clarity : null;
        if (clar != null) { agg.clarity_total += clar; agg.clarity_count++; }

        const pace = typeof la.pace === "string" ? la.pace : null;
        if (pace) agg.pace_counts[pace] = (agg.pace_counts[pace] || 0) + 1;

        const keywords = Array.isArray(la.tone_keywords) ? la.tone_keywords : [];
        for (const kw of keywords) {
          if (typeof kw === "string") {
            agg.tone_keywords.set(kw.toLowerCase(), (agg.tone_keywords.get(kw.toLowerCase()) || 0) + 1);
          }
        }
      }
    }

    // Aggregate performance by agent
    const agentMap = new Map<string, {
      agent_name: string;
      team: string | null;
      employee_id: string | null;
      dates: Set<string>;
      total_transfers: number;
      total_hours: number;
      total_dials: number;
      total_connects: number;
      conversion_sum: number;
      conversion_count: number;
      sparkline_map: Map<string, number>; // date → tph
    }>();

    for (const row of perfData) {
      if (isExcludedTeam(row.team)) continue;

      const key = row.agent_name;
      let agent = agentMap.get(key);
      if (!agent) {
        agent = {
          agent_name: row.agent_name,
          team: row.team,
          employee_id: row.employee_id,
          dates: new Set(),
          total_transfers: 0,
          total_hours: 0,
          total_dials: 0,
          total_connects: 0,
          conversion_sum: 0,
          conversion_count: 0,
          sparkline_map: new Map(),
        };
        agentMap.set(key, agent);
      }

      // Prefer non-null team
      if (!agent.team && row.team) agent.team = row.team;
      if (!agent.employee_id && row.employee_id) agent.employee_id = row.employee_id;

      agent.dates.add(row.report_date);
      agent.total_transfers += row.transfers || 0;
      agent.total_hours += row.hours_worked || 0;
      agent.total_dials += row.dials || 0;
      agent.total_connects += row.connects || 0;
      if (row.conversion_rate != null) {
        agent.conversion_sum += row.conversion_rate;
        agent.conversion_count++;
      }

      // Accumulate TPH per date for sparkline
      const existing = agent.sparkline_map.get(row.report_date) || 0;
      agent.sparkline_map.set(row.report_date, existing + (row.tph || 0));
    }

    // Build roster agents
    const roster: RosterAgent[] = [];
    const today = new Date();

    for (const [, agg] of agentMap) {
      const daysWorked = agg.dates.size;
      const avgTph = agg.total_hours > 0 ? agg.total_transfers / agg.total_hours : 0;
      const avgTransfers = daysWorked > 0 ? agg.total_transfers / daysWorked : 0;
      const avgHours = daysWorked > 0 ? agg.total_hours / daysWorked : 0;
      const avgConversion = agg.conversion_count > 0
        ? agg.conversion_sum / agg.conversion_count
        : 0;

      // Revenue
      const revenuePerTransfer = getRevenuePerTransfer(agg.team);
      const estRevenue = agg.total_transfers * revenuePerTransfer;

      // Cost
      const emp = agg.employee_id ? empById.get(agg.employee_id) : null;
      const wage = emp?.hourly_wage ?? null;
      const estCost = wage != null ? agg.total_hours * wage : 0;

      // True cost from payroll
      const payroll = agg.employee_id ? payrollByEmp.get(agg.employee_id) : null;
      const trueCost = payroll ? payroll.total_pay : null;

      // P&L uses true cost when available, else estimated
      const cost = trueCost ?? estCost;
      const pnl = estRevenue - cost;
      const pnlPerHour = agg.total_hours > 0 ? pnl / agg.total_hours : 0;
      const roiPct = cost > 0 ? ((estRevenue / cost) - 1) * 100 : 0;

      // Sparkline (ordered by date)
      const sortedDates = Array.from(agg.sparkline_map.keys()).sort();
      const sparkline = sortedDates.map((d) => Math.round((agg.sparkline_map.get(d) || 0) * 100) / 100);
      const { trend, pct: trendPct } = computeTrend(sparkline);

      // Tier
      const tier = computeTier(pnlPerHour, avgTph, agg.total_hours);

      // QA — full stats + language
      const qaAgg = qaByAgent.get(agg.agent_name);
      const qaScore = qaAgg && qaAgg.count > 0 ? Math.round(qaAgg.total_score / qaAgg.count) : null;
      let qaStats: AgentQAStats | null = null;
      let qaLanguage: RosterAgent["qa_language"] = null;

      if (qaAgg && qaAgg.count > 0) {
        const built = buildQAStats(qaAgg);
        built.agent_name = agg.agent_name;
        qaStats = {
          agent_name: built.agent_name,
          total_calls: built.total_calls,
          avg_score: built.avg_score,
          auto_fail_count: built.auto_fail_count,
          auto_fail_rate: built.auto_fail_rate,
          risk_breakdown: built.risk_breakdown,
          latest_call_date: built.latest_call_date,
          pass_rate: built.pass_rate,
        };
        qaLanguage = built.qa_language;
      }

      // Hire date / days active
      const hireDate = emp?.hired_at ?? null;
      let daysActive = 0;
      if (hireDate) {
        daysActive = Math.floor((today.getTime() - new Date(hireDate).getTime()) / (1000 * 60 * 60 * 24));
      }

      const rosterAgent: RosterAgent = {
        agent_name: agg.agent_name,
        employee_id: agg.employee_id,
        team: agg.team,
        campaign_type: getCampaignType(agg.team),
        country: emp?.country ?? null,
        hire_date: hireDate,
        days_active: daysActive,
        avg_tph: Math.round(avgTph * 100) / 100,
        avg_transfers: Math.round(avgTransfers * 100) / 100,
        avg_hours: Math.round(avgHours * 100) / 100,
        avg_conversion: Math.round(avgConversion * 100) / 100,
        total_transfers: agg.total_transfers,
        total_hours: Math.round(agg.total_hours * 100) / 100,
        total_dials: agg.total_dials,
        total_connects: agg.total_connects,
        days_worked: daysWorked,
        est_revenue: Math.round(estRevenue * 100) / 100,
        hourly_wage: wage != null ? Number(wage) : null,
        est_cost: Math.round(estCost * 100) / 100,
        true_cost: trueCost != null ? Math.round(trueCost * 100) / 100 : null,
        pnl: Math.round(pnl * 100) / 100,
        pnl_per_hour: Math.round(pnlPerHour * 100) / 100,
        roi_pct: Math.round(roiPct * 10) / 10,
        tier,
        sparkline,
        trend,
        trend_pct: trendPct,
        qa_score: qaScore,
        qa_stats: qaStats,
        qa_language: qaLanguage,
        user_image: emp?.user_image ?? null,
      };

      // Apply filters
      if (tierFilter && rosterAgent.tier !== tierFilter) continue;
      if (teamFilter && rosterAgent.team !== teamFilter) continue;
      if (profitFilter === "positive" && rosterAgent.pnl <= 0) continue;
      if (profitFilter === "negative" && rosterAgent.pnl >= 0) continue;

      roster.push(rosterAgent);
    }

    // Sort by P&L per hour descending
    roster.sort((a, b) => b.pnl_per_hour - a.pnl_per_hour);

    // Compute team summaries
    const teamMap = new Map<string, RosterTeamSummary>();
    for (const agent of roster) {
      const team = agent.team || "Unknown";
      let ts = teamMap.get(team);
      if (!ts) {
        ts = {
          team,
          campaign_type: agent.campaign_type,
          agent_count: 0,
          total_revenue: 0,
          total_cost: 0,
          net_pnl: 0,
          avg_pnl_per_hour: 0,
          avg_tph: 0,
          total_transfers: 0,
          total_hours: 0,
        };
        teamMap.set(team, ts);
      }
      ts.agent_count++;
      ts.total_revenue += agent.est_revenue;
      ts.total_cost += agent.true_cost ?? agent.est_cost;
      ts.net_pnl += agent.pnl;
      ts.total_transfers += agent.total_transfers;
      ts.total_hours += agent.total_hours;
    }

    const teams: RosterTeamSummary[] = Array.from(teamMap.values()).map((ts) => ({
      ...ts,
      avg_pnl_per_hour: ts.total_hours > 0 ? Math.round((ts.net_pnl / ts.total_hours) * 100) / 100 : 0,
      avg_tph: ts.total_hours > 0 ? Math.round((ts.total_transfers / ts.total_hours) * 100) / 100 : 0,
      total_revenue: Math.round(ts.total_revenue * 100) / 100,
      total_cost: Math.round(ts.total_cost * 100) / 100,
      net_pnl: Math.round(ts.net_pnl * 100) / 100,
    }));
    teams.sort((a, b) => b.net_pnl - a.net_pnl);

    // Tier counts
    const tierCounts: Record<AgentTier, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    for (const a of roster) tierCounts[a.tier]++;

    // Totals
    const totalRevenue = roster.reduce((s, a) => s + a.est_revenue, 0);
    const totalCost = roster.reduce((s, a) => s + (a.true_cost ?? a.est_cost), 0);

    return NextResponse.json({
      roster,
      teams,
      period: { start: startDate, end: endDate },
      summary: {
        total_agents: roster.length,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        total_cost: Math.round(totalCost * 100) / 100,
        net_pnl: Math.round((totalRevenue - totalCost) * 100) / 100,
        tier_counts: tierCounts,
      },
    });
  } catch (err) {
    console.error("Roster API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch roster" },
      { status: 500 },
    );
  }
}

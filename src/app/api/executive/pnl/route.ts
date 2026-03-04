import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCached, setCache } from "@/utils/dialedin-cache";
import { getCadToUsdRate, convertWageToUsd } from "@/utils/fx";
import { fetchNewHireSet, isNewHireAgent } from "@/utils/dialedin-new-hires";

export const runtime = "nodejs";

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface EventRow {
  revenue: number;
  payout: number;
  event_timestamp: string;
  campaign_name: string | null;
  agent_name: string | null;
  converted: boolean | null;
}

interface PerfRow {
  report_date: string;
  agent_name: string;
  skill?: string | null;
  team?: string | null;
  transfers: number;
  hours_worked: number;
  paid_time_hours?: number | null;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const dimension = sp.get("dimension") || "total"; // total | campaign | agent | team

  // Parse date range
  const now = new Date();
  const period = sp.get("period") || "mtd";
  let startDate: string;
  let endDate = now.toISOString().slice(0, 10);

  if (period === "ytd") {
    startDate = `${now.getFullYear()}-01-01`;
  } else if (period === "mtd") {
    startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  } else if (period.includes(",")) {
    const [s, e] = period.split(",");
    startDate = s;
    endDate = e;
  } else if (period.endsWith("d")) {
    const days = parseInt(period) || 30;
    const d = new Date();
    d.setDate(d.getDate() - days);
    startDate = d.toISOString().slice(0, 10);
  } else {
    startDate = `${now.getFullYear()}-01-01`;
  }

  const cacheKey = `pnl:${startDate}:${endDate}:${dimension}`;
  const cached = getCached<{ summary: unknown; breakdown: unknown; trend: unknown }>(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    // Parallel fetches: Retreaver revenue, DialedIn performance, cost config, labor data
    const [revenueResult, allPerfData, costsResult, laborResult, newHireSet] = await Promise.all([
      // 1. Retreaver revenue events
      fetchAllRetreaverEvents(startDate, endDate),
      // 2. DialedIn performance (hours, transfers) — paginated to avoid 1000-row default limit
      fetchAllPerfData(startDate, endDate),
      // 3. Active cost configs (table may not exist — data will be null)
      supabaseAdmin
        .from("executive_cost_config")
        .select("*")
        .eq("is_active", true)
        .lte("effective_start", endDate),
      // 4. Employee wages (for labor cost)
      supabaseAdmin
        .from("employee_directory")
        .select("first_name, last_name, hourly_wage, country, employee_status, role")
        .eq("employee_status", "Active")
        .eq("role", "Agent"),
      // 5. New hire agents (≤5 shifts) — excluded from averages
      fetchNewHireSet(supabaseAdmin),
    ]);

    // Fetch CAD→USD rate for Canadian agent wage conversion
    const cadToUsdRate = await getCadToUsdRate();

    const events = revenueResult;
    // Filter out Pitch Health — separate department, not our labor cost
    const perfData = allPerfData.filter(
      (p) => !p.team || !p.team.toLowerCase().includes("pitch health"),
    );
    if (costsResult.error) {
      console.error("Cost config query error:", costsResult.error.message);
    }
    const costConfigs = costsResult.data || [];
    const employees = laborResult.data || [];

    // Debug: log cost config and labor breakdown
    const salaryConfigs = costConfigs.filter((c: { category: string }) => c.category === "salary");
    const pitchHealthFiltered = allPerfData.length - perfData.length;
    console.log(`P&L: ${costConfigs.length} configs (${salaryConfigs.length} salary), ${allPerfData.length} total perf rows → ${perfData.length} ours (${pitchHealthFiltered} Pitch Health excluded), period ${startDate}→${endDate}`);

    // Build wage lookup with multiple name variants for better matching
    // Convert Canadian wages to USD at build time so all downstream math is in USD
    const wageLookup = new Map<string, number>();
    for (const emp of employees) {
      if (!emp.hourly_wage) continue;
      const rawWage = Number(emp.hourly_wage) || 0;
      const wage = convertWageToUsd(rawWage, emp.country, cadToUsdRate);
      const first = (emp.first_name || "").trim().toLowerCase();
      const last = (emp.last_name || "").trim().toLowerCase();
      const full = `${first} ${last}`.trim();

      // Primary: "first last"
      if (full) wageLookup.set(full, wage);
      // Secondary: "last, first" (some systems use this format)
      if (first && last) wageLookup.set(`${last}, ${first}`, wage);
      // Tertiary: first name only (last resort, avoid collisions)
      if (first && !wageLookup.has(first)) wageLookup.set(first, wage);
    }

    // Aggregate revenue by dimension
    const revByAgent = new Map<string, number>();
    const revByCampaign = new Map<string, number>();
    const revByDate = new Map<string, { revenue: number; cost: number; labor: number; profit: number }>();
    let totalRevenue = 0;
    let totalBillable = 0;

    for (const e of events) {
      const rev = Number(e.revenue) || 0;
      totalRevenue += rev;
      const isConverted = e.converted != null ? e.converted : rev > 0;
      if (isConverted) totalBillable++;

      const agent = (e.agent_name || "Unknown").toLowerCase();
      revByAgent.set(agent, (revByAgent.get(agent) || 0) + rev);

      const campaign = e.campaign_name || "Unknown";
      revByCampaign.set(campaign, (revByCampaign.get(campaign) || 0) + rev);

      const date = e.event_timestamp.slice(0, 10);
      const de = revByDate.get(date) || { revenue: 0, cost: 0, labor: 0, profit: 0 };
      de.revenue += rev;
      revByDate.set(date, de);
    }

    // Aggregate labor cost from DialedIn performance × employee wages
    // Two-pass: first compute average wage from matched agents, then apply to unmatched
    let totalLaborCost = 0;
    let totalHoursWorked = 0;
    let totalPaidHours = 0;
    let totalTransfers = 0;
    const unmatchedAgentSet = new Set<string>();
    const laborByAgent = new Map<string, { hours: number; cost: number; transfers: number }>();
    const laborByCampaign = new Map<string, { hours: number; cost: number; transfers: number }>();

    // Compute average hourly wage from tenured employees only (excludes new hires with ≤5 shifts)
    const allWages = employees
      .filter((e) => {
        if (Number(e.hourly_wage) <= 0) return false;
        const name = `${(e.first_name || "").trim()} ${(e.last_name || "").trim()}`.trim().toLowerCase();
        return !isNewHireAgent(name, newHireSet);
      })
      .map((e) => convertWageToUsd(Number(e.hourly_wage), e.country, cadToUsdRate));
    const avgWage = allWages.length > 0 ? allWages.reduce((a, b) => a + b, 0) / allWages.length : 0;

    for (const p of perfData) {
      const hours = Number(p.hours_worked) || 0;
      const transfers = Number(p.transfers) || 0;
      const agentKey = (p.agent_name || "Unknown").toLowerCase();
      const directWage = findWage(agentKey, wageLookup);
      const isUnmatched = directWage === 0 && hours > 0;
      if (isUnmatched) unmatchedAgentSet.add(p.agent_name);
      // Use actual wage if matched, otherwise fall back to fleet average
      const wage = directWage > 0 ? directWage : avgWage;
      const laborCost = hours * wage;

      totalHoursWorked += hours;
      totalPaidHours += Number(p.paid_time_hours) || hours;
      totalLaborCost += laborCost;
      totalTransfers += transfers;

      const agentEntry = laborByAgent.get(agentKey) || { hours: 0, cost: 0, transfers: 0 };
      agentEntry.hours += hours;
      agentEntry.cost += laborCost;
      agentEntry.transfers += transfers;
      laborByAgent.set(agentKey, agentEntry);

      const campaign = p.skill || p.team || "Unknown";
      const campEntry = laborByCampaign.get(campaign) || { hours: 0, cost: 0, transfers: 0 };
      campEntry.hours += hours;
      campEntry.cost += laborCost;
      campEntry.transfers += transfers;
      laborByCampaign.set(campaign, campEntry);

      // Add labor cost to daily trend
      const date = p.report_date;
      const de = revByDate.get(date) || { revenue: 0, cost: 0, labor: 0, profit: 0 };
      de.labor += laborCost;
      de.cost += laborCost;
      revByDate.set(date, de);
    }

    // Labor cost note: DialedIn hours_worked (dialer logged-in time) exceeds actual
    // paid hours by ~25-40%, which naturally approximates total compensation
    // (base + commission + bonus + employer burden). Validated against actual payroll
    // data: 12 weeks of US+CA payroll → full-month labor ≈ $1.1–1.4M, matching
    // hours×wage output without additional multiplier.
    // TODO: Replace with actual payroll feed when Payworks integration is live.

    console.log(`P&L labor: ${perfData.length} perf rows, ${unmatchedAgentSet.size} unmatched agents (avg wage $${avgWage.toFixed(2)}/hr fallback), total labor $${totalLaborCost.toFixed(2)}`);

    // Compute dialer + subscription + salary costs from cost_config
    const dayCount = Math.max(1, daysBetween(startDate, endDate));
    let totalDialerCost = 0;
    let totalSubCost = 0;
    let totalOtherCost = 0;
    let totalSalaryCost = 0;

    for (const cfg of costConfigs) {
      let cost = 0;
      if (cfg.rate_type === "per_seat") {
        cost = Number(cfg.rate_amount) * employees.length * (dayCount / 30);
      } else if (cfg.rate_type === "flat_monthly") {
        cost = Number(cfg.rate_amount) * (dayCount / 30);
      } else if (cfg.rate_type === "flat_daily") {
        cost = Number(cfg.rate_amount) * dayCount;
      } else if (cfg.rate_type === "flat_biweekly") {
        // Bi-weekly → monthly: amount * 26 / 12, then prorate for period
        cost = Number(cfg.rate_amount) * (26 / 12) * (dayCount / 30);
      }

      if (cfg.category === "salary") totalSalaryCost += cost;
      else if (cfg.category === "dialer") totalDialerCost += cost;
      else if (cfg.category === "subscription") totalSubCost += cost;
      else totalOtherCost += cost;
    }

    const totalCost = totalLaborCost + totalSalaryCost + totalDialerCost + totalSubCost + totalOtherCost;
    const grossProfit = totalRevenue - totalCost;
    const marginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const roiPct = totalCost > 0 ? (grossProfit / totalCost) * 100 : 0;

    // Estimated revenue: project from days with actual Retreaver data to full period
    // Conservative: uses only days that have revenue data (no fill-forward for gaps)
    const revDaysWithData = Array.from(revByDate.entries()).filter(([, d]) => d.revenue > 0);
    const revDayCount = revDaysWithData.length;
    const avgDailyRevenue = revDayCount > 0 ? totalRevenue / revDayCount : 0;
    // Project to working days in period (exclude weekends)
    const workingDays = countWorkingDays(startDate, endDate);
    const estimatedRevenue = revDayCount > 0 ? avgDailyRevenue * workingDays : 0;
    const estGrossProfit = estimatedRevenue - totalCost;
    const estMarginPct = estimatedRevenue > 0 ? (estGrossProfit / estimatedRevenue) * 100 : 0;

    // Build summary
    const unmatchedNames = [...unmatchedAgentSet].slice(0, 20);
    const matchedAgents = laborByAgent.size - unmatchedAgentSet.size;
    const wageCoverage = laborByAgent.size > 0
      ? Math.round((matchedAgents / laborByAgent.size) * 100)
      : 0;
    const revenueCoverage = workingDays > 0
      ? Math.round((revDayCount / workingDays) * 100)
      : 0;

    const summary = {
      period: { start: startDate, end: endDate },
      revenue: round2(totalRevenue),
      estimated_revenue: round2(estimatedRevenue),
      revenue_days_actual: revDayCount,
      revenue_days_projected: workingDays,
      avg_daily_revenue: round2(avgDailyRevenue),
      estimated_gross_profit: round2(estGrossProfit),
      estimated_margin_pct: round2(estMarginPct),
      labor_cost: round2(totalLaborCost),
      salary_cost: round2(totalSalaryCost),
      dialer_cost: round2(totalDialerCost),
      subscription_cost: round2(totalSubCost),
      other_cost: round2(totalOtherCost),
      total_cost: round2(totalCost),
      gross_profit: round2(grossProfit),
      margin_pct: round2(marginPct),
      roi_pct: round2(roiPct),
      sla_transfers: totalTransfers,
      billable_calls: totalBillable,
      hours_worked: round2(totalHoursWorked),
      paid_hours: round2(totalPaidHours),
      agent_count: employees.length,
      new_hire_count: newHireSet.size,
      avg_hourly_wage: round2(avgWage),
      unmatched_agents: unmatchedAgentSet.size,
      unmatched_agent_names: unmatchedNames,
      certainty: {
        revenue: {
          level: "actual" as const,
          label: `${revDayCount} of ${workingDays} working days (${revenueCoverage}%)`,
          coverage_pct: revenueCoverage,
        },
        estimated_revenue: {
          level: "estimated" as const,
          label: `Projected from ${revDayCount}-day avg to ${workingDays} working days`,
        },
        labor_cost: {
          level: "derived" as const,
          label: `DialedIn hours \u00D7 wage; ${wageCoverage}% agents wage-matched, ${100 - wageCoverage}% use fleet avg $${avgWage.toFixed(2)}/hr`,
          coverage_pct: wageCoverage,
        },
        salary_cost: {
          level: "actual" as const,
          label: `${salaryConfigs.length} configured entries, prorated for period`,
        },
        dialer_cost: {
          level: "actual" as const,
          label: "Configured flat rate, prorated for period",
        },
        total_cost: {
          level: "derived" as const,
          label: "Sum of labor (derived) + salary + dialer (configured)",
        },
      },
    };

    // Build breakdown by dimension
    const breakdown = buildBreakdown(
      dimension,
      revByAgent,
      revByCampaign,
      laborByAgent,
      laborByCampaign,
      totalSalaryCost,
      totalDialerCost,
      totalSubCost,
      totalOtherCost,
      employees.length,
    );

    // Build daily trend — distribute fixed costs across active days (not calendar days)
    const activeDays = revByDate.size || dayCount;
    const fixedCostPerDay = (totalSalaryCost + totalDialerCost + totalSubCost + totalOtherCost) / activeDays;
    const trend = Array.from(revByDate.entries())
      .map(([date, d]) => ({
        date,
        revenue: round2(d.revenue),
        total_cost: round2(d.cost + fixedCostPerDay),
        labor_cost: round2(d.labor),
        gross_profit: round2(d.revenue - d.cost - fixedCostPerDay),
        margin_pct: d.revenue > 0
          ? round2(((d.revenue - d.cost - fixedCostPerDay) / d.revenue) * 100)
          : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const result = { summary, breakdown, trend };
    setCache(cacheKey, result, CACHE_TTL);
    return NextResponse.json(result);
  } catch (err) {
    console.error("P&L computation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "P&L computation failed" },
      { status: 500 },
    );
  }
}

async function fetchAllPerfData(startDate: string, endDate: string): Promise<PerfRow[]> {
  const all: PerfRow[] = [];
  const PAGE = 1000; // Supabase default max per request
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("dialedin_agent_performance")
      .select("report_date, agent_name, skill, team, transfers, hours_worked, paid_time_hours")
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

async function fetchAllRetreaverEvents(startDate: string, endDate: string): Promise<EventRow[]> {
  const all: EventRow[] = [];
  const PAGE = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("retreaver_events")
      .select("revenue, payout, event_timestamp, campaign_name, agent_name, converted")
      .gte("event_timestamp", `${startDate}T00:00:00Z`)
      .lte("event_timestamp", `${endDate}T23:59:59Z`)
      .range(from, from + PAGE - 1);

    if (error) throw error;
    if (!data) break;
    all.push(...(data as EventRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

function buildBreakdown(
  dimension: string,
  revByAgent: Map<string, number>,
  revByCampaign: Map<string, number>,
  laborByAgent: Map<string, { hours: number; cost: number; transfers: number }>,
  laborByCampaign: Map<string, { hours: number; cost: number; transfers: number }>,
  salaryCost: number,
  dialerCost: number,
  subCost: number,
  otherCost: number,
  agentCount: number,
) {
  if (dimension === "agent") {
    const agents = new Set([...revByAgent.keys(), ...laborByAgent.keys()]);
    return Array.from(agents)
      .map((agent) => {
        const rev = revByAgent.get(agent) || 0;
        const labor = laborByAgent.get(agent) || { hours: 0, cost: 0, transfers: 0 };
        // Distribute fixed costs evenly across agents
        const fixedShare = agentCount > 0 ? (salaryCost + dialerCost + subCost + otherCost) / agentCount : 0;
        const totalCost = labor.cost + fixedShare;
        const profit = rev - totalCost;
        return {
          dimension_value: agent,
          revenue: round2(rev),
          estimated_revenue: 0,
          labor_cost: round2(labor.cost),
          salary_cost: round2(agentCount > 0 ? salaryCost / agentCount : 0),
          dialer_cost: round2(agentCount > 0 ? dialerCost / agentCount : 0),
          subscription_cost: round2(agentCount > 0 ? subCost / agentCount : 0),
          other_cost: round2(agentCount > 0 ? otherCost / agentCount : 0),
          total_cost: round2(totalCost),
          gross_profit: round2(profit),
          margin_pct: rev > 0 ? round2((profit / rev) * 100) : 0,
          hours_worked: round2(labor.hours),
          agent_count: 1,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }

  if (dimension === "campaign") {
    const campaigns = new Set([...revByCampaign.keys(), ...laborByCampaign.keys()]);
    const campCount = campaigns.size || 1;
    return Array.from(campaigns)
      .map((camp) => {
        const rev = revByCampaign.get(camp) || 0;
        const labor = laborByCampaign.get(camp) || { hours: 0, cost: 0, transfers: 0 };
        const fixedShare = (salaryCost + dialerCost + subCost + otherCost) / campCount;
        const totalCost = labor.cost + fixedShare;
        const profit = rev - totalCost;
        return {
          dimension_value: camp,
          revenue: round2(rev),
          estimated_revenue: 0,
          labor_cost: round2(labor.cost),
          salary_cost: round2(salaryCost / campCount),
          dialer_cost: round2(dialerCost / campCount),
          subscription_cost: round2(subCost / campCount),
          other_cost: round2(otherCost / campCount),
          total_cost: round2(totalCost),
          gross_profit: round2(profit),
          margin_pct: rev > 0 ? round2((profit / rev) * 100) : 0,
          hours_worked: round2(labor.hours),
          agent_count: 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }

  return [];
}

function daysBetween(start: string, end: string): number {
  return Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
}

function countWorkingDays(start: string, end: string): number {
  let count = 0;
  const d = new Date(start + "T12:00:00"); // noon to avoid DST issues
  const endD = new Date(end + "T12:00:00");
  while (d <= endD) {
    const day = d.getDay(); // 0=Sun, 6=Sat
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function findWage(agentName: string, wageLookup: Map<string, number>): number {
  const key = agentName.trim().toLowerCase();
  // Exact match: "first last"
  if (wageLookup.has(key)) return wageLookup.get(key)!;
  // Try "last, first" → "first last"
  if (key.includes(",")) {
    const [last, first] = key.split(",").map((s) => s.trim());
    const flipped = `${first} ${last}`;
    if (wageLookup.has(flipped)) return wageLookup.get(flipped)!;
  }
  // Try first name only (last resort)
  const firstName = key.split(/[\s,]+/)[0];
  if (firstName && wageLookup.has(firstName)) return wageLookup.get(firstName)!;
  return 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCached, setCache } from "@/utils/dialedin-cache";
import { jsonWithCache } from "@/utils/api-cache";

export const runtime = "nodejs";

const FULL_BREAK_ALLOWANCE_MIN = 69.6;
const BREAK_ALLOWANCE_RATIO = 0.145;
function getBreakAllowanceMin(loggedInMin: number): number {
  return Math.min(FULL_BREAK_ALLOWANCE_MIN, loggedInMin * BREAK_ALLOWANCE_RATIO);
}

function getCurrentPayPeriod(country: string | null): { start: string; end: string } {
  // Bi-weekly pay periods starting on Mondays, offset by country.
  // American anchor: Mon Jan 6, 2025 — verified: +29×14 = Feb 16, 2026, +30×14 = Mar 2, 2026
  // Canadian anchor: Mon Jan 13, 2025 — verified: +29×14 = Feb 23, 2026
  const isCanadian = country?.toLowerCase() === "canada";
  const anchor = new Date(isCanadian ? "2025-01-13T00:00:00Z" : "2025-01-06T00:00:00Z");
  const now = new Date();
  const diffMs = now.getTime() - anchor.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const periodIndex = Math.floor(diffDays / 14);
  const periodStart = new Date(anchor.getTime() + periodIndex * 14 * 86400000);
  const periodEnd = new Date(periodStart.getTime() + 13 * 86400000);
  return {
    start: periodStart.toISOString().slice(0, 10),
    end: periodEnd.toISOString().slice(0, 10),
  };
}

export async function GET(req: NextRequest) {
  const agentName = req.nextUrl.searchParams.get("agent");
  if (!agentName) {
    return NextResponse.json({ error: "agent param required" }, { status: 400 });
  }

  const cacheKey = `agent-earnings:${agentName}`;
  const cached = getCached<Record<string, unknown>>(cacheKey);
  if (cached) return jsonWithCache(cached, 300, 600);

  try {
    const nameParts = agentName.split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    // Look up employee wage + country
    let emp = null;
    // Try dialedin_name first
    const { data: byDialedin } = await supabaseAdmin
      .from("employee_directory")
      .select("hourly_wage, country")
      .ilike("dialedin_name", agentName)
      .limit(1)
      .maybeSingle();

    if (byDialedin) {
      emp = byDialedin;
    } else if (firstName && lastName) {
      // Fallback: first + last name
      const { data: byName } = await supabaseAdmin
        .from("employee_directory")
        .select("hourly_wage, country")
        .ilike("first_name", firstName)
        .ilike("last_name", lastName)
        .limit(1)
        .maybeSingle();
      emp = byName;
    }

    const rawWage = emp?.hourly_wage ?? 0;
    const country = emp?.country ?? null;
    const currency = country?.toLowerCase() === "canada" ? "CAD" : "USD";

    const payPeriod = getCurrentPayPeriod(country);
    const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

    // Sum hours + paid hours + transfers for this period (excluding today — today comes from intraday)
    const { data: perfRows } = await supabaseAdmin
      .from("dialedin_agent_performance")
      .select("hours_worked, report_date, logged_in_time_min, wrap_time_min, pause_time_min, transfers, tph")
      .eq("agent_name", agentName)
      .gte("report_date", payPeriod.start)
      .lt("report_date", todayET);

    let periodHours = 0;
    let periodPaidHours = 0;
    let periodTransfers = 0;
    let slaDaySum = 0;
    const daysSet = new Set<string>();
    for (const row of perfRows || []) {
      periodHours += Number(row.hours_worked) || 0;
      periodTransfers += Number(row.transfers) || 0;
      slaDaySum += Number(row.tph) || 0;
      daysSet.add(row.report_date);

      const loggedIn = Number(row.logged_in_time_min) || 0;
      const wrap = Number(row.wrap_time_min) || 0;
      const pause = Number(row.pause_time_min) || 0;
      const paidMin = loggedIn - wrap - pause + getBreakAllowanceMin(loggedIn);
      periodPaidHours += Math.max(paidMin, 0) / 60;
    }

    const periodAvgSlaHr = daysSet.size > 0 ? slaDaySum / daysSet.size : 0;

    const result = {
      hourly_wage: Math.round(rawWage * 100) / 100,
      currency,
      country,
      pay_period: payPeriod,
      period_hours: Math.round(periodHours * 100) / 100,
      period_paid_hours: Math.round(periodPaidHours * 100) / 100,
      period_earnings: Math.round(periodPaidHours * rawWage * 100) / 100,
      period_transfers: periodTransfers,
      period_days_worked: daysSet.size,
      period_avg_sla_hr: Math.round(periodAvgSlaHr * 100) / 100,
    };

    setCache(cacheKey, result, 5 * 60_000);
    return jsonWithCache(result, 300, 600);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch earnings" },
      { status: 500 },
    );
  }
}

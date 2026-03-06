import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCadToUsdRate, convertWageToUsd } from "@/utils/fx";
import { getCached, setCache } from "@/utils/dialedin-cache";

export const runtime = "nodejs";

function getCurrentPayPeriod(): { start: string; end: string } {
  // Bi-weekly pay periods starting on Sundays. Anchor: Sunday Jan 5 2025.
  const anchor = new Date("2025-01-05T00:00:00Z");
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
  if (cached) return NextResponse.json(cached);

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
    const cadRate = await getCadToUsdRate();
    const wageUsd = convertWageToUsd(rawWage, country, cadRate);

    const payPeriod = getCurrentPayPeriod();
    const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

    // Sum hours from perf data for this period (excluding today — today comes from intraday)
    const { data: perfRows } = await supabaseAdmin
      .from("dialedin_agent_performance")
      .select("hours_worked, report_date")
      .eq("agent_name", agentName)
      .gte("report_date", payPeriod.start)
      .lt("report_date", todayET);

    let periodHours = 0;
    const daysSet = new Set<string>();
    for (const row of perfRows || []) {
      periodHours += Number(row.hours_worked) || 0;
      daysSet.add(row.report_date);
    }

    const result = {
      hourly_wage_usd: Math.round(wageUsd * 100) / 100,
      country,
      pay_period: payPeriod,
      period_hours: Math.round(periodHours * 100) / 100,
      period_earnings_usd: Math.round(periodHours * wageUsd * 100) / 100,
      period_days_worked: daysSet.size,
    };

    setCache(cacheKey, result, 5 * 60_000);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch earnings" },
      { status: 500 },
    );
  }
}

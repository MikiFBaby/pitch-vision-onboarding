import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * GET /api/hr/performance-bulk
 * Returns latest-day adjusted_tph/tph/skill for all agents.
 * Used by EmployeeTable for performance tier coloring.
 */
export async function GET() {
  // Get the most recent report date
  const { data: latest, error: latestErr } = await supabaseAdmin
    .from("dialedin_agent_performance")
    .select("report_date")
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestErr || !latest) {
    return NextResponse.json({ date: null, agents: {} });
  }

  const reportDate = latest.report_date;

  // Fetch all agents for that date (paginated to handle >1000)
  const PAGE = 1000;
  let all: Record<string, unknown>[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("dialedin_agent_performance")
      .select("agent_name, tph, adjusted_tph, transfers, skill, hours_worked")
      .eq("report_date", reportDate)
      .range(offset, offset + PAGE - 1);

    if (error) {
      console.error("performance-bulk query error:", error);
      return NextResponse.json({ error: "Database query failed" }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  // Build lookup: lowercase agent_name → perf data
  const agents: Record<string, {
    adjusted_tph: number | null;
    tph: number;
    transfers: number;
    skill: string | null;
    hours_worked: number;
  }> = {};

  for (const row of all) {
    const name = (row.agent_name as string || "").toLowerCase().trim();
    if (!name) continue;
    agents[name] = {
      adjusted_tph: row.adjusted_tph as number | null,
      tph: row.tph as number,
      transfers: row.transfers as number,
      skill: row.skill as string | null,
      hours_worked: row.hours_worked as number,
    };
  }

  return NextResponse.json({ date: reportDate, agents });
}

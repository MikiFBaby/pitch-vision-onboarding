import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");

  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: "name parameter required" }, { status: 400 });
  }

  const agentName = name.trim();

  // Fetch recent performance records for this agent (up to 30 days)
  const { data: records, error } = await supabaseAdmin
    .from("dialedin_agent_performance")
    .select("*")
    .ilike("agent_name", agentName)
    .order("report_date", { ascending: false })
    .limit(30);

  if (error) {
    console.error("Agent stats query error:", error);
    return NextResponse.json({ error: "Database query failed" }, { status: 500 });
  }

  if (!records || records.length === 0) {
    return NextResponse.json({ latest: null, recentDays: [], averages: null, totals: null });
  }

  const latest = records[0];
  const recentDays = records.slice(0, 14);

  // Compute averages over the recent days
  const len = recentDays.length;
  const sum = (key: string) => recentDays.reduce((s, r) => s + (Number(r[key]) || 0), 0);

  const avgTph = sum("tph") / len;
  // Adjusted TPH: average only over days where adjusted_tph is non-null
  const adjustedDays = recentDays.filter((r) => r.adjusted_tph != null);
  const avgAdjustedTph = adjustedDays.length > 0
    ? adjustedDays.reduce((s, r) => s + Number(r.adjusted_tph), 0) / adjustedDays.length
    : null;
  const avgTransfers = sum("transfers") / len;
  const avgConvRate = sum("conversion_rate") / len;
  const avgConnRate = sum("connect_rate") / len;
  const avgHours = sum("hours_worked") / len;
  const avgDials = sum("dials") / len;
  const avgConnects = sum("connects") / len;

  // Utilization: (talk + wait + wrap) / logged_in * 100
  const avgUtil = recentDays.reduce((s, r) => {
    const logged = Number(r.logged_in_time_min) || 0;
    if (logged === 0) return s;
    const active = (Number(r.talk_time_min) || 0) + (Number(r.wait_time_min) || 0) + (Number(r.wrap_time_min) || 0);
    return s + (active / logged) * 100;
  }, 0) / len;

  const averages = {
    tph: Number(avgTph.toFixed(2)),
    adjusted_tph: avgAdjustedTph != null ? Number(avgAdjustedTph.toFixed(2)) : null,
    transfers: Number(avgTransfers.toFixed(1)),
    conversion_rate: Number(avgConvRate.toFixed(1)),
    connect_rate: Number(avgConnRate.toFixed(1)),
    hours_worked: Number(avgHours.toFixed(1)),
    dials: Math.round(avgDials),
    connects: Math.round(avgConnects),
    utilization: Number(avgUtil.toFixed(1)),
  };

  const totals = {
    transfers: sum("transfers"),
    dials: sum("dials"),
    connects: sum("connects"),
    hours_worked: Number(sum("hours_worked").toFixed(1)),
    days_worked: len,
  };

  return NextResponse.json({ latest, recentDays, averages, totals });
}

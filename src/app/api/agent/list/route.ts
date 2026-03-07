import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCached, setCache } from "@/utils/dialedin-cache";

export const runtime = "nodejs";

/**
 * GET /api/agent/list
 *
 * Lightweight endpoint returning only agent names from today's intraday snapshots.
 * Used by admin simulation dropdown — avoids fetching the full intraday payload.
 */
export async function GET() {
  const cacheKey = "agent-list-names";
  const cached = getCached<string[]>(cacheKey);
  if (cached) return NextResponse.json({ agents: cached });

  // Primary: today's intraday snapshots (agents who are online/have logged in today)
  const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  let names: string[] = [];

  const { data: latestSnap } = await supabaseAdmin
    .from("dialedin_intraday_snapshots")
    .select("snapshot_at")
    .eq("snapshot_date", todayET)
    .order("snapshot_at", { ascending: false })
    .limit(1);

  if (latestSnap && latestSnap.length > 0) {
    const { data } = await supabaseAdmin
      .from("dialedin_intraday_snapshots")
      .select("agent_name")
      .eq("snapshot_date", todayET)
      .eq("snapshot_at", latestSnap[0].snapshot_at);

    names = (data || [])
      .map((r) => r.agent_name)
      .filter((name): name is string => !!name && !name.toLowerCase().includes("pitch health"));
  }

  // Fallback: all active agents from employee_directory (always available)
  if (names.length === 0) {
    const { data: dirData } = await supabaseAdmin
      .from("employee_directory")
      .select("first_name, last_name, dialedin_name")
      .eq("employee_status", "Active")
      .eq("role", "Agent");

    names = (dirData || [])
      .map((r) => r.dialedin_name || `${r.first_name || ""} ${r.last_name || ""}`.trim())
      .filter((name): name is string => !!name && name.length > 1);
  }

  names = [...new Set(names)].sort();

  setCache(cacheKey, names, 5 * 60_000); // 5 min cache
  return NextResponse.json({ agents: names });
}

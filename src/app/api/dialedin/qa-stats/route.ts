import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AgentQAStats } from "@/types/dialedin-types";

export const runtime = "nodejs";

// No cache — QA data should always be real-time

export async function GET(request: NextRequest) {
  const days = parseInt(request.nextUrl.searchParams.get("days") || "30", 10);
  const agent = request.nextUrl.searchParams.get("agent");

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startStr = startDate.toISOString().split("T")[0];

    let query = supabaseAdmin
      .from("QA Results")
      .select(
        "agent_name, call_date, compliance_score, auto_fail_triggered, risk_level, auto_fail_overridden",
      )
      .gte("call_date", startStr)
      .not("agent_name", "is", null);

    if (agent) {
      // Use wildcard for fuzzy matching (handles trailing spaces, slight variations)
      query = query.ilike("agent_name", `%${agent.trim()}%`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by agent — normalize keys (trim) for robust matching
    const agentMap = new Map<
      string,
      {
        displayName: string;
        scores: number[];
        autoFails: number;
        overridden: number;
        risk: { high: number; medium: number; low: number };
        latestDate: string;
      }
    >();

    for (const row of data || []) {
      const rawName = row.agent_name as string;
      const name = rawName.trim();
      const existing = agentMap.get(name) || {
        displayName: name,
        scores: [],
        autoFails: 0,
        overridden: 0,
        risk: { high: 0, medium: 0, low: 0 },
        latestDate: "",
      };

      existing.scores.push(row.compliance_score ?? 0);

      if (row.auto_fail_triggered && !row.auto_fail_overridden) {
        existing.autoFails++;
      }
      if (row.auto_fail_overridden) {
        existing.overridden++;
      }

      const risk = (row.risk_level || "").toUpperCase();
      if (risk === "HIGH") existing.risk.high++;
      else if (risk === "MEDIUM") existing.risk.medium++;
      else existing.risk.low++;

      const callDate = row.call_date || "";
      if (callDate > existing.latestDate) existing.latestDate = callDate;

      agentMap.set(name, existing);
    }

    // Build response — key by both display name AND lowercase for robust lookup
    const result: Record<string, AgentQAStats> = {};

    for (const [name, stats] of agentMap) {
      const totalCalls = stats.scores.length;
      const avgScore =
        totalCalls > 0
          ? Math.round(
              stats.scores.reduce((a, b) => a + b, 0) / totalCalls,
            )
          : 0;
      const passingCalls = stats.scores.filter((s) => s >= 70).length;

      const entry: AgentQAStats = {
        agent_name: stats.displayName,
        total_calls: totalCalls,
        avg_score: avgScore,
        auto_fail_count: stats.autoFails,
        auto_fail_rate:
          totalCalls > 0
            ? Math.round((stats.autoFails / totalCalls) * 100)
            : 0,
        risk_breakdown: stats.risk,
        latest_call_date: stats.latestDate,
        pass_rate:
          totalCalls > 0
            ? Math.round((passingCalls / totalCalls) * 100)
            : 0,
      };

      // Store under display name (exact match) AND lowercase (fuzzy match)
      result[name] = entry;
      const lowerKey = name.toLowerCase();
      if (lowerKey !== name) {
        result[lowerKey] = entry;
      }
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch QA stats",
      },
      { status: 500 },
    );
  }
}

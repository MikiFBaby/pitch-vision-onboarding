import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * GET /api/agent/dashboard?agent=Blair+Brown
 *
 * Batch endpoint for agent portal: qa-stats + recent-calls + manual-violations.
 * Performance stats are handled separately by useAgentDialedinStats hook.
 *
 * Returns:
 * - qa:    { avg_score, total_calls, auto_fail_count, pass_rate } | null  (from QA Results, 30d)
 * - calls: RecentCall[]  (from QA Results, last 10, 30d)
 * - manual_violations: ManualViolation[]
 */
export async function GET(req: NextRequest) {
  const agent = req.nextUrl.searchParams.get("agent");
  if (!agent || agent.trim().length < 2) {
    return NextResponse.json(
      { qa: null, calls: [], manual_violations: [] },
    );
  }

  const agentName = agent.trim();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate30 = thirtyDaysAgo.toISOString().split("T")[0];

  // 3 queries in parallel (perf stats handled by useAgentDialedinStats hook)
  const [qaResult, callsResult, manualResult] = await Promise.all([
    // 1) QA stats (30 days)
    supabaseAdmin
      .from("QA Results")
      .select(
        "agent_name, compliance_score, auto_fail_triggered, auto_fail_overridden",
      )
      .ilike("agent_name", `${agentName}%`)
      .gte("call_date", startDate30)
      .not("agent_name", "is", null),

    // 2) Recent calls (30 days, last 10) — includes auto_fail_reasons for violation details
    supabaseAdmin
      .from("QA Results")
      .select(
        "id, call_date, phone_number, compliance_score, auto_fail_triggered, auto_fail_reasons, risk_level, call_duration, product_type, recording_url, compliance_checklist",
      )
      .ilike("agent_name", `${agentName}%`)
      .gte("call_date", startDate30)
      .order("call_date", { ascending: false })
      .limit(10),

    // 3) Manual QA reviews / violations (30 days)
    supabaseAdmin
      .from("qa_manual_reviews")
      .select("review_date, violation, reviewer, campaign, phone_number")
      .ilike("agent_name", agentName)
      .gte("review_date", startDate30)
      .order("review_date", { ascending: false })
      .limit(20),
  ]);

  // --- Build QA response (exact key match) ---
  let qaResponse: Record<string, unknown> | null = null;

  if (!qaResult.error && qaResult.data && qaResult.data.length > 0) {
    // Group by trimmed name, find exact match
    const byName = new Map<
      string,
      { scores: number[]; autoFails: number; overridden: number }
    >();

    for (const row of qaResult.data) {
      const name = (row.agent_name as string).trim();
      const key = name.toLowerCase();
      const entry = byName.get(key) || { scores: [], autoFails: 0, overridden: 0 };
      entry.scores.push(row.compliance_score ?? 0);
      if (row.auto_fail_triggered && !row.auto_fail_overridden) entry.autoFails++;
      byName.set(key, entry);
    }

    // Case-insensitive match
    const match = byName.get(agentName.trim().toLowerCase()) || null;

    if (match) {
      const totalCalls = match.scores.length;
      const avgScore =
        totalCalls > 0
          ? Math.round(match.scores.reduce((a, b) => a + b, 0) / totalCalls)
          : 0;
      const passingCalls = match.scores.filter((s) => s >= 70).length;

      qaResponse = {
        avg_score: avgScore,
        total_calls: totalCalls,
        auto_fail_count: match.autoFails,
        pass_rate: totalCalls > 0 ? Math.round((passingCalls / totalCalls) * 100) : 0,
      };
    }
  }

  // --- Build calls response ---
  const callsResponse = !callsResult.error ? callsResult.data || [] : [];

  // --- Build manual violations response ---
  const manualViolations = !manualResult.error ? manualResult.data || [] : [];

  // Add manual violation count to qa stats
  if (qaResponse) {
    qaResponse.manual_violation_count = manualViolations.length;
  }

  return NextResponse.json({
    qa: qaResponse,
    calls: callsResponse,
    manual_violations: manualViolations,
  });
}

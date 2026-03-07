import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCached, setCache } from "@/utils/dialedin-cache";
import { jsonWithCache } from "@/utils/api-cache";

/**
 * GET /api/manager/qa-summary?team=jade%20aca,aragon&days=30&agents=John+Smith,Jane+Doe
 *
 * Returns team-filtered QA compliance stats + recent violations.
 * Used by the Manager Team Hub for QA health visibility.
 *
 * When `agents` param is provided (comma-separated names from intraday data),
 * skips the expensive intraday snapshot query entirely.
 */

export const runtime = "nodejs";

const CACHE_TTL = 5 * 60_000; // 5 min

function matchesTeamFilter(team: string | null, filters: string[]): boolean {
    if (!filters.length) return true;
    if (!team) return false;
    const lower = team.toLowerCase();
    return filters.some((f) => lower.includes(f));
}

export async function GET(req: NextRequest) {
    const teamParam = req.nextUrl.searchParams.get("team") || "";
    const days = parseInt(req.nextUrl.searchParams.get("days") || "30", 10);
    const agentsParam = req.nextUrl.searchParams.get("agents") || "";
    const teamFilters = teamParam
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

    // Check cache first
    const cacheKey = `qa-summary:${teamParam}:${agentsParam ? "agents" : "no-agents"}:${days}`;
    const cached = getCached<Record<string, unknown>>(cacheKey);
    if (cached) return jsonWithCache(cached, 300, 600);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);
    const startStr = startDate.toISOString().slice(0, 10);

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysStr = sevenDaysAgo.toISOString().slice(0, 10);

    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const fourteenDaysStr = fourteenDaysAgo.toISOString().slice(0, 10);

    // --- 1. Get team agent names ---
    // If client provided agent names (from intraday data), skip the expensive snapshot query
    const teamAgentNames = new Set<string>();

    if (agentsParam) {
        for (const name of agentsParam.split(",")) {
            const trimmed = name.trim();
            if (trimmed) teamAgentNames.add(trimmed);
        }
    } else {
        // Fallback: query intraday snapshots (only if client didn't provide names)
        const today = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
        const todayStr = new Date(today).toISOString().slice(0, 10);
        const PAGE = 1000;
        let offset = 0;

        while (true) {
            const { data: snapPage } = await supabaseAdmin
                .from("dialedin_intraday_snapshots")
                .select("agent_name, team")
                .eq("snapshot_date", todayStr)
                .range(offset, offset + PAGE - 1);

            if (!snapPage || snapPage.length === 0) break;
            for (const row of snapPage) {
                if (matchesTeamFilter(row.team, teamFilters)) {
                    teamAgentNames.add(row.agent_name.trim());
                }
            }
            if (snapPage.length < PAGE) break;
            offset += PAGE;
        }

        // If no intraday data today (early morning / weekend), fall back to employee_directory
        if (teamAgentNames.size === 0) {
            const { data: employees } = await supabaseAdmin
                .from("employee_directory")
                .select("first_name, last_name")
                .eq("employee_status", "Active")
                .eq("role", "Agent");

            if (employees) {
                for (const e of employees) {
                    teamAgentNames.add(`${e.first_name} ${e.last_name}`.trim());
                }
            }
        }
    }

    const emptyResult = {
        team_avg_score: 0,
        team_pass_rate: 0,
        total_auto_fails_7d: 0,
        manual_violations_7d: 0,
        total_calls: 0,
        recent_violations: [],
        per_agent: {},
        trend: "stable" as const,
    };

    if (teamAgentNames.size === 0) {
        return jsonWithCache(emptyResult, 300, 600);
    }

    const agentList = Array.from(teamAgentNames);

    // --- 2. Query QA Results + Manual Reviews in PARALLEL ---
    const BATCH = 50;

    async function fetchQABatch(batch: string[]) {
        const { data, error } = await supabaseAdmin
            .from("QA Results")
            .select("agent_name, call_date, compliance_score, auto_fail_triggered, auto_fail_overridden, risk_level, auto_fail_reasons, call_status")
            .in("agent_name", batch)
            .gte("call_date", startStr)
            .lte("call_date", todayStr)
            .not("agent_name", "is", null);
        if (error) console.error("qa-summary QA Results query error:", error.message);
        return data || [];
    }

    async function fetchManualBatch(batch: string[]) {
        const { data } = await supabaseAdmin
            .from("qa_manual_reviews")
            .select("agent_name, review_date, violation, campaign")
            .in("agent_name", batch)
            .gte("review_date", startStr)
            .lte("review_date", todayStr);
        return data || [];
    }

    // Build all batch promises and fire in parallel
    const qaPromises: Promise<Awaited<ReturnType<typeof fetchQABatch>>>[] = [];
    const manualPromises: Promise<Awaited<ReturnType<typeof fetchManualBatch>>>[] = [];

    for (let i = 0; i < agentList.length; i += BATCH) {
        const batch = agentList.slice(i, i + BATCH);
        qaPromises.push(fetchQABatch(batch));
        manualPromises.push(fetchManualBatch(batch));
    }

    const [qaResults, manualResults] = await Promise.all([
        Promise.all(qaPromises),
        Promise.all(manualPromises),
    ]);

    const qaRows = qaResults.flat();
    const manualRows = manualResults.flat();

    // --- 3. Aggregate team-level metrics ---
    const perAgent: Record<string, {
        avg_score: number;
        auto_fail_count: number;
        pass_rate: number;
        total_calls: number;
        manual_violations: number;
    }> = {};

    // Group QA results by agent
    const agentScores = new Map<string, { scores: number[]; autoFails: number }>();
    for (const row of qaRows) {
        const name = row.agent_name.trim();
        const entry = agentScores.get(name) || { scores: [], autoFails: 0 };
        entry.scores.push(row.compliance_score ?? 0);
        if (row.auto_fail_triggered && !row.auto_fail_overridden) {
            entry.autoFails++;
        }
        agentScores.set(name, entry);
    }

    // Group manual violations by agent
    const agentManual = new Map<string, number>();
    for (const row of manualRows) {
        const name = row.agent_name.trim();
        agentManual.set(name, (agentManual.get(name) || 0) + 1);
    }

    // Build per-agent stats
    let totalScoreSum = 0;
    let totalCallCount = 0;
    let totalPassCount = 0;

    for (const name of teamAgentNames) {
        const qa = agentScores.get(name);
        const manual = agentManual.get(name) || 0;

        const totalCalls = qa?.scores.length || 0;
        const avgScore = totalCalls > 0
            ? Math.round(qa!.scores.reduce((a, b) => a + b, 0) / totalCalls)
            : 0;
        const passingCalls = qa?.scores.filter((s) => s >= 70).length || 0;
        const passRate = totalCalls > 0 ? Math.round((passingCalls / totalCalls) * 100) : 0;

        if (totalCalls > 0) {
            perAgent[name] = {
                avg_score: avgScore,
                auto_fail_count: qa?.autoFails || 0,
                pass_rate: passRate,
                total_calls: totalCalls,
                manual_violations: manual,
            };

            totalScoreSum += qa!.scores.reduce((a, b) => a + b, 0);
            totalCallCount += totalCalls;
            totalPassCount += passingCalls;
        } else if (manual > 0) {
            perAgent[name] = {
                avg_score: 0,
                auto_fail_count: 0,
                pass_rate: 0,
                total_calls: 0,
                manual_violations: manual,
            };
        }
    }

    const teamAvgScore = totalCallCount > 0 ? Math.round(totalScoreSum / totalCallCount) : 0;
    const teamPassRate = totalCallCount > 0 ? Math.round((totalPassCount / totalCallCount) * 100) : 0;

    // Last 7 days auto-fails
    const autoFails7d = qaRows.filter(
        (r) => r.call_date >= sevenDaysStr && r.auto_fail_triggered && !r.auto_fail_overridden,
    ).length;

    // Last 7 days manual violations
    const manualViolations7d = manualRows.filter((r) => r.review_date >= sevenDaysStr).length;

    // --- 4. Trend: this 7d avg vs prior 7d avg ---
    const thisWeekScores = qaRows
        .filter((r) => r.call_date >= sevenDaysStr)
        .map((r) => r.compliance_score ?? 0);
    const priorWeekScores = qaRows
        .filter((r) => r.call_date >= fourteenDaysStr && r.call_date < sevenDaysStr)
        .map((r) => r.compliance_score ?? 0);

    const thisWeekAvg = thisWeekScores.length > 0
        ? thisWeekScores.reduce((a, b) => a + b, 0) / thisWeekScores.length : 0;
    const priorWeekAvg = priorWeekScores.length > 0
        ? priorWeekScores.reduce((a, b) => a + b, 0) / priorWeekScores.length : 0;

    const trend: "up" | "down" | "stable" =
        priorWeekAvg === 0 ? "stable" :
        thisWeekAvg > priorWeekAvg + 2 ? "up" :
        thisWeekAvg < priorWeekAvg - 2 ? "down" : "stable";

    // --- 5. Recent violations (last 10, combining auto-fails + manual) ---
    interface RecentViolation {
        agent_name: string;
        type: string;
        date: string;
        severity: "critical" | "warning";
        source: "auto_fail" | "manual";
    }

    const recentViolations: RecentViolation[] = [];

    for (const row of qaRows) {
        if (row.call_date < sevenDaysStr) continue;
        if (!row.auto_fail_triggered || row.auto_fail_overridden) continue;

        const reasons = row.auto_fail_reasons as Array<{ code?: string; violation?: string }> | null;
        if (reasons && Array.isArray(reasons)) {
            for (const reason of reasons) {
                recentViolations.push({
                    agent_name: row.agent_name.trim(),
                    type: reason.code || "Auto-Fail",
                    date: row.call_date,
                    severity: "critical",
                    source: "auto_fail",
                });
            }
        } else {
            recentViolations.push({
                agent_name: row.agent_name.trim(),
                type: "Auto-Fail",
                date: row.call_date,
                severity: "critical",
                source: "auto_fail",
            });
        }
    }

    for (const row of manualRows) {
        if (row.review_date < sevenDaysStr) continue;
        recentViolations.push({
            agent_name: row.agent_name.trim(),
            type: row.violation,
            date: row.review_date,
            severity: "warning",
            source: "manual",
        });
    }

    recentViolations.sort((a, b) => b.date.localeCompare(a.date));
    const topViolations = recentViolations.slice(0, 10);

    const result = {
        team_avg_score: teamAvgScore,
        team_pass_rate: teamPassRate,
        total_auto_fails_7d: autoFails7d,
        manual_violations_7d: manualViolations7d,
        total_calls: totalCallCount,
        recent_violations: topViolations,
        per_agent: perAgent,
        trend,
    };

    setCache(cacheKey, result, CACHE_TTL);
    return jsonWithCache(result, 300, 600);
}

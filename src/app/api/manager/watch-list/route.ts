import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isExcludedTeam, getBreakEvenTPH } from "@/utils/dialedin-revenue";
import {
  computeDeclineStreak,
  computeConsistencyScore,
  linearRegression,
  mean,
  buildSparkline,
  subtractDays,
  todayStr,
} from "@/utils/dialedin-analytics";
import { getCached, setCache } from "@/utils/dialedin-cache";
import { jsonWithCache } from "@/utils/api-cache";

export const runtime = "nodejs";

const CACHE_TTL = 5 * 60 * 1000; // 5 min

type WatchFlagType =
  | "below_be"
  | "declining"
  | "qa_issue"
  | "decline_streak"
  | "new_hire_struggling"
  | "hot_streak"
  | "milestone"
  | "consistency_improved"
  | "needs_coaching"
  | "hidden_gem";

interface WatchFlag {
  type: WatchFlagType;
  severity: "critical" | "warning" | "info" | "positive";
  label: string;
  detail: string;
}

interface WatchAgent {
  name: string;
  sla_hr_14d_avg: number;
  sparkline: number[];
  flags: WatchFlag[];
  priority: number;
  sentiment: "positive" | "negative" | "mixed";
  last_coached_days_ago: number | null;
  qa_auto_fails_30d: number;
  consistency_score: number;
  trend_direction: "up" | "down" | "flat";
  decline_streak: number;
  hot_streak: number;
  team: string | null;
}

function computeHotStreak(tphValues: number[]): number {
  if (tphValues.length < 3) return 0;
  const avg = mean(tphValues);
  if (avg === 0) return 0;

  let maxStreak = 0;
  let streak = 0;

  for (let i = 0; i < tphValues.length; i++) {
    if (tphValues[i] > avg) {
      streak++;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      streak = 0;
    }
  }
  return maxStreak;
}

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 3,
  warning: 2,
  info: 1,
  positive: -0.5,
};

export async function GET(request: NextRequest) {
  const teamParam = request.nextUrl.searchParams.get("team") || "";
  const days = parseInt(request.nextUrl.searchParams.get("days") || "14", 10);

  const cacheKey = `watch-list:${teamParam}:${days}`;
  const cached = getCached<{ agents: WatchAgent[]; summary: { total: number; needs_attention: number; bright_spots: number } }>(cacheKey);
  if (cached) return jsonWithCache(cached, 300, 600);

  try {
    const today = todayStr();
    const startDate = subtractDays(today, days);
    const qaStartDate = subtractDays(today, 30);
    const coachingStartDate = subtractDays(today, 60);

    // Build team filter function
    const teamNeedles = teamParam
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buildTeamFilter = (q: any) => {
      if (teamNeedles.length === 1) {
        return q.ilike("team", `%${teamNeedles[0]}%`);
      } else if (teamNeedles.length > 1) {
        return q.or(teamNeedles.map((t: string) => `team.ilike.%${t}%`).join(","));
      }
      return q;
    };

    // === 1. Performance data (14 days) ===
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let perfQuery: any = supabaseAdmin
      .from("dialedin_agent_performance")
      .select("agent_name, team, report_date, tph, adjusted_tph, transfers, conversion_rate, hours_worked, dials")
      .gte("report_date", startDate)
      .gte("hours_worked", 1)
      .order("agent_name")
      .order("report_date", { ascending: true });

    if (teamParam) perfQuery = buildTeamFilter(perfQuery);

    // === 2. Coaching events (60 days) ===
    const coachingQuery = supabaseAdmin
      .from("dialedin_coaching_events")
      .select("agent_name, event_date, event_type")
      .gte("event_date", coachingStartDate)
      .order("event_date", { ascending: false });

    // === 3. QA auto-fails (30 days) ===
    const qaQuery = supabaseAdmin
      .from("QA Results")
      .select("agent_name, auto_fail_triggered, auto_fail_overridden")
      .gte("call_date", qaStartDate)
      .eq("auto_fail_triggered", true)
      .not("agent_name", "is", null);

    // Fire all 3 in parallel
    const [perfResult, coachingResult, qaResult] = await Promise.all([
      perfQuery as Promise<{ data: { agent_name: string; team: string | null; report_date: string; tph: number; adjusted_tph: number | null; transfers: number; conversion_rate: number; hours_worked: number; dials: number }[] | null; error: { message: string } | null }>,
      coachingQuery,
      qaQuery,
    ]);

    if (perfResult.error) {
      return NextResponse.json({ error: perfResult.error.message }, { status: 500 });
    }

    // === Build coaching lookup ===
    const lastCoachedMap = new Map<string, string>(); // agent → most recent event_date
    for (const row of coachingResult.data || []) {
      const name = (row.agent_name as string)?.trim();
      if (name && !lastCoachedMap.has(name)) {
        lastCoachedMap.set(name, row.event_date as string);
      }
    }

    // === Build QA auto-fail counts ===
    const qaFailMap = new Map<string, number>(); // agent → count
    for (const row of qaResult.data || []) {
      const name = (row.agent_name as string)?.trim();
      if (!name) continue;
      if (row.auto_fail_overridden) continue;
      qaFailMap.set(name, (qaFailMap.get(name) || 0) + 1);
    }

    // === Group performance by agent ===
    const agentPerf = new Map<string, { team: string | null; days: { date: string; tph: number; conv: number; hours: number; dials: number }[] }>();
    for (const row of perfResult.data || []) {
      if (isExcludedTeam(row.team)) continue;
      const name = row.agent_name.trim();
      const existing = agentPerf.get(name) || { team: row.team, days: [] };
      existing.days.push({
        date: row.report_date,
        tph: Number(row.adjusted_tph ?? row.tph) || 0,
        conv: Number(row.conversion_rate) || 0,
        hours: Number(row.hours_worked) || 0,
        dials: Number(row.dials) || 0,
      });
      agentPerf.set(name, existing);
    }

    // === Compute team averages (for hidden gem detection) ===
    const allConvRates: number[] = [];
    for (const [, data] of agentPerf) {
      if (data.days.length >= 3) {
        allConvRates.push(mean(data.days.map((d) => d.conv)));
      }
    }
    const teamAvgConv = mean(allConvRates);

    // === Build watch agents ===
    const agents: WatchAgent[] = [];

    for (const [name, data] of agentPerf) {
      if (data.days.length < 2) continue;

      const tphValues = data.days.map((d) => d.tph);
      const avgTph = mean(tphValues);
      const be = getBreakEvenTPH(data.team);
      const consistency = computeConsistencyScore(tphValues);
      const declineStreak = computeDeclineStreak(tphValues);
      const hotStreak = computeHotStreak(tphValues);
      const avgConv = mean(data.days.map((d) => d.conv));

      // Trend
      const points = tphValues.map((y, i) => ({ x: i, y }));
      const reg = linearRegression(points);
      const trendDirection: "up" | "down" | "flat" =
        reg.slope > 0.05 ? "up" : reg.slope < -0.05 ? "down" : "flat";

      // Sparkline
      const sparkline = buildSparkline(
        data.days.map((d) => ({ report_date: d.date, tph: d.tph })),
        subtractDays(today, days - 1),
        today,
      );

      // Coaching
      const lastCoached = lastCoachedMap.get(name);
      let lastCoachedDaysAgo: number | null = null;
      if (lastCoached) {
        const diff = Math.round(
          (new Date(today + "T12:00:00Z").getTime() - new Date(lastCoached + "T12:00:00Z").getTime()) /
            (1000 * 60 * 60 * 24),
        );
        lastCoachedDaysAgo = diff;
      }

      // QA
      const qaFails = qaFailMap.get(name) || 0;

      // Total days worked (for new hire detection)
      const totalDays = data.days.length;
      const isNewHire = totalDays <= 5;

      // === Build flags ===
      const flags: WatchFlag[] = [];

      // Negative flags
      if (avgTph < be) {
        const delta = avgTph - be;
        flags.push({
          type: "below_be",
          severity: delta < -1.5 ? "critical" : "warning",
          label: `${delta.toFixed(1)} vs B/E`,
          detail: `14d avg ${avgTph.toFixed(2)} SLA/hr vs ${be.toFixed(1)} break-even`,
        });
      }

      if (trendDirection === "down") {
        flags.push({
          type: "declining",
          severity: "warning",
          label: "Declining",
          detail: `Trend slope: ${reg.slope.toFixed(3)}/day`,
        });
      }

      if (declineStreak >= 3) {
        flags.push({
          type: "decline_streak",
          severity: declineStreak >= 5 ? "critical" : "warning",
          label: `${declineStreak}d decline`,
          detail: `${declineStreak} consecutive days of declining TPH`,
        });
      }

      if (qaFails > 0) {
        flags.push({
          type: "qa_issue",
          severity: qaFails >= 3 ? "critical" : "warning",
          label: `AF: ${qaFails}`,
          detail: `${qaFails} auto-fail${qaFails > 1 ? "s" : ""} in last 30 days`,
        });
      }

      if (isNewHire && avgTph < be * 0.5) {
        flags.push({
          type: "new_hire_struggling",
          severity: "info",
          label: "New hire",
          detail: `${totalDays} days worked, TPH at ${((avgTph / be) * 100).toFixed(0)}% of B/E`,
        });
      }

      if (lastCoachedDaysAgo === null || lastCoachedDaysAgo >= 30) {
        if (avgTph < be) {
          flags.push({
            type: "needs_coaching",
            severity: "info",
            label: lastCoachedDaysAgo ? `${lastCoachedDaysAgo}d since coached` : "Never coached",
            detail: `Below B/E and ${lastCoachedDaysAgo ? `last coached ${lastCoachedDaysAgo} days ago` : "no coaching record"}`,
          });
        }
      }

      // Positive flags
      if (hotStreak >= 3) {
        flags.push({
          type: "hot_streak",
          severity: "positive",
          label: `${hotStreak}d hot`,
          detail: `${hotStreak} consecutive days above personal average`,
        });
      }

      if (isNewHire && avgTph >= be) {
        flags.push({
          type: "milestone",
          severity: "positive",
          label: "Above B/E",
          detail: `New hire averaging ${avgTph.toFixed(2)} SLA/hr (above ${be.toFixed(1)} B/E)`,
        });
      }

      if (!isNewHire && avgTph < be && avgConv > teamAvgConv && totalDays >= 5) {
        flags.push({
          type: "hidden_gem",
          severity: "positive",
          label: "High conversion",
          detail: `Conversion ${avgConv.toFixed(1)}% vs team avg ${teamAvgConv.toFixed(1)}% — may benefit from more call volume`,
        });
      }

      // Skip agents with no flags
      if (flags.length === 0) continue;

      // Priority + sentiment
      const priority = flags.reduce((s, f) => s + (SEVERITY_WEIGHT[f.severity] || 0), 0);
      const hasNegative = flags.some((f) => f.severity === "critical" || f.severity === "warning");
      const hasPositive = flags.some((f) => f.severity === "positive");
      const sentiment: "positive" | "negative" | "mixed" =
        hasNegative && hasPositive ? "mixed" : hasNegative ? "negative" : "positive";

      agents.push({
        name,
        sla_hr_14d_avg: Math.round(avgTph * 100) / 100,
        sparkline,
        flags,
        priority,
        sentiment,
        last_coached_days_ago: lastCoachedDaysAgo,
        qa_auto_fails_30d: qaFails,
        consistency_score: consistency,
        trend_direction: trendDirection,
        decline_streak: declineStreak,
        hot_streak: hotStreak,
        team: data.team,
      });
    }

    // Sort by priority descending
    agents.sort((a, b) => b.priority - a.priority);

    const summary = {
      total: agents.length,
      needs_attention: agents.filter((a) => a.sentiment === "negative" || a.sentiment === "mixed").length,
      bright_spots: agents.filter((a) => a.sentiment === "positive").length,
    };

    const result = { agents, summary };
    setCache(cacheKey, result, CACHE_TTL);

    return jsonWithCache(result, 300, 600);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to compute watch list" },
      { status: 500 },
    );
  }
}

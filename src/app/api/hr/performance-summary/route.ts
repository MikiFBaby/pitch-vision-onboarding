import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isExcludedTeam } from "@/utils/dialedin-revenue";

export const runtime = "nodejs";

export interface PerfSummary {
  avg_tph: number;
  prev_avg_tph: number;
  trend: "up" | "down" | "stable";
  trend_pct: number;
  total_transfers: number;
  days_worked: number;
  avg_hours: number;
  avg_conversion: number;
  consistency_score: number;
  composite_score: number;
  rank: number;
}

/** Convert raw values to percentile ranks (0–100) within the population */
function toPercentiles(values: number[]): number[] {
  if (values.length <= 1) return values.map(() => 50);
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    // Use average index for ties
    let first = sorted.indexOf(v);
    let last = sorted.lastIndexOf(v);
    const avgIdx = (first + last) / 2;
    return (avgIdx / (sorted.length - 1)) * 100;
  });
}

export async function GET() {
  try {
    // Get the most recent report date
    const { data: dateRows } = await supabaseAdmin
      .from("dialedin_agent_performance")
      .select("report_date")
      .order("report_date", { ascending: false })
      .limit(1);

    if (!dateRows || dateRows.length === 0) {
      return NextResponse.json({ data: {} });
    }

    const latestDate = dateRows[0].report_date;
    const d = new Date(latestDate + "T12:00:00");
    d.setDate(d.getDate() - 14);
    const startDate = d.toISOString().slice(0, 10);

    // Fetch all agent performance for the last 14 days (paginated to avoid 1000-row limit)
    let perfData: any[] = [];
    let from = 0;
    const batchSize = 1000;
    while (true) {
      const { data: batch, error } = await supabaseAdmin
        .from("dialedin_agent_performance")
        .select("agent_name, team, report_date, tph, transfers, hours_worked, conversion_rate")
        .gte("report_date", startDate)
        .lte("report_date", latestDate)
        .range(from, from + batchSize - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!batch || batch.length === 0) break;
      perfData = perfData.concat(batch);
      if (batch.length < batchSize) break;
      from += batchSize;
    }

    // Find the midpoint date (7 days ago from latest)
    const mid = new Date(latestDate + "T12:00:00");
    mid.setDate(mid.getDate() - 7);
    const midDate = mid.toISOString().slice(0, 10);

    // Aggregate by agent
    const agentMap = new Map<string, {
      recentTph: number[];
      priorTph: number[];
      allTph: number[];
      allConversion: number[];
      allHours: number[];
      totalTransfers: number;
      datesWorked: Set<string>;
    }>();

    for (const row of perfData || []) {
      if (isExcludedTeam(row.team)) continue;
      if (!row.agent_name) continue;

      const key = row.agent_name.trim().toLowerCase();
      let agent = agentMap.get(key);
      if (!agent) {
        agent = {
          recentTph: [], priorTph: [],
          allTph: [], allConversion: [], allHours: [],
          totalTransfers: 0, datesWorked: new Set(),
        };
        agentMap.set(key, agent);
      }

      const tph = row.tph || 0;
      // Split into halves for trend calculation
      if (row.report_date > midDate) {
        agent.recentTph.push(tph);
      } else {
        agent.priorTph.push(tph);
      }
      // All 14 days for composite scoring
      agent.allTph.push(tph);
      agent.allConversion.push(row.conversion_rate || 0);
      agent.allHours.push(row.hours_worked || 0);
      agent.totalTransfers += row.transfers || 0;
      agent.datesWorked.add(row.report_date);
    }

    // Build raw summaries (before percentile pass)
    const rawSummaries: {
      name: string;
      recentAvg: number;
      priorAvg: number;
      avgTph14: number;
      trendPct: number;
      trend: "up" | "down" | "stable";
      avgConversion: number;
      avgHours: number;
      consistencyRaw: number;
      totalTransfers: number;
      daysWorked: number;
    }[] = [];

    for (const [name, agg] of agentMap) {
      // Trend: compare recent 7 vs prior 7 (half-window comparison)
      const recentAvg = agg.recentTph.length > 0
        ? agg.recentTph.reduce((a, b) => a + b, 0) / agg.recentTph.length
        : 0;
      const priorAvg = agg.priorTph.length > 0
        ? agg.priorTph.reduce((a, b) => a + b, 0) / agg.priorTph.length
        : 0;

      let trend: "up" | "down" | "stable" = "stable";
      let trendPct = 0;

      // Require data in both windows for a meaningful trend
      if (priorAvg > 0 && agg.recentTph.length > 0) {
        trendPct = ((recentAvg - priorAvg) / priorAvg) * 100;
        if (trendPct > 10) trend = "up";
        else if (trendPct < -10) trend = "down";
      }

      // Composite score uses full 14-day window
      const avgTph14 = agg.allTph.length > 0
        ? agg.allTph.reduce((a, b) => a + b, 0) / agg.allTph.length
        : 0;
      const avgConversion = agg.allConversion.length > 0
        ? agg.allConversion.reduce((a, b) => a + b, 0) / agg.allConversion.length
        : 0;
      const avgHours = agg.allHours.length > 0
        ? agg.allHours.reduce((a, b) => a + b, 0) / agg.allHours.length
        : 0;

      // Consistency: attendance ratio over 14 days (0.5) + shift length ratio (0.5)
      const consistencyRaw = (Math.min(agg.datesWorked.size, 14) / 14) * 0.5 + Math.min(avgHours / 8, 1.0) * 0.5;

      rawSummaries.push({
        name,
        recentAvg,
        priorAvg,
        avgTph14,
        trendPct,
        trend,
        avgConversion,
        avgHours,
        consistencyRaw,
        totalTransfers: agg.totalTransfers,
        daysWorked: agg.datesWorked.size,
      });
    }

    // Percentile pass across all agents (uses full 14-day averages)
    const productivityVals = rawSummaries.map((s) => s.avgTph14);
    const efficiencyVals = rawSummaries.map((s) => s.avgConversion);
    const consistencyVals = rawSummaries.map((s) => s.consistencyRaw);
    // Trend: clamp to [-50, +50] then shift to 0–100
    const trendVals = rawSummaries.map((s) => Math.min(Math.max(s.trendPct, -50), 50) + 50);

    const prodPcts = toPercentiles(productivityVals);
    const effPcts = toPercentiles(efficiencyVals);
    const consPcts = toPercentiles(consistencyVals);
    const trendPcts = toPercentiles(trendVals);

    // Build final summaries with composite score
    const summaries: { name: string; summary: PerfSummary }[] = rawSummaries.map((s, i) => {
      const composite = prodPcts[i] * 0.40 + effPcts[i] * 0.25 + consPcts[i] * 0.20 + trendPcts[i] * 0.15;

      return {
        name: s.name,
        summary: {
          avg_tph: Math.round(s.avgTph14 * 100) / 100,
          prev_avg_tph: Math.round(s.priorAvg * 100) / 100,
          trend: s.trend,
          trend_pct: Math.round(s.trendPct * 10) / 10,
          total_transfers: s.totalTransfers,
          days_worked: s.daysWorked,
          avg_hours: Math.round(s.avgHours * 10) / 10,
          avg_conversion: Math.round(s.avgConversion * 10) / 10,
          consistency_score: Math.round(s.consistencyRaw * 100),
          composite_score: Math.round(composite * 10) / 10,
          rank: 0, // filled below
        },
      };
    });

    // Rank by composite_score descending
    summaries.sort((a, b) => b.summary.composite_score - a.summary.composite_score);
    const totalRanked = summaries.length;
    summaries.forEach((s, i) => { s.summary.rank = i + 1; });

    // Build response map
    const result: Record<string, PerfSummary & { total_ranked: number }> = {};
    for (const s of summaries) {
      result[s.name] = { ...s.summary, total_ranked: totalRanked };
    }

    return NextResponse.json({ data: result, total_ranked: totalRanked });
  } catch (err) {
    console.error("Performance summary error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to compute performance summary" },
      { status: 500 },
    );
  }
}

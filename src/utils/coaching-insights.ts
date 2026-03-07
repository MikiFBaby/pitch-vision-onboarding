/**
 * Pure functions computing coaching pattern insights from existing agent data.
 * No API calls — all computed client-side from data already fetched by the parent page.
 */

import type { AgentPerformance } from "@/types/dialedin-types";

const AF_DESCRIPTIONS: Record<string, string> = {
    "AF-01": "Discussing Money",
    "AF-02": "Discussing Benefits",
    "AF-03": "Medical Advice",
    "AF-04": "Language Issues",
    "AF-05": "Hung Up Transfer",
    "AF-06": "Dead Air",
    "AF-07": "Ignoring DNC",
    "AF-08": "DQ Miss",
    "AF-09": "Improper ID",
    "AF-10": "Banned Phrases",
    "AF-11": "Audio Quality",
    "AF-12": "Poor Prospect State",
};

export interface PatternInsight {
    id: string;
    label: string;
    value: string;
    detail: string;
    action: string;
    sentiment: "positive" | "negative" | "neutral";
}

interface InsightParams {
    recentDays: AgentPerformance[];
    recentViolations: { code: string; violation: string }[];
    qaStats: { avg_score: number; pass_rate: number } | null;
    breakEven: number;
}

/** Compute linear trend from SLA/hr over recent days. Returns % change. */
function computeTrend(days: AgentPerformance[]): { direction: "improving" | "declining" | "stable"; pct: number } {
    if (days.length < 3) return { direction: "stable", pct: 0 };
    const vals = days.map((d) => Number(d.sla_hr));
    const n = vals.length;
    const xMean = (n - 1) / 2;
    const yMean = vals.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
        num += (i - xMean) * (vals[i] - yMean);
        den += (i - xMean) ** 2;
    }
    const slope = den === 0 ? 0 : num / den;
    const totalChange = slope * (n - 1);
    const pct = yMean === 0 ? 0 : Math.round((totalChange / yMean) * 100);
    if (Math.abs(pct) < 5) return { direction: "stable", pct: 0 };
    return { direction: pct > 0 ? "improving" : "declining", pct: Math.abs(pct) };
}

/** Count days at or above break-even */
function computeConsistency(days: AgentPerformance[], breakEven: number): { above: number; total: number } {
    const total = days.length;
    const above = days.filter((d) => Number(d.sla_hr) >= breakEven).length;
    return { above, total };
}

/** Find the most frequent AF code */
function findTopViolation(violations: { code: string }[]): { code: string; count: number; description: string } | null {
    if (violations.length === 0) return null;
    const counts: Record<string, number> = {};
    for (const v of violations) {
        counts[v.code] = (counts[v.code] || 0) + 1;
    }
    const topCode = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return { code: topCode[0], count: topCode[1], description: AF_DESCRIPTIONS[topCode[0]] || topCode[0] };
}

/** Find the day with highest SLA/hr */
function findBestDay(days: AgentPerformance[]): { dayName: string; value: number } | null {
    if (days.length === 0) return null;
    let best = days[0];
    for (const d of days) {
        if (Number(d.sla_hr) > Number(best.sla_hr)) best = d;
    }
    const date = new Date(best.report_date + "T12:00:00");
    const dayName = date.toLocaleDateString(undefined, { weekday: "long" });
    return { dayName, value: Number(best.sla_hr) };
}

/** Build all 5 pattern insights */
export function computeInsights(params: InsightParams): PatternInsight[] {
    const { recentDays, recentViolations, qaStats, breakEven } = params;
    const insights: PatternInsight[] = [];

    // 1. Top Violation
    const topV = findTopViolation(recentViolations);
    if (topV) {
        insights.push({
            id: "top-violation",
            label: "Top Violation",
            value: topV.code,
            detail: `${topV.description} — ${topV.count}× in recent calls`,
            action: `Ask Aura: "How do I avoid ${topV.code}?"`,
            sentiment: "negative",
        });
    }

    // 2. Performance Trend
    if (recentDays.length >= 3) {
        const trend = computeTrend(recentDays);
        insights.push({
            id: "trend",
            label: "Performance Trend",
            value: trend.direction === "stable" ? "Stable" : `${trend.direction === "improving" ? "+" : "-"}${trend.pct}%`,
            detail: trend.direction === "improving"
                ? "Your SLA/hr is trending up — keep it going!"
                : trend.direction === "declining"
                    ? "Your SLA/hr is dipping — small adjustments can turn this around"
                    : "Steady performance over the last 2 weeks",
            action: trend.direction === "declining" ? "Ask Aura for tips to get back on track" : "Keep doing what you're doing!",
            sentiment: trend.direction === "improving" ? "positive" : trend.direction === "declining" ? "negative" : "neutral",
        });
    }

    // 3. Consistency
    if (recentDays.length > 0) {
        const cons = computeConsistency(recentDays, breakEven);
        const ratio = cons.total > 0 ? cons.above / cons.total : 0;
        insights.push({
            id: "consistency",
            label: "Consistency",
            value: `${cons.above}/${cons.total}`,
            detail: `${cons.above} of ${cons.total} days above break-even (${breakEven} SLA/hr)`,
            action: ratio >= 0.7 ? "Great consistency!" : "Focus on hitting break-even every shift",
            sentiment: ratio >= 0.7 ? "positive" : ratio >= 0.4 ? "neutral" : "negative",
        });
    }

    // 4. Best Day
    if (recentDays.length > 0) {
        const best = findBestDay(recentDays);
        if (best) {
            insights.push({
                id: "best-day",
                label: "Best Day",
                value: `${best.value.toFixed(1)} SLA/hr`,
                detail: `Your best was on a ${best.dayName}`,
                action: "Replicate what worked that day!",
                sentiment: "positive",
            });
        }
    }

    // 5. QA Score
    if (qaStats) {
        insights.push({
            id: "qa-score",
            label: "QA Score",
            value: `${Math.round(qaStats.avg_score)}%`,
            detail: `${Math.round(qaStats.pass_rate)}% pass rate on reviewed calls`,
            action: qaStats.avg_score >= 85 ? "Excellent compliance!" : "Review your recent calls for improvement areas",
            sentiment: qaStats.avg_score >= 85 ? "positive" : qaStats.avg_score >= 70 ? "neutral" : "negative",
        });
    }

    return insights;
}

/** Get the consistency dot array for visual display */
export function getConsistencyDots(days: AgentPerformance[], breakEven: number): boolean[] {
    return days.map((d) => Number(d.sla_hr) >= breakEven);
}

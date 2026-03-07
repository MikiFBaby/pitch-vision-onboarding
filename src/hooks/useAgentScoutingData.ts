"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase-client";
import {
    computeConsistencyScore,
    linearRegression,
    mean,
} from "@/utils/dialedin-analytics";
import {
    getRevenuePerTransfer,
} from "@/utils/dialedin-revenue";

// ─── Types ───────────────────────────────────────────────

export type VARTier = "star" | "contributor" | "neutral" | "watch" | "risk";

export interface ScoutingMetrics {
    var_value: number;
    var_tier: VARTier;
    consistency_score: number;
    trend_slope: number;
    trend_r2: number;
    trend_direction: "up" | "down" | "flat";
    hot_cold_streak: number;
    conversion_vs_team: number;
    dials_per_hour: number;
    activity_vs_team: number;
    cost_per_sla: number | null;
    sparkline_14d: number[];
    avg_14d: {
        tph: number;
        conversion_rate: number;
        hours_worked: number;
        dials: number;
    } | null;
    qa: {
        avg_score: number;
        pass_rate: number;
        auto_fail_count: number;
        total_calls: number;
    } | null;
    coaching_events: {
        event_date: string;
        event_type: string;
        notes: string;
    }[];
    last_coached_days_ago: number | null;
    employee_id: string | null;
    slack_user_id: string | null;
    user_image: string | null;
    hired_at: string | null;
    hourly_wage: number | null;
}

interface TeamStats {
    avgConvRate: number;
    avgDialsPerHour: number;
    avgSlaHr: number;
    totalAgents: number;
}

interface UseAgentScoutingDataOptions {
    agentName: string | null;
    team: string | null;
    breakEven: number;
    teamStats: TeamStats;
}

// ─── Raw fetched data (cache-friendly — no team/breakEven dependency) ──

interface RawAgentData {
    statsData: {
        recentDays: { tph: number; conversion_rate: number; hours_worked: number; dials: number; connects: number }[];
        averages: { tph: number; conversion_rate: number; hours_worked: number; dials: number } | null;
    } | null;
    qaData: Record<string, { avg_score: number; pass_rate: number; auto_fail_count: number; total_calls: number }> | null;
    coachingData: { event_date: string; event_type: string; notes: string | null }[] | null;
    dirData: { id: string; slack_user_id: string | null; user_image: string | null; hired_at: string | null; country: string | null; hourly_wage: number | null } | null;
}

// ─── Module-level cache ─────────────────────────────────

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
    data: RawAgentData;
    timestamp: number;
}

const agentCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<RawAgentData>>();

function getCached(agentName: string): RawAgentData | null {
    const entry = agentCache.get(agentName);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        agentCache.delete(agentName);
        return null;
    }
    return entry.data;
}

function setCache(agentName: string, data: RawAgentData) {
    agentCache.set(agentName, { data, timestamp: Date.now() });
}

// ─── Fetch raw data (deduped + cached) ──────────────────

async function fetchRawAgentData(agentName: string): Promise<RawAgentData> {
    // Check cache first
    const cached = getCached(agentName);
    if (cached) return cached;

    // Dedupe in-flight requests
    const inflight = inflightRequests.get(agentName);
    if (inflight) return inflight;

    const promise = (async (): Promise<RawAgentData> => {
        const parts = agentName.trim().split(/\s+/);
        const firstName = parts[0] || "";
        const lastName = parts.slice(1).join(" ") || "";

        const [statsRes, qaRes, coachingRes, dirResult] =
            await Promise.allSettled([
                fetch(
                    `/api/dialedin/agent-stats?name=${encodeURIComponent(agentName)}`
                ).then((r) => (r.ok ? r.json() : null)),
                fetch(
                    `/api/dialedin/qa-stats?days=90&agent=${encodeURIComponent(agentName)}`
                ).then((r) => (r.ok ? r.json() : null)),
                fetch(
                    `/api/dialedin/coaching?agent=${encodeURIComponent(agentName)}&limit=5`
                ).then((r) => (r.ok ? r.json() : null)),
                supabase
                    .from("employee_directory")
                    .select(
                        "id, slack_user_id, user_image, hired_at, country, hourly_wage"
                    )
                    .or(
                        `dialedin_name.ilike.%${agentName}%,and(first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%)`
                    )
                    .eq("employee_status", "Active")
                    .maybeSingle(),
            ]);

        const statsData = statsRes.status === "fulfilled" ? statsRes.value : null;
        const qaRaw = qaRes.status === "fulfilled" ? qaRes.value : null;
        const coachingRaw = coachingRes.status === "fulfilled" ? coachingRes.value : null;
        const dirData = dirResult.status === "fulfilled" ? dirResult.value.data : null;

        const result: RawAgentData = {
            statsData: statsData ? {
                recentDays: statsData.recentDays || [],
                averages: statsData.averages || null,
            } : null,
            qaData: qaRaw?.data || null,
            coachingData: coachingRaw?.data || null,
            dirData,
        };

        setCache(agentName, result);
        return result;
    })();

    inflightRequests.set(agentName, promise);
    promise.finally(() => inflightRequests.delete(agentName));

    return promise;
}

// ─── Public prefetch (for hover) ────────────────────────

export function prefetchAgent(agentName: string) {
    if (!agentName || getCached(agentName)) return;
    fetchRawAgentData(agentName).catch(() => {});
}

// ─── VAR Tier Classification ─────────────────────────────

function getVARTier(varValue: number): VARTier {
    if (varValue >= 30) return "star";
    if (varValue >= 10) return "contributor";
    if (varValue >= -5) return "neutral";
    if (varValue >= -20) return "watch";
    return "risk";
}

// ─── Hot/Cold Streak ─────────────────────────────────────

function computeHotColdStreak(tphValues: number[]): number {
    if (tphValues.length < 2) return 0;
    const avg = mean(tphValues);
    let streak = 0;
    for (let i = tphValues.length - 1; i >= 0; i--) {
        if (streak === 0) {
            streak = tphValues[i] >= avg ? 1 : -1;
        } else if (streak > 0 && tphValues[i] >= avg) {
            streak++;
        } else if (streak < 0 && tphValues[i] < avg) {
            streak--;
        } else {
            break;
        }
    }
    return streak;
}

// ─── Hook ────────────────────────────────────────────────

export function useAgentScoutingData(options: UseAgentScoutingDataOptions) {
    const { agentName, team, breakEven, teamStats } = options;
    const [rawData, setRawData] = useState<RawAgentData | null>(null);
    const [loading, setLoading] = useState(false);

    // Track the agent name we last fetched for to avoid stale updates
    const fetchIdRef = useRef(0);

    // Fetch only depends on agentName — no teamStats/breakEven dependency
    useEffect(() => {
        if (!agentName) {
            setRawData(null);
            return;
        }

        const fetchId = ++fetchIdRef.current;

        // Instant cache hit — no loading flash
        const cached = getCached(agentName);
        if (cached) {
            setRawData(cached);
            setLoading(false);
            return;
        }

        setLoading(true);
        fetchRawAgentData(agentName)
            .then((data) => {
                if (fetchIdRef.current === fetchId) {
                    setRawData(data);
                }
            })
            .catch(() => {})
            .finally(() => {
                if (fetchIdRef.current === fetchId) {
                    setLoading(false);
                }
            });
    }, [agentName]);

    // Compute metrics from raw data + team stats (cheap, no network)
    // This recomputes when teamStats changes but doesn't re-fetch
    const metrics = useMemo((): ScoutingMetrics | null => {
        if (!rawData || !agentName) return null;

        const { statsData, qaData, coachingData, dirData } = rawData;
        const recentDays = statsData?.recentDays || [];
        const tphValues = recentDays.map((d) => Number(d.tph) || 0);
        const avgData = statsData?.averages;

        // VAR: (avg_tph - break_even) × avg_hours × revenue_per_transfer
        const avgTph = avgData?.tph ?? mean(tphValues);
        const avgHours = avgData?.hours_worked ?? mean(recentDays.map((d) => Number(d.hours_worked) || 0));
        const revenueRate = getRevenuePerTransfer(team);
        const varValue = (avgTph - breakEven) * avgHours * revenueRate;
        const varTier = getVARTier(varValue);

        // Consistency Score
        const consistencyScore = computeConsistencyScore(tphValues);

        // Trend (linear regression)
        const regressionPoints = tphValues.map((y, i) => ({ x: i, y }));
        const regression = linearRegression(regressionPoints);
        const trendDirection: "up" | "down" | "flat" =
            regression.r2 < 0.1 ? "flat" : regression.slope > 0 ? "up" : "down";

        // Hot/Cold Streak
        const hotColdStreak = computeHotColdStreak(tphValues);

        // Conversion vs Team
        const agentConv = avgData?.conversion_rate ?? mean(recentDays.map((d) => Number(d.conversion_rate) || 0));
        const convVsTeam = agentConv - teamStats.avgConvRate;

        // Dials/hr & Activity vs Team
        const agentDialsPerHour = avgHours > 0
            ? (avgData?.dials ?? mean(recentDays.map((d) => Number(d.dials) || 0))) / avgHours
            : 0;
        const activityVsTeam = agentDialsPerHour - teamStats.avgDialsPerHour;

        // Cost per SLA
        const wage = dirData?.hourly_wage ? Number(dirData.hourly_wage) : null;
        const costPerSla = wage && avgTph > 0 ? wage / avgTph : null;

        // QA data
        let qaMetrics: ScoutingMetrics["qa"] = null;
        if (qaData) {
            const qaEntry = qaData[agentName] || qaData[agentName.toLowerCase()] || Object.values(qaData)[0];
            if (qaEntry) {
                qaMetrics = {
                    avg_score: qaEntry.avg_score ?? 0,
                    pass_rate: qaEntry.pass_rate ?? 0,
                    auto_fail_count: qaEntry.auto_fail_count ?? 0,
                    total_calls: qaEntry.total_calls ?? 0,
                };
            }
        }

        // Coaching
        const coachingEvents = (coachingData || []).map((e) => ({
            event_date: e.event_date,
            event_type: e.event_type,
            notes: e.notes || "",
        }));

        const lastCoachedDaysAgo = coachingEvents.length > 0
            ? Math.round((Date.now() - new Date(coachingEvents[0].event_date).getTime()) / (1000 * 60 * 60 * 24))
            : null;

        return {
            var_value: Math.round(varValue * 100) / 100,
            var_tier: varTier,
            consistency_score: consistencyScore,
            trend_slope: Math.round(regression.slope * 1000) / 1000,
            trend_r2: Math.round(regression.r2 * 100) / 100,
            trend_direction: trendDirection,
            hot_cold_streak: hotColdStreak,
            conversion_vs_team: Math.round(convVsTeam * 100) / 100,
            dials_per_hour: Math.round(agentDialsPerHour * 10) / 10,
            activity_vs_team: Math.round(activityVsTeam * 10) / 10,
            cost_per_sla: costPerSla ? Math.round(costPerSla * 100) / 100 : null,
            sparkline_14d: tphValues,
            avg_14d: avgData ? {
                tph: avgData.tph,
                conversion_rate: avgData.conversion_rate,
                hours_worked: avgData.hours_worked,
                dials: avgData.dials,
            } : null,
            qa: qaMetrics,
            coaching_events: coachingEvents,
            last_coached_days_ago: lastCoachedDaysAgo,
            employee_id: dirData?.id ?? null,
            slack_user_id: dirData?.slack_user_id ?? null,
            user_image: dirData?.user_image ?? null,
            hired_at: dirData?.hired_at ?? null,
            hourly_wage: wage,
        };
    }, [rawData, agentName, team, breakEven, teamStats]);

    return { metrics, loading };
}

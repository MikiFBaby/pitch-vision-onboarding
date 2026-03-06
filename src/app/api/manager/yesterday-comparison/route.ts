import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCached, setCache } from "@/utils/dialedin-cache";

/**
 * GET /api/manager/yesterday-comparison?team=jade%20aca,aragon
 *
 * Returns yesterday's final results + same-time-yesterday comparison + EOD projection.
 * Used by the Manager GM Cockpit for trend context.
 */

interface AgentYesterday {
    name: string;
    team: string | null;
    transfers: number;
    sla_hr: number;
    hours_worked: number;
}

function getYesterdayET(): string {
    const now = new Date();
    const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    et.setDate(et.getDate() - 1);
    return et.toISOString().slice(0, 10);
}

function getCurrentETHour(): number {
    return parseInt(
        new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }),
    );
}

function parseETHour(ts: string): number {
    return parseInt(
        new Date(ts).toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }),
    );
}

// Business hours: 10 AM – 7 PM ET (9 hours)
const BUSINESS_START_HOUR = 10;
const BUSINESS_END_HOUR = 19;
const TOTAL_BUSINESS_HOURS = BUSINESS_END_HOUR - BUSINESS_START_HOUR;

export async function GET(req: NextRequest) {
    const teamParam = req.nextUrl.searchParams.get("team") || "";
    const teamFilters = teamParam
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

    const yesterday = getYesterdayET();
    const currentHour = getCurrentETHour();

    // Cache keyed by team + hour — yesterday's perf is static, same-time changes hourly
    const cacheKey = `yesterday-comparison:${teamParam}:${currentHour}`;
    const cached = getCached<Record<string, unknown>>(cacheKey);
    if (cached) return NextResponse.json(cached);

    // --- Fetch perf + snapshots in PARALLEL (both independent, both DB-team-filtered) ---
    const PAGE = 5000;

    async function fetchPerfRows(): Promise<AgentYesterday[]> {
        const rows: AgentYesterday[] = [];
        let offset = 0;
        while (true) {
            let q = supabaseAdmin
                .from("dialedin_agent_performance")
                .select("agent_name, team, transfers, sla_hr, hours_worked")
                .eq("report_date", yesterday)
                .range(offset, offset + PAGE - 1);

            if (teamFilters.length === 1) {
                q = q.ilike("team", `%${teamFilters[0]}%`);
            } else if (teamFilters.length > 1) {
                q = q.or(teamFilters.map((t) => `team.ilike.%${t}%`).join(","));
            }

            const { data, error } = await q;
            if (error) throw new Error(error.message);
            if (!data || data.length === 0) break;

            for (const row of data) {
                rows.push({
                    name: row.agent_name,
                    team: row.team,
                    transfers: Number(row.transfers) || 0,
                    sla_hr: Number(row.sla_hr) || 0,
                    hours_worked: Number(row.hours_worked) || 0,
                });
            }
            if (data.length < PAGE) break;
            offset += PAGE;
        }
        return rows;
    }

    type SnapRow = { snapshot_at: string; agent_name: string; team: string | null; transfers: number; sla_hr: number; hours_worked: number };

    async function fetchSnapshotRows(): Promise<SnapRow[]> {
        const rows: SnapRow[] = [];
        let offset = 0;
        while (true) {
            let q = supabaseAdmin
                .from("dialedin_intraday_snapshots")
                .select("snapshot_at, agent_name, team, transfers, sla_hr, hours_worked")
                .eq("snapshot_date", yesterday)
                .order("snapshot_at", { ascending: true })
                .range(offset, offset + PAGE - 1);

            if (teamFilters.length === 1) {
                q = q.ilike("team", `%${teamFilters[0]}%`);
            } else if (teamFilters.length > 1) {
                q = q.or(teamFilters.map((t) => `team.ilike.%${t}%`).join(","));
            }

            const { data } = await q;
            if (!data || data.length === 0) break;
            for (const row of data) rows.push(row as SnapRow);
            if (data.length < PAGE) break;
            offset += PAGE;
        }
        return rows;
    }

    type HistoricPerfRow = { report_date: string; transfers: number; agent_name: string };

    async function fetchHistoricPerf(): Promise<HistoricPerfRow[]> {
        // 14 days ending at yesterday: (yesterday - 13) through (yesterday - 1)
        // Yesterday itself comes from perfRows
        const startDate = new Date(yesterday + "T12:00:00Z");
        startDate.setDate(startDate.getDate() - 13);
        const startStr = startDate.toISOString().slice(0, 10);

        const rows: HistoricPerfRow[] = [];
        let offset = 0;
        while (true) {
            let q = supabaseAdmin
                .from("dialedin_agent_performance")
                .select("report_date, transfers, agent_name")
                .gte("report_date", startStr)
                .lt("report_date", yesterday)
                .range(offset, offset + PAGE - 1);

            if (teamFilters.length === 1) {
                q = q.ilike("team", `%${teamFilters[0]}%`);
            } else if (teamFilters.length > 1) {
                q = q.or(teamFilters.map((t) => `team.ilike.%${t}%`).join(","));
            }

            const { data } = await q;
            if (!data || data.length === 0) break;
            for (const row of data) {
                rows.push({
                    report_date: row.report_date,
                    transfers: Number(row.transfers) || 0,
                    agent_name: row.agent_name,
                });
            }
            if (data.length < PAGE) break;
            offset += PAGE;
        }
        return rows;
    }

    let perfRows: AgentYesterday[];
    let snapRows: SnapRow[];
    let historicRows: HistoricPerfRow[];

    try {
        [perfRows, snapRows, historicRows] = await Promise.all([
            fetchPerfRows(), fetchSnapshotRows(), fetchHistoricPerf(),
        ]);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }

    // --- 1. Aggregate yesterday's performance ---
    const totalTransfers = perfRows.reduce((s, r) => s + r.transfers, 0);
    const totalHours = perfRows.reduce((s, r) => s + r.hours_worked, 0);
    const qualified = perfRows.filter((r) => r.hours_worked >= 2);
    const avgSlaHr = qualified.length > 0
        ? qualified.reduce((s, r) => s + r.sla_hr, 0) / qualified.length
        : 0;

    // Top 3 / Bottom 3
    const sorted = [...qualified].sort((a, b) => b.sla_hr - a.sla_hr);
    const top3 = sorted.slice(0, 3).map((a) => ({ name: a.name, sla_hr: a.sla_hr, transfers: a.transfers }));
    const bottom3 = sorted.slice(-3).reverse().map((a) => ({ name: a.name, sla_hr: a.sla_hr, transfers: a.transfers }));

    // Per-agent map for the agent table "yesterday" column
    const agentYesterdayMap: Record<string, { sla_hr: number; transfers: number }> = {};
    for (const r of perfRows) {
        if (!agentYesterdayMap[r.name]) {
            agentYesterdayMap[r.name] = { sla_hr: r.sla_hr, transfers: r.transfers };
        } else {
            agentYesterdayMap[r.name].transfers += r.transfers;
            agentYesterdayMap[r.name].sla_hr = Math.max(agentYesterdayMap[r.name].sla_hr, r.sla_hr);
        }
    }

    // --- 2. Same-time yesterday from intraday snapshots ---
    let sameTimeData: { total_transfers: number; avg_sla_hr: number; agent_count: number; snapshot_hour: number } | null = null;

    const byTimestamp = new Map<string, SnapRow[]>();
    for (const r of snapRows) {
        const group = byTimestamp.get(r.snapshot_at) || [];
        group.push(r);
        byTimestamp.set(r.snapshot_at, group);
    }

    if (byTimestamp.size > 0) {
        let bestTimestamp = "";
        let bestDiff = Infinity;

        for (const ts of byTimestamp.keys()) {
            const diff = Math.abs(parseETHour(ts) - currentHour);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestTimestamp = ts;
            }
        }

        if (bestTimestamp) {
            const snapData = byTimestamp.get(bestTimestamp) || [];
            const active = snapData.filter((r) => r.hours_worked > 0);

            sameTimeData = {
                snapshot_hour: parseETHour(bestTimestamp),
                total_transfers: snapData.reduce((s, r) => s + r.transfers, 0),
                avg_sla_hr: active.length > 0
                    ? active.reduce((s, r) => s + r.sla_hr, 0) / active.length
                    : 0,
                agent_count: active.length,
            };
        }
    }

    // --- 2b. Hourly completion curve from yesterday's snapshots ---
    const completionCurve: { hour: number; pct_of_daily: number }[] = [];
    if (byTimestamp.size > 0) {
        const hourlyTotals = new Map<number, number>();
        for (const [ts, rows] of byTimestamp.entries()) {
            const hour = parseETHour(ts);
            const total = rows.reduce((s, r) => s + r.transfers, 0);
            hourlyTotals.set(hour, Math.max(hourlyTotals.get(hour) || 0, total));
        }
        const finalTotal = Math.max(...hourlyTotals.values(), 1);
        for (const [hour, total] of [...hourlyTotals.entries()].sort(([a], [b]) => a - b)) {
            completionCurve.push({
                hour,
                pct_of_daily: Math.round((total / finalTotal) * 1000) / 1000,
            });
        }
    }

    // --- 3. Historic context from 14-day performance ---
    const dailyTotals = new Map<string, { transfers: number; agents: Set<string> }>();
    for (const r of perfRows) {
        const entry = dailyTotals.get(yesterday) || { transfers: 0, agents: new Set<string>() };
        entry.transfers += r.transfers;
        entry.agents.add(r.name);
        dailyTotals.set(yesterday, entry);
    }
    for (const r of historicRows) {
        const entry = dailyTotals.get(r.report_date) || { transfers: 0, agents: new Set<string>() };
        entry.transfers += r.transfers;
        entry.agents.add(r.agent_name);
        dailyTotals.set(r.report_date, entry);
    }

    const dailyEntries = [...dailyTotals.entries()];
    const avgDailyTransfers14d = dailyEntries.length > 0
        ? Math.round(dailyEntries.reduce((s, [, d]) => s + d.transfers, 0) / dailyEntries.length)
        : 0;
    const avgDailyAgents14d = dailyEntries.length > 0
        ? Math.round((dailyEntries.reduce((s, [, d]) => s + d.agents.size, 0) / dailyEntries.length) * 10) / 10
        : 0;

    // DOW average (same day-of-week as today)
    const todayET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const todayDOW = todayET.getDay();
    const dowEntries = dailyEntries.filter(([date]) => new Date(date + "T12:00:00Z").getUTCDay() === todayDOW);
    const dowAvgTransfers = dowEntries.length > 0
        ? Math.round(dowEntries.reduce((s, [, d]) => s + d.transfers, 0) / dowEntries.length)
        : 0;

    // --- 4. EOD Projection ---
    const hoursElapsed = Math.max(currentHour - BUSINESS_START_HOUR, 0.5);
    const hoursRemaining = Math.max(BUSINESS_END_HOUR - currentHour, 0);

    // We need today's current SLA total — caller will pass it or we compute from query param
    // For now, return the projection formula inputs so the client can compute with its live data
    const confidence: "high" | "medium" | "low" =
        currentHour >= 15 ? "high" : currentHour >= 12 ? "medium" : "low";

    const result = {
        yesterday: {
            date: yesterday,
            total_transfers: totalTransfers,
            total_hours: Math.round(totalHours * 10) / 10,
            avg_sla_hr: Math.round(avgSlaHr * 100) / 100,
            agent_count: perfRows.length,
            qualified_count: qualified.length,
            top_agents: top3,
            bottom_agents: bottom3,
        },
        same_time_yesterday: sameTimeData,
        eod_projection: {
            hours_elapsed: Math.round(hoursElapsed * 10) / 10,
            hours_remaining: hoursRemaining,
            total_business_hours: TOTAL_BUSINESS_HOURS,
            confidence,
            historic_context: {
                avg_daily_transfers_14d: avgDailyTransfers14d,
                dow_avg_transfers: dowAvgTransfers,
                dow_sample_count: dowEntries.length,
                yesterday_final_transfers: totalTransfers,
                yesterday_same_time_transfers: sameTimeData?.total_transfers ?? null,
                avg_daily_agents_14d: avgDailyAgents14d,
                hourly_completion_curve: completionCurve,
            },
        },
        agent_yesterday: agentYesterdayMap,
    };

    // Cache for 15 min — hour-keyed so same-time comparison updates when hour changes
    setCache(cacheKey, result, 15 * 60_000);
    return NextResponse.json(result);
}

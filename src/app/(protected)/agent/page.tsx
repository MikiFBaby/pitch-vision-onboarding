"use client";
import React, { useState, useEffect, useMemo } from "react";
import StatsCard from "@/components/dashboard/StatsCard";
import RecentCallsTable from "@/components/dashboard/RecentCallsTable";
import InteractiveChart from "@/components/dashboard/InteractiveChart";
import VoiceTrainingAgent from "@/components/dashboard/VoiceTrainingAgent";
import { useAuth } from "@/context/AuthContext";
import { useAgentDialedinStats } from "@/hooks/useAgentDialedinStats";
import { useIntradayData } from "@/hooks/useIntradayData";
import { CheckCircle, Clock, Trophy, TrendingUp, Phone, DollarSign, BarChart2, Coins, Zap, Target } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    available: { label: "AVAILABLE", color: "bg-emerald-500" },
    on_call: { label: "ON CALL", color: "bg-amber-500" },
    wrap: { label: "WRAP UP", color: "bg-blue-500" },
    paused: { label: "ON BREAK", color: "bg-orange-500" },
};

export default function AgentDashboard() {
    const { user, profile } = useAuth();
    const [pitchPoints, setPitchPoints] = useState<number | null>(null);

    // Build agent name for DialedIn matching
    const agentName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();

    // Fetch real DialedIn stats
    const { latest, recentDays, averages, liveStatus, hasLiveData, loading: statsLoading } =
        useAgentDialedinStats(agentName);

    // Fetch intraday data for this agent (live scraper snapshots)
    const { data: intradayData, loading: intradayLoading } = useIntradayData({
        agent: agentName || undefined,
        includeRank: true,
        includeTrend: true,
        interval: 120_000,
        enabled: !!agentName && agentName.length >= 2,
    });

    // Extract this agent's data from intraday response
    const intradayAgent = useMemo(() => {
        if (!intradayData?.agents?.length) return null;
        return intradayData.agents[0] ?? null;
    }, [intradayData]);

    // Determine break-even threshold from agent's team
    const agentBreakEven = useMemo(() => {
        if (!intradayAgent?.team || !intradayData?.break_even) return intradayData?.break_even?.aca ?? 2.5;
        const team = intradayAgent.team.toLowerCase();
        if (team.includes('aragon') || team.includes('medicare') || team.includes('whatif') || team.includes('elite') || team.includes('brandon')) {
            return intradayData.break_even.medicare;
        }
        return intradayData.break_even.aca;
    }, [intradayAgent, intradayData]);

    // Hourly deltas for mini chart
    const intradayHourlyDeltas = useMemo(() => {
        const trend = intradayData?.agent_hourly_trend;
        if (!trend || trend.length === 0) return [];
        return trend.map((h, i) => ({
            hour: h.hour,
            sla_delta: i === 0 ? h.sla_total : h.sla_total - trend[i - 1].sla_total,
            sla_total: h.sla_total,
        }));
    }, [intradayData]);

    useEffect(() => {
        if (profile?.id) {
            fetch(`/api/pitch-points/balance?userId=${profile.id}`)
                .then(r => r.json())
                .then(data => {
                    if (data.success) setPitchPoints(data.balance.current_balance);
                })
                .catch(() => {});
        }
    }, [profile?.id]);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 17) return "Good afternoon";
        return "Good evening";
    };

    const userName = profile?.first_name || user?.displayName?.split(" ")[0] || "Agent";

    // Performance chart data from real DialedIn data (or placeholder)
    const chartData = recentDays.length > 0
        ? [...recentDays].reverse().map(d => ({
            label: d.report_date.slice(5), // "MM-DD"
            value: d.tph,
        }))
        : [{ label: "—", value: 0 }];

    // Live status info
    const statusInfo = liveStatus?.current_status ? STATUS_LABELS[liveStatus.current_status] : null;

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="flex flex-col gap-1">
                    <h2 className="text-3xl font-bold tracking-tight text-white group cursor-default">
                        Dashboard
                        <span className="inline-block ml-2 w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    </h2>
                    <p className="text-white/50 text-sm font-medium">
                        {getGreeting()}, <span className="text-white font-bold">{userName}</span>. Here&apos;s your performance summary.
                    </p>
                </div>

                {/* Live Status Banner */}
                {hasLiveData && statusInfo && liveStatus && (
                    <div className="glass-card rounded-xl border-white/5 p-4 flex items-center gap-4">
                        <span className={`w-3 h-3 rounded-full ${statusInfo.color} animate-pulse shrink-0`} />
                        <div>
                            <p className="text-white font-bold text-sm">
                                You are <span className="text-emerald-400">{statusInfo.label}</span>
                                {liveStatus.current_campaign && (
                                    <span className="text-white/50 font-normal"> on {liveStatus.current_campaign}</span>
                                )}
                            </p>
                            <p className="text-white/40 text-xs font-mono mt-0.5">
                                Session: {liveStatus.session_transfers || 0} SLA
                                {" · "}{liveStatus.session_dials || 0} dials
                                {" · "}{liveStatus.session_connects || 0} connects
                            </p>
                        </div>
                    </div>
                )}

                {/* Today's Intraday Performance */}
                {!intradayLoading && intradayAgent && (
                    <div className="glass-card rounded-xl border-white/5 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest">Today&apos;s Performance</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {intradayData?.stale && (
                                    <span className="text-[10px] text-amber-400/80 font-mono">stale</span>
                                )}
                                <span className="text-[10px] text-white/40 font-mono">
                                    {intradayData?.latest_snapshot_at
                                        ? new Date(intradayData.latest_snapshot_at).toLocaleTimeString("en-US", {
                                            timeZone: "America/New_York",
                                            hour: "numeric",
                                            minute: "2-digit",
                                        })
                                        : ""}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {/* SLA/hr vs Break-Even */}
                            <div className="bg-white/5 rounded-lg p-3">
                                <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">SLA/hr</div>
                                <div className={`text-xl font-bold font-mono tabular-nums ${intradayAgent.sla_hr >= agentBreakEven ? "text-emerald-400" : "text-red-400"}`}>
                                    {intradayAgent.sla_hr.toFixed(2)}
                                </div>
                                <div className={`text-[10px] font-mono mt-0.5 ${intradayAgent.sla_hr >= agentBreakEven ? "text-emerald-400/70" : "text-red-400/70"}`}>
                                    {intradayAgent.sla_hr >= agentBreakEven ? "+" : ""}{(intradayAgent.sla_hr - agentBreakEven).toFixed(2)} vs B/E ({agentBreakEven})
                                </div>
                            </div>

                            {/* Transfers */}
                            <div className="bg-white/5 rounded-lg p-3">
                                <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">SLAs Today</div>
                                <div className="text-xl font-bold font-mono tabular-nums text-white">
                                    {intradayAgent.transfers}
                                </div>
                                <div className="text-[10px] text-white/40 font-mono mt-0.5">
                                    {intradayAgent.dialed} dialed
                                </div>
                            </div>

                            {/* Hours Worked */}
                            <div className="bg-white/5 rounded-lg p-3">
                                <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">Hours Today</div>
                                <div className="text-xl font-bold font-mono tabular-nums text-white">
                                    {intradayAgent.hours_worked.toFixed(1)}h
                                </div>
                                <div className="text-[10px] text-white/40 font-mono mt-0.5">
                                    {intradayAgent.connects} connects
                                </div>
                            </div>

                            {/* Rank */}
                            <div className="bg-white/5 rounded-lg p-3">
                                <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">Today&apos;s Rank</div>
                                <div className="text-xl font-bold font-mono tabular-nums text-amber-400">
                                    {intradayAgent.rank ? `#${intradayAgent.rank}` : "—"}
                                </div>
                                <div className="text-[10px] text-white/40 font-mono mt-0.5">
                                    of {intradayData?.total_agents_ranked ?? "—"} agents
                                </div>
                            </div>
                        </div>

                        {/* Mini Hourly Progression Chart */}
                        {intradayHourlyDeltas.length > 1 && (
                            <div className="flex items-end gap-0.5 h-8">
                                {intradayHourlyDeltas.map((h) => {
                                    const maxDelta = Math.max(...intradayHourlyDeltas.map((d) => d.sla_delta), 1);
                                    return (
                                        <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full" title={`${h.hour > 12 ? h.hour - 12 : h.hour}${h.hour >= 12 ? "PM" : "AM"}: +${h.sla_delta} SLA (${h.sla_total} total)`}>
                                            <div
                                                className="w-full max-w-[20px] bg-emerald-500/50 rounded-t"
                                                style={{ height: `${Math.max((h.sla_delta / maxDelta) * 100, 8)}%` }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Stats Cards - Row 1 */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <StatsCard
                        index={0}
                        title="Compliance Score"
                        value={statsLoading ? "—" : "—"}
                        trend="neutral"
                        trendValue="QA"
                        icon={<CheckCircle size={18} />}
                    />
                    <StatsCard
                        index={1}
                        title="Calls Analyzed"
                        value={statsLoading ? "—" : "—"}
                        trend="neutral"
                        trendValue="QA"
                        icon={<TrendingUp size={18} />}
                    />
                    <StatsCard
                        index={2}
                        title="Dials (Latest)"
                        value={statsLoading ? "—" : (latest?.dials?.toLocaleString() || "—")}
                        trend={latest && averages ? (latest.dials > averages.dials ? "up" : latest.dials < averages.dials ? "down" : "neutral") : "neutral"}
                        trendValue={averages ? `avg ${averages.dials}` : ""}
                        icon={<Phone size={18} />}
                    />
                    <StatsCard
                        index={3}
                        title="Avg SLA / Hour"
                        value={statsLoading ? "—" : (averages?.tph?.toFixed(2) || "—")}
                        trend={latest && averages ? (latest.tph > averages.tph ? "up" : latest.tph < averages.tph ? "down" : "neutral") : "neutral"}
                        trendValue={intradayAgent ? `live ${intradayAgent.sla_hr.toFixed(2)}` : (latest ? `today ${latest.tph.toFixed(2)}` : "")}
                        icon={<BarChart2 size={18} />}
                    />
                </div>

                {/* Stats Cards - Row 2 */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <StatsCard
                        index={4}
                        title="Hours Worked (7d)"
                        value={statsLoading ? "—" : (averages ? `${(averages.hours_worked * (recentDays.length || 1)).toFixed(1)}h` : "—")}
                        trend="neutral"
                        trendValue={averages ? `avg ${averages.hours_worked.toFixed(1)}h/day` : ""}
                        icon={<DollarSign size={18} />}
                    />
                    <StatsCard
                        index={5}
                        title="Pitch Points"
                        value={pitchPoints !== null ? pitchPoints.toLocaleString() : "—"}
                        trend="up"
                        trendValue="rewards"
                        icon={<Coins size={18} />}
                    />
                    <StatsCard
                        index={6}
                        title="Conversion Rate"
                        value={statsLoading ? "—" : (latest?.conversion_rate != null ? `${latest.conversion_rate.toFixed(1)}%` : "—")}
                        trend={latest && averages ? (latest.conversion_rate > averages.conversion_rate ? "up" : latest.conversion_rate < averages.conversion_rate ? "down" : "neutral") : "neutral"}
                        trendValue={averages ? `avg ${averages.conversion_rate.toFixed(1)}%` : ""}
                        icon={<Clock size={18} />}
                    />
                    <StatsCard
                        index={7}
                        title="Global Rank"
                        value={intradayAgent?.rank ? `#${intradayAgent.rank}` : (statsLoading ? "—" : (latest?.tph_rank ? `#${latest.tph_rank}` : "—"))}
                        trend="neutral"
                        trendValue={intradayAgent?.rank ? `of ${intradayData?.total_agents_ranked ?? "—"} today` : (latest?.tph_rank ? "by SLA/hr" : "")}
                        icon={<Trophy size={18} />}
                    />
                </div>

                {/* AI Voice Training Agent */}
                <VoiceTrainingAgent scenariosAvailable={3} />

                {/* Performance Chart */}
                <div className="glass-card p-6 rounded-2xl border-white/5">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-white uppercase tracking-widest">Performance History</h3>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                                {recentDays.length > 0 ? `LAST ${recentDays.length} DAYS — SLA/HR` : "LAST 7 DAYS"}
                            </span>
                        </div>
                    </div>
                    {!statsLoading && recentDays.length === 0 && (
                        <div className="flex items-center justify-center h-[120px]">
                            <span className="text-white/20 text-sm font-mono">No performance data yet</span>
                        </div>
                    )}
                    {(statsLoading || recentDays.length > 0) && (
                        <InteractiveChart
                            data={chartData}
                            color="#38bdf8"
                            height={120}
                        />
                    )}
                </div>

                {/* Recent Calls */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold tracking-tight text-white uppercase tracking-[0.1em]">Recent Analyzed Calls</h3>
                        <button className="text-[10pt] font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-widest">
                            View All Calls →
                        </button>
                    </div>
                    <RecentCallsTable />
                </div>
            </div>
        </DashboardLayout>
    );
}

"use client";

import React, { useMemo } from "react";
import StatsCard from "@/components/dashboard/StatsCard";
import InteractiveChart from "@/components/dashboard/InteractiveChart";
import VoiceTrainingAgent from "@/components/dashboard/VoiceTrainingAgent";
import EventFeed, { type FeedEvent } from "@/components/agent/EventFeed";
import { CheckCircle, Clock, Trophy, TrendingUp, Phone, BarChart2, Coins, ShieldCheck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import type { IntradayData, IntradayAgentRow, LiveAgentStatus, AgentPerformance } from "@/types/dialedin-types";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    available: { label: "AVAILABLE", color: "bg-emerald-500" },
    on_call: { label: "ON CALL", color: "bg-amber-500" },
    wrap: { label: "WRAP UP", color: "bg-blue-500" },
    paused: { label: "ON BREAK", color: "bg-orange-500" },
};

interface AgentQA { avg_score: number; total_calls: number; auto_fail_count: number; pass_rate: number }
interface RecentCall { id: number; call_date: string; phone_number: string; compliance_score: number | null; auto_fail_triggered: boolean; risk_level: string; call_duration: string | null; product_type: string | null }

interface AgentDashboardTabProps {
    userName: string;
    intradayAgent: IntradayAgentRow | null;
    intradayData: IntradayData | null;
    intradayLoading: boolean;
    liveStatus: LiveAgentStatus | null;
    hasLiveData: boolean;
    recentDays: AgentPerformance[];
    averages: { tph: number; dials: number; conversion_rate: number; hours_worked: number } | null;
    latest: AgentPerformance | null;
    qaStats: AgentQA | null;
    recentCalls: RecentCall[];
    callsLoading: boolean;
    statsLoading: boolean;
    qaLoading: boolean;
    agentBreakEven: number;
    pitchPoints: number | null;
}

export default function AgentDashboardTab({
    userName,
    intradayAgent,
    intradayData,
    intradayLoading,
    liveStatus,
    hasLiveData,
    recentDays,
    averages,
    latest,
    qaStats,
    recentCalls,
    callsLoading,
    statsLoading,
    qaLoading,
    agentBreakEven,
    pitchPoints,
}: AgentDashboardTabProps) {
    const intradayHourlyDeltas = useMemo(() => {
        const trend = intradayData?.agent_hourly_trend;
        if (!trend || trend.length === 0) return [];
        return trend.map((h, i) => ({
            hour: h.hour,
            sla_delta: i === 0 ? h.sla_total : h.sla_total - trend[i - 1].sla_total,
            sla_total: h.sla_total,
        }));
    }, [intradayData]);

    const chartData = recentDays.length > 0
        ? [...recentDays].reverse().map(d => ({ label: d.report_date.slice(5), value: d.tph }))
        : [{ label: "—", value: 0 }];

    const statusInfo = liveStatus?.current_status ? STATUS_LABELS[liveStatus.current_status] : null;

    // Build event feed from available data
    const feedEvents = useMemo((): FeedEvent[] => {
        const events: FeedEvent[] = [];

        // Transfer delta events from hourly trend
        if (intradayHourlyDeltas.length > 0) {
            for (const h of intradayHourlyDeltas) {
                if (h.sla_delta > 0) {
                    const ampm = h.hour >= 12 ? "PM" : "AM";
                    const displayHour = h.hour > 12 ? h.hour - 12 : h.hour === 0 ? 12 : h.hour;
                    events.push({
                        id: `transfer-${h.hour}`,
                        type: "transfer",
                        title: `+${h.sla_delta} SLA${h.sla_delta > 1 ? "s" : ""} this hour`,
                        subtitle: `${h.sla_total} total today`,
                        timestamp: `${displayHour} ${ampm}`,
                    });
                }
            }
        }

        // QA result events from recent calls
        for (const call of recentCalls.slice(0, 5)) {
            events.push({
                id: `qa-${call.id}`,
                type: "qa",
                title: call.auto_fail_triggered
                    ? `Auto-Fail on ${call.product_type || "call"}`
                    : `QA ${call.compliance_score ?? "—"}% on ${call.product_type || "call"}`,
                subtitle: call.phone_number ? `***-${call.phone_number.slice(-4)}` : undefined,
                timestamp: call.call_date ? new Date(call.call_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "",
            });
        }

        return events;
    }, [intradayHourlyDeltas, recentCalls]);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 17) return "Good afternoon";
        return "Good evening";
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-1">
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
                        <div className="bg-white/5 rounded-lg p-3">
                            <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">SLA/hr</div>
                            <div className={`text-xl font-bold font-mono tabular-nums ${intradayAgent.sla_hr >= agentBreakEven ? "text-emerald-400" : "text-red-400"}`}>
                                {intradayAgent.sla_hr.toFixed(2)}
                            </div>
                            <div className={`text-[10px] font-mono mt-0.5 ${intradayAgent.sla_hr >= agentBreakEven ? "text-emerald-400/70" : "text-red-400/70"}`}>
                                {intradayAgent.sla_hr >= agentBreakEven ? "+" : ""}{(intradayAgent.sla_hr - agentBreakEven).toFixed(2)} vs B/E ({agentBreakEven})
                            </div>
                        </div>
                        <div className="bg-white/5 rounded-lg p-3">
                            <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">SLAs Today</div>
                            <div className="text-xl font-bold font-mono tabular-nums text-white">{intradayAgent.transfers}</div>
                            <div className="text-[10px] text-white/40 font-mono mt-0.5">{intradayAgent.dialed} dialed</div>
                        </div>
                        <div className="bg-white/5 rounded-lg p-3">
                            <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">Hours Today</div>
                            <div className="text-xl font-bold font-mono tabular-nums text-white">{intradayAgent.hours_worked.toFixed(1)}h</div>
                            <div className="text-[10px] text-white/40 font-mono mt-0.5">{intradayAgent.connects} connects</div>
                        </div>
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

            {/* Event Feed */}
            {feedEvents.length > 0 && (
                <div className="glass-card rounded-xl border-white/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-[11px] font-bold text-white/50 uppercase tracking-widest">Activity Feed</span>
                    </div>
                    <EventFeed events={feedEvents} />
                </div>
            )}

            {/* Stats Cards - Row 1 */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <StatsCard index={0} title="Compliance Score" value={qaLoading ? "—" : (qaStats ? `${qaStats.avg_score}%` : "—")} trend={qaStats ? (qaStats.avg_score >= 80 ? "up" : qaStats.avg_score >= 60 ? "neutral" : "down") : "neutral"} trendValue={qaStats ? `${qaStats.pass_rate}% pass` : "No QA data"} icon={<CheckCircle size={18} />} />
                <StatsCard index={1} title="Calls Analyzed" value={qaLoading ? "—" : (qaStats ? `${qaStats.total_calls}` : "0")} trend={qaStats?.auto_fail_count ? "down" : "neutral"} trendValue={qaStats?.auto_fail_count ? `${qaStats.auto_fail_count} auto-fails` : "30d"} icon={<TrendingUp size={18} />} />
                <StatsCard index={2} title="Dials (Latest)" value={statsLoading ? "—" : (latest?.dials?.toLocaleString() || "—")} trend={latest && averages ? (latest.dials > averages.dials ? "up" : latest.dials < averages.dials ? "down" : "neutral") : "neutral"} trendValue={averages ? `avg ${averages.dials}` : ""} icon={<Phone size={18} />} />
                <StatsCard index={3} title="Avg SLA / Hour" value={statsLoading ? "—" : (averages?.tph?.toFixed(2) || "—")} trend={latest && averages ? (latest.tph > averages.tph ? "up" : latest.tph < averages.tph ? "down" : "neutral") : "neutral"} trendValue={intradayAgent ? `live ${intradayAgent.sla_hr.toFixed(2)}` : (latest ? `today ${latest.tph.toFixed(2)}` : "")} icon={<BarChart2 size={18} />} />
            </div>

            {/* Stats Cards - Row 2 */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <StatsCard index={4} title="Hours Worked (7d)" value={statsLoading ? "—" : (averages ? `${(averages.hours_worked * (recentDays.length || 1)).toFixed(1)}h` : "—")} trend="neutral" trendValue={averages ? `avg ${averages.hours_worked.toFixed(1)}h/day` : ""} icon={<Clock size={18} />} />
                <StatsCard index={5} title="Pitch Points" value={pitchPoints !== null ? pitchPoints.toLocaleString() : "—"} trend="up" trendValue="rewards" icon={<Coins size={18} />} />
                <StatsCard index={6} title="Conversion Rate" value={statsLoading ? "—" : (latest?.conversion_rate != null ? `${latest.conversion_rate.toFixed(1)}%` : "—")} trend={latest && averages ? (latest.conversion_rate > averages.conversion_rate ? "up" : latest.conversion_rate < averages.conversion_rate ? "down" : "neutral") : "neutral"} trendValue={averages ? `avg ${averages.conversion_rate.toFixed(1)}%` : ""} icon={<Clock size={18} />} />
                <StatsCard index={7} title="Global Rank" value={intradayAgent?.rank ? `#${intradayAgent.rank}` : (statsLoading ? "—" : (latest?.tph_rank ? `#${latest.tph_rank}` : "—"))} trend="neutral" trendValue={intradayAgent?.rank ? `of ${intradayData?.total_agents_ranked ?? "—"} today` : (latest?.tph_rank ? "by SLA/hr" : "")} icon={<Trophy size={18} />} />
            </div>

            <VoiceTrainingAgent scenariosAvailable={3} />

            {/* Performance Chart */}
            <div className="glass-card p-6 rounded-2xl border-white/5">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-white uppercase tracking-widest">Performance History</h3>
                    <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                        {recentDays.length > 0 ? `LAST ${recentDays.length} DAYS — SLA/HR` : "LAST 7 DAYS"}
                    </span>
                </div>
                {!statsLoading && recentDays.length === 0 && (
                    <div className="flex items-center justify-center h-[120px]">
                        <span className="text-white/20 text-sm font-mono">No performance data yet</span>
                    </div>
                )}
                {(statsLoading || recentDays.length > 0) && (
                    <InteractiveChart data={chartData} color="#38bdf8" height={120} />
                )}
            </div>

            {/* Recent Analyzed Calls */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold tracking-tight text-white uppercase tracking-[0.1em]">Recent Analyzed Calls</h3>
                    <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                        {recentCalls.length > 0 ? `LAST ${recentCalls.length} CALLS` : "QA PIPELINE"}
                    </span>
                </div>
                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                    className="glass-card rounded-2xl border-white/5 overflow-hidden"
                >
                    {callsLoading ? (
                        <div className="p-6 space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-10 bg-white/5 rounded animate-pulse" />
                            ))}
                        </div>
                    ) : recentCalls.length === 0 ? (
                        <div className="p-8 text-center">
                            <ShieldCheck size={24} className="mx-auto text-white/20 mb-2" />
                            <p className="text-white/30 text-sm">No analyzed calls found in the last 30 days.</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-white/5">
                                <tr className="border-b border-white/5">
                                    <th className="text-[10px] font-bold text-white/40 uppercase tracking-widest py-4 px-4 text-left">Date</th>
                                    <th className="text-[10px] font-bold text-white/40 uppercase tracking-widest py-4 px-4 text-left">Phone</th>
                                    <th className="text-[10px] font-bold text-white/40 uppercase tracking-widest py-4 px-4 text-left">Product</th>
                                    <th className="text-[10px] font-bold text-white/40 uppercase tracking-widest py-4 px-4 text-center">Duration</th>
                                    <th className="text-[10px] font-bold text-white/40 uppercase tracking-widest py-4 px-4 text-center">Score</th>
                                    <th className="text-[10px] font-bold text-white/40 uppercase tracking-widest py-4 px-4 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentCalls.map((call, index) => (
                                    <motion.tr
                                        key={call.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.3, delay: 0.1 + index * 0.05 }}
                                        className="group border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
                                    >
                                        <td className="text-xs text-white/50 py-3.5 px-4 font-mono">
                                            {call.call_date ? new Date(call.call_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
                                        </td>
                                        <td className="text-xs text-white/70 py-3.5 px-4 font-mono">
                                            {call.phone_number ? `${call.phone_number.slice(0, 3)}-***-${call.phone_number.slice(-4)}` : "—"}
                                        </td>
                                        <td className="text-xs text-white/50 py-3.5 px-4 capitalize">{call.product_type || "—"}</td>
                                        <td className="text-xs text-white/40 py-3.5 px-4 text-center font-mono">{call.call_duration || "—"}</td>
                                        <td className="py-3.5 px-4">
                                            <div className="flex justify-center">
                                                <span className={cn(
                                                    "text-xs font-bold px-2 py-0.5 rounded",
                                                    call.compliance_score == null ? "bg-white/5 text-white/30" :
                                                    call.compliance_score >= 80 ? "bg-emerald-500/10 text-emerald-400" :
                                                    call.compliance_score >= 60 ? "bg-amber-500/10 text-amber-400" :
                                                    "bg-red-500/10 text-red-400"
                                                )}>
                                                    {call.compliance_score != null ? `${call.compliance_score}%` : "—"}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="text-right py-3.5 px-4">
                                            {call.auto_fail_triggered ? (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-500/15 text-red-400 px-2 py-0.5 rounded border border-red-500/20">
                                                    <AlertTriangle size={10} />
                                                    Auto-Fail
                                                </span>
                                            ) : (
                                                <span className={cn(
                                                    "text-[10px] font-bold px-2 py-0.5 rounded border",
                                                    call.risk_level?.toUpperCase() === "HIGH" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                                                    call.risk_level?.toUpperCase() === "MEDIUM" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                                    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                )}>
                                                    {call.risk_level || "Low"}
                                                </span>
                                            )}
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </motion.div>
            </div>
        </div>
    );
}

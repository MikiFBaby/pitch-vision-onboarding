"use client";

import React, { useMemo, useState } from "react";
import AgentCallDetailDrawer from "@/components/agent/AgentCallDetailDrawer";
import AuraCoachOverlay from "@/components/agent/AuraCoachOverlay";
import StatsCard from "@/components/dashboard/StatsCard";
import VoiceTrainingAgent from "@/components/dashboard/VoiceTrainingAgent";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import EventFeed, { type FeedEvent } from "@/components/agent/EventFeed";
import { CheckCircle, Clock, Trophy, TrendingUp, Phone, BarChart2, Coins, ShieldCheck, AlertTriangle, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTier, computeHotStreak } from "@/utils/agent-tiers";
import { motion } from "framer-motion";
import type { IntradayData, IntradayAgentRow, LiveAgentStatus, AgentPerformance } from "@/types/dialedin-types";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    available: { label: "AVAILABLE", color: "bg-emerald-500" },
    on_call: { label: "ON CALL", color: "bg-amber-500" },
    wrap: { label: "WRAP UP", color: "bg-blue-500" },
    paused: { label: "ON BREAK", color: "bg-orange-500" },
};

interface AgentQA { avg_score: number; total_calls: number; auto_fail_count: number; pass_rate: number; manual_violation_count?: number }
interface AutoFailReason { code: string; violation: string; description?: string; timestamp?: string | null; evidence?: string | null }
interface RecentCall { id: number; call_date: string; phone_number: string; compliance_score: number | null; auto_fail_triggered: boolean; auto_fail_reasons?: unknown[] | null; risk_level: string; call_duration: string | null; product_type: string | null; recording_url?: string | null; compliance_checklist?: unknown[] | null }
interface ManualViolation { review_date: string; violation: string; reviewer?: string; campaign?: string; phone_number?: string }

interface AgentDashboardTabProps {
    userName: string;
    agentEmail: string;
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
    manualViolations: ManualViolation[];
    callsLoading: boolean;
    statsLoading: boolean;
    qaLoading: boolean;
    agentBreakEven: number;
    pitchPoints: number | null;
}

export default function AgentDashboardTab({
    userName,
    agentEmail,
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
    manualViolations,
    callsLoading,
    statsLoading,
    qaLoading,
    agentBreakEven,
    pitchPoints,
}: AgentDashboardTabProps) {
    const [selectedCall, setSelectedCall] = useState<RecentCall | null>(null);
    const [trainingOpen, setTrainingOpen] = useState(false);
    const [trainingData, setTrainingData] = useState<{ scenario: string; tips: string[]; af_codes: string[]; key_phrases?: string[] } | null>(null);
    const [trainingLoading, setTrainingLoading] = useState(false);
    const [voicePracticeOpen, setVoicePracticeOpen] = useState(false);

    // Unique AF codes from recent calls for Voice Coach
    const autoFailCodes = useMemo(() => {
        const codes = new Set<string>();
        for (const call of recentCalls) {
            if (call.auto_fail_triggered && call.auto_fail_reasons && Array.isArray(call.auto_fail_reasons)) {
                for (const r of call.auto_fail_reasons as AutoFailReason[]) {
                    const code = typeof r === "string" ? r : r?.code;
                    if (code) codes.add(code);
                }
            }
        }
        return Array.from(codes);
    }, [recentCalls]);

    // Include manual violations as additional context for training
    const manualViolationDescriptions = useMemo(() => {
        return manualViolations.slice(0, 5).map((v) => v.violation).filter(Boolean);
    }, [manualViolations]);

    const totalScenarios = autoFailCodes.length + (manualViolationDescriptions.length > 0 ? 1 : 0);

    const handleStartTraining = async () => {
        setTrainingOpen(true);
        setTrainingLoading(true);
        try {
            const productType = recentCalls.find((c) => c.product_type)?.product_type
                || (intradayAgent?.team?.toLowerCase().includes("aragon") || intradayAgent?.team?.toLowerCase().includes("medicare") ? "Medicare" : undefined);

            // Build performance profile for bespoke coaching
            const days = recentDays || [];
            const slaValues = [...days].reverse().map((d) =>
                d.adjusted_tph != null ? Number(d.adjusted_tph) : (d.sla_hr != null ? Number(d.sla_hr) : Number(d.tph))
            );
            const avgSla = slaValues.length > 0 ? slaValues.reduce((a, b) => a + b, 0) / slaValues.length : null;
            const tier = avgSla != null ? getTier(avgSla) : null;
            const hotStreak = slaValues.length > 0 ? computeHotStreak(slaValues, agentBreakEven) : 0;

            // Trend: compare last 3 days avg vs prior 3 days avg
            let trend: "improving" | "declining" | "stable" = "stable";
            if (slaValues.length >= 6) {
                const recent3 = slaValues.slice(-3).reduce((a, b) => a + b, 0) / 3;
                const prior3 = slaValues.slice(-6, -3).reduce((a, b) => a + b, 0) / 3;
                if (recent3 > prior3 * 1.05) trend = "improving";
                else if (recent3 < prior3 * 0.95) trend = "declining";
            }

            const performanceProfile = {
                avgSlaHr: avgSla != null ? Number(avgSla.toFixed(2)) : null,
                breakEven: agentBreakEven,
                breakEvenGap: avgSla != null ? Number((avgSla - agentBreakEven).toFixed(2)) : null,
                tierName: tier?.name || null,
                hotStreak,
                trend,
                conversionRate: averages?.conversion_rate ?? null,
                avgDials: averages?.dials ?? null,
                avgHoursWorked: averages?.hours_worked ?? null,
                todaySlaHr: intradayAgent?.sla_hr != null ? Number(intradayAgent.sla_hr) : null,
                qaScore: qaStats?.avg_score ?? null,
                qaPassRate: qaStats?.pass_rate ?? null,
                daysOfData: days.length,
            };

            const resp = await fetch("/api/agent/training-scenario", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    agentName: userName,
                    afCodes: autoFailCodes,
                    manualViolations: manualViolationDescriptions,
                    productType,
                    performanceProfile,
                }),
            });
            const data = await resp.json();
            setTrainingData(data);
        } catch {
            setTrainingData({ scenario: "Unable to generate scenario. Please try again.", tips: [], af_codes: autoFailCodes });
        } finally {
            setTrainingLoading(false);
        }
    };

    const intradayHourlyDeltas = useMemo(() => {
        const trend = intradayData?.agent_hourly_trend;
        if (!trend || trend.length === 0) return [];
        return trend.map((h, i) => ({
            hour: h.hour,
            sla_delta: i === 0 ? h.sla_total : h.sla_total - trend[i - 1].sla_total,
            sla_total: h.sla_total,
        }));
    }, [intradayData]);

    const chartData = useMemo(() => {
        if (recentDays.length === 0) return [];
        return [...recentDays].reverse().map(d => ({ date: d.report_date.slice(5), sla_hr: Number(d.tph) }));
    }, [recentDays]);

    const statusInfo = liveStatus?.current_status ? STATUS_LABELS[liveStatus.current_status] : null;

    // Build event feed from available data
    const feedEvents = useMemo((): FeedEvent[] => {
        const events: FeedEvent[] = [];

        // Shift start event
        if (intradayAgent) {
            events.push({
                id: "shift-start",
                type: "shift",
                title: `Shift active — ${intradayAgent.hours_worked.toFixed(1)}h logged`,
                subtitle: `${intradayAgent.team || ""}`,
                timestamp: "Today",
            });
        }

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

        // Tier event
        if (recentDays.length >= 3) {
            const avg7 = recentDays.slice(0, 7).reduce((s, d) => s + Number(d.tph || 0), 0) / Math.min(recentDays.length, 7);
            const tier = getTier(avg7);
            events.push({
                id: "tier-current",
                type: "tier",
                title: `Tier: ${tier.name}`,
                subtitle: `${avg7.toFixed(2)} avg SLA/hr (${Math.min(recentDays.length, 7)}d)`,
                timestamp: "7d avg",
            });
        }

        // Hot streak event
        if (recentDays.length >= 2) {
            const dailySla = [...recentDays].reverse().map((d) => Number(d.tph || 0));
            const streak = computeHotStreak(dailySla, agentBreakEven);
            if (streak >= 2) {
                events.push({
                    id: "streak-hot",
                    type: "streak",
                    title: `${streak}-day hot streak!`,
                    subtitle: `Above break-even (${agentBreakEven}) for ${streak} consecutive days`,
                    timestamp: `${streak}d`,
                });
            }
        }

        // QA result events from recent calls — include AF codes in subtitle
        for (const call of recentCalls.slice(0, 5)) {
            const afReasons = (call.auto_fail_reasons || []) as AutoFailReason[];
            const afCodes = afReasons.map((r) => typeof r === "string" ? r : r.code).filter(Boolean);
            events.push({
                id: `qa-${call.id}`,
                type: "qa",
                title: call.auto_fail_triggered
                    ? `Auto-Fail on ${call.product_type || "call"}${afCodes.length > 0 ? ` (${afCodes.join(", ")})` : ""}`
                    : `QA ${call.compliance_score ?? "—"}% on ${call.product_type || "call"}`,
                subtitle: call.phone_number ? `***-${call.phone_number.slice(-4)}` : undefined,
                timestamp: call.call_date ? new Date(call.call_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "",
            });
        }

        return events;
    }, [intradayHourlyDeltas, recentCalls, intradayAgent, recentDays, agentBreakEven]);

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
                            <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">Leaderboard</div>
                            <div className="text-xl font-bold font-mono tabular-nums text-amber-400">
                                {intradayAgent.campaign_rank ? `#${intradayAgent.campaign_rank}` : (intradayAgent.rank ? `#${intradayAgent.rank}` : "—")}
                            </div>
                            <div className="text-[10px] text-white/40 font-mono mt-0.5">
                                of {intradayAgent.campaign_agents_ranked ?? intradayData?.total_agents_ranked ?? "—"}{" "}
                                {intradayAgent.campaign_family && intradayData?.campaign_family_labels?.[intradayAgent.campaign_family]
                                    ? intradayData.campaign_family_labels[intradayAgent.campaign_family]
                                    : "agents"}
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
                <StatsCard index={4} title="Logged Time (7d)" value={statsLoading ? "—" : (recentDays.length > 0 ? `${recentDays.slice(0, 7).reduce((s, d) => s + Number(d.hours_worked || 0), 0).toFixed(1)}h` : "—")} trend="neutral" trendValue={recentDays.length > 0 ? `avg ${(recentDays.slice(0, 7).reduce((s, d) => s + Number(d.hours_worked || 0), 0) / Math.max(Math.min(recentDays.length, 7), 1)).toFixed(1)}h/day` : ""} icon={<Clock size={18} />} />
                <StatsCard index={5} title="Pitch Points" value={pitchPoints !== null ? pitchPoints.toLocaleString() : "—"} trend="up" trendValue="rewards" icon={<Coins size={18} />} />
                <StatsCard index={6} title="Conversion Rate" value={statsLoading ? "—" : (latest?.conversion_rate != null ? `${latest.conversion_rate.toFixed(1)}%` : "—")} trend={latest && averages ? (latest.conversion_rate > averages.conversion_rate ? "up" : latest.conversion_rate < averages.conversion_rate ? "down" : "neutral") : "neutral"} trendValue={averages ? `avg ${averages.conversion_rate.toFixed(1)}%` : ""} icon={<Clock size={18} />} />
                <StatsCard index={7} title="Leaderboard" value={intradayAgent?.campaign_rank ? `#${intradayAgent.campaign_rank}` : (intradayAgent?.rank ? `#${intradayAgent.rank}` : (statsLoading ? "—" : (latest?.tph_rank ? `#${latest.tph_rank}` : "—")))} trend="neutral" trendValue={intradayAgent?.campaign_rank ? `of ${intradayAgent.campaign_agents_ranked ?? "—"} ${intradayData?.campaign_family_labels?.[intradayAgent.campaign_family ?? ""] ?? ""}` : (intradayAgent?.rank ? `of ${intradayData?.total_agents_ranked ?? "—"} today` : (latest?.tph_rank ? "by SLA/hr" : ""))} icon={<Trophy size={18} />} />
            </div>

            <VoiceTrainingAgent scenariosAvailable={totalScenarios} onStartTraining={handleStartTraining} onTalkToCoach={() => setVoicePracticeOpen(true)} />

            {/* Training Scenario Modal */}
            {trainingOpen && (
                <>
                    <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setTrainingOpen(false)} />
                    <div className="fixed inset-4 md:inset-x-auto md:inset-y-8 md:max-w-2xl md:mx-auto bg-[#0a0a0f] border border-white/10 rounded-2xl z-50 overflow-y-auto">
                        <div className="p-6 space-y-5">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold text-white">AI Training Scenario</h3>
                                <button onClick={() => setTrainingOpen(false)} className="text-white/40 hover:text-white text-sm">Close</button>
                            </div>

                            {trainingLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-3">
                                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                    <p className="text-white/40 text-sm">Generating scenario from your violations...</p>
                                </div>
                            ) : trainingData ? (
                                <>
                                    {/* AF Codes */}
                                    <div className="flex flex-wrap gap-2">
                                        {trainingData.af_codes.map((c) => (
                                            <span key={c} className="text-[10px] font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded font-mono">{c}</span>
                                        ))}
                                    </div>

                                    {/* Scenario */}
                                    <div className="bg-white/5 rounded-xl p-4">
                                        <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{trainingData.scenario}</p>
                                    </div>

                                    {/* Tips */}
                                    {trainingData.tips.length > 0 && (
                                        <div className="space-y-2">
                                            <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Tips</h4>
                                            <ul className="space-y-1.5">
                                                {trainingData.tips.map((tip, i) => (
                                                    <li key={i} className="text-sm text-white/60 flex gap-2">
                                                        <span className="text-indigo-400 shrink-0">-</span>
                                                        {tip}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Key Phrases */}
                                    {trainingData.key_phrases && trainingData.key_phrases.length > 0 && (
                                        <div className="space-y-2">
                                            <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Key Phrases to Use</h4>
                                            <div className="flex flex-wrap gap-2">
                                                {trainingData.key_phrases.map((phrase, i) => (
                                                    <span key={i} className="text-xs text-emerald-400/80 bg-emerald-500/10 px-2 py-1 rounded">&ldquo;{phrase}&rdquo;</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Voice Practice CTA */}
                                    <div className="pt-2 border-t border-white/5">
                                        <button
                                            onClick={() => { setTrainingOpen(false); setVoicePracticeOpen(true); }}
                                            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-600/80 to-cyan-600/80 hover:from-emerald-500 hover:to-cyan-500 rounded-xl text-white font-bold text-sm uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/15 hover:shadow-emerald-500/30"
                                        >
                                            <Mic size={16} />
                                            Practice This Scenario with Voice
                                        </button>
                                        <p className="text-[10px] text-white/25 text-center mt-2">Role-play with an AI customer using your microphone</p>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    </div>
                </>
            )}

            {/* Aura Coach Overlay */}
            {voicePracticeOpen && (
                <AuraCoachOverlay
                    agentName={userName}
                    agentEmail={agentEmail}
                    productType={recentCalls.find((c) => c.product_type)?.product_type || (intradayAgent?.team?.toLowerCase().includes("medicare") ? "Medicare" : "ACA")}
                    afCodes={autoFailCodes}
                    manualViolations={manualViolationDescriptions}
                    performanceProfile={(() => {
                        const days = recentDays || [];
                        const slaValues = [...days].reverse().map((d) =>
                            d.adjusted_tph != null ? Number(d.adjusted_tph) : (d.sla_hr != null ? Number(d.sla_hr) : Number(d.tph))
                        );
                        const avgSla = slaValues.length > 0 ? slaValues.reduce((a, b) => a + b, 0) / slaValues.length : null;
                        return {
                            avgSlaHr: avgSla != null ? Number(avgSla.toFixed(2)) : null,
                            breakEven: agentBreakEven,
                            breakEvenGap: avgSla != null ? Number((avgSla - agentBreakEven).toFixed(2)) : null,
                            tierName: avgSla != null ? getTier(avgSla).name : null,
                            trend: "stable",
                            conversionRate: averages?.conversion_rate ?? null,
                            qaScore: qaStats?.avg_score ?? null,
                        };
                    })()}
                    trainingScenario={trainingData}
                    onClose={() => setVoicePracticeOpen(false)}
                />
            )}

            {/* Performance Chart */}
            <div className="glass-card p-6 rounded-2xl border-white/5">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-white uppercase tracking-widest">Performance History</h3>
                    <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                        {recentDays.length > 0 ? `LAST ${recentDays.length} DAYS — SLA/HR` : "LAST 7 DAYS"}
                    </span>
                </div>
                {!statsLoading && chartData.length === 0 && (
                    <div className="flex items-center justify-center h-[160px]">
                        <span className="text-white/20 text-sm font-mono">No performance data yet</span>
                    </div>
                )}
                {(statsLoading || chartData.length > 0) && (
                    <ResponsiveContainer width="100%" height={160}>
                        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="dashSlaGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} />
                            <Tooltip
                                contentStyle={{ background: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                            />
                            <ReferenceLine y={agentBreakEven} stroke="#ef4444" strokeDasharray="3 3" label={{ value: `B/E ${agentBreakEven}`, fill: "#ef4444", fontSize: 10, position: "right" }} />
                            <Area type="monotone" dataKey="sla_hr" stroke="#38bdf8" strokeWidth={2} fill="url(#dashSlaGradient)" dot={{ fill: "#38bdf8", r: 3 }} />
                        </AreaChart>
                    </ResponsiveContainer>
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
                                        onClick={() => setSelectedCall(call)}
                                        className="group border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors cursor-pointer"
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
                                                <div className="flex flex-col items-end gap-0.5">
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-500/15 text-red-400 px-2 py-0.5 rounded border border-red-500/20">
                                                        <AlertTriangle size={10} />
                                                        Auto-Fail
                                                    </span>
                                                    {call.auto_fail_reasons && Array.isArray(call.auto_fail_reasons) && call.auto_fail_reasons.length > 0 && (
                                                        <span className="text-[9px] text-red-400/60 font-mono">
                                                            {(call.auto_fail_reasons as AutoFailReason[])
                                                                .map((r) => typeof r === "string" ? r : r.code)
                                                                .filter(Boolean)
                                                                .join(", ")}
                                                        </span>
                                                    )}
                                                </div>
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

            {/* QA Violations Summary — auto-fails + manual reviews */}
            {(() => {
                const autoFailCalls = recentCalls.filter((c) => c.auto_fail_triggered && c.auto_fail_reasons && Array.isArray(c.auto_fail_reasons));
                const hasViolations = autoFailCalls.length > 0 || manualViolations.length > 0;
                if (!hasViolations) return null;
                return (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold tracking-tight text-white uppercase tracking-[0.1em]">QA Violations</h3>
                            <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
                                {autoFailCalls.length + manualViolations.length} TOTAL (30D)
                            </span>
                        </div>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5, delay: 0.5 }}
                            className="glass-card rounded-2xl border-white/5 p-4 space-y-3"
                        >
                            {autoFailCalls.map((call) => {
                                const reasons = (call.auto_fail_reasons || []) as AutoFailReason[];
                                return reasons.map((r, ri) => {
                                    const code = typeof r === "string" ? r : r.code;
                                    const violation = typeof r === "string" ? r : (r.violation || "");
                                    const description = typeof r === "string" ? "" : (r.description || "");
                                    const evidence = typeof r === "string" ? "" : (r.evidence || "");
                                    return (
                                        <div key={`af-${call.id}-${ri}`} className="flex items-start gap-3 py-2.5 border-b border-white/5 last:border-0">
                                            <span className="text-[10px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded shrink-0 font-mono">{code}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs text-white/80">{violation || description}</p>
                                                {violation && description && violation !== description && (
                                                    <p className="text-[11px] text-white/50 mt-0.5">{description}</p>
                                                )}
                                                {evidence && (
                                                    <p className="text-[10px] text-white/40 italic mt-1 pl-2 border-l-2 border-white/10 line-clamp-2">&ldquo;{evidence}&rdquo;</p>
                                                )}
                                                <p className="text-[10px] text-white/50 font-mono mt-1">
                                                    {call.call_date ? new Date(call.call_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                                                    {call.phone_number ? ` · ***-${call.phone_number.slice(-4)}` : ""}
                                                    {call.product_type ? ` · ${call.product_type}` : ""}
                                                </p>
                                            </div>
                                            <span className="text-[10px] text-red-400/80 shrink-0 font-bold">Auto-Fail</span>
                                        </div>
                                    );
                                });
                            })}
                            {manualViolations.map((v, i) => (
                                <div key={`mv-${i}`} className="flex items-start gap-3 py-2.5 border-b border-white/5 last:border-0">
                                    <span className="text-[10px] font-bold text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded shrink-0">QA</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-white/80">{v.violation}</p>
                                        <p className="text-[10px] text-white/50 font-mono mt-1">
                                            {v.review_date ? new Date(v.review_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                                            {v.phone_number ? ` · ***-${v.phone_number.slice(-4)}` : ""}
                                            {v.campaign ? ` · ${v.campaign}` : ""}
                                            {v.reviewer ? ` · by ${v.reviewer}` : ""}
                                        </p>
                                    </div>
                                    <span className="text-[10px] text-amber-400/80 shrink-0 font-bold">Manual</span>
                                </div>
                            ))}
                        </motion.div>
                    </div>
                );
            })()}

            {/* Call Detail Drawer */}
            <AgentCallDetailDrawer call={selectedCall} onClose={() => setSelectedCall(null)} />
        </div>
    );
}

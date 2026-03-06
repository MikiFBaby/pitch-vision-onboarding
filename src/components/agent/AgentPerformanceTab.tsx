"use client";

import React, { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import TierBadge from "@/components/agent/TierBadge";
import StreakIndicator from "@/components/agent/StreakIndicator";
import LeaderboardTable from "@/components/agent/LeaderboardTable";
import { getTier, getNextTier, getTierProgress, computeHotStreak, computeQaStreak } from "@/utils/agent-tiers";
import type { TierDefinition } from "@/utils/agent-tiers";
import type { AgentPerformance, IntradayAgentRow } from "@/types/dialedin-types";
import { motion } from "framer-motion";

interface AgentPerformanceTabProps {
    agentName: string;
    recentDays: AgentPerformance[];
    intradayAgents: IntradayAgentRow[];
    agentBreakEven: number;
    qaScores: number[];
    currentTier: TierDefinition;
    avgSlaHr: number;
    hotStreak: number;
}

export default function AgentPerformanceTab({
    agentName,
    recentDays,
    intradayAgents,
    agentBreakEven,
    qaScores,
    currentTier,
    avgSlaHr,
    hotStreak,
}: AgentPerformanceTabProps) {
    const nextTier = getNextTier(currentTier);
    const tierProgress = getTierProgress(avgSlaHr, currentTier);
    const qaStreak = computeQaStreak(qaScores);

    // Chart data: reversed so oldest is first (left)
    const chartData = useMemo(() => {
        return [...recentDays].reverse().map((d) => ({
            date: d.report_date.slice(5),
            sla_hr: Number(d.sla_hr),
        }));
    }, [recentDays]);

    // Filter leaderboard to same team
    const teamAgents = useMemo(() => {
        if (!intradayAgents.length) return [];
        const me = intradayAgents.find(
            (a) => a.name.toLowerCase() === agentName.toLowerCase(),
        );
        if (!me?.team) return intradayAgents;
        const myTeam = me.team.toLowerCase();
        return intradayAgents.filter((a) => a.team?.toLowerCase() === myTeam);
    }, [intradayAgents, agentName]);

    return (
        <div className="space-y-6">
            {/* Tier Card */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-xl border-white/5 p-5"
            >
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2">Current Tier</div>
                        <TierBadge tier={currentTier} size="lg" />
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-bold font-mono text-white">{avgSlaHr.toFixed(2)}</div>
                        <div className="text-[10px] text-white/40">7-day avg SLA/hr</div>
                    </div>
                </div>

                {nextTier && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-[10px]">
                            <span className="text-white/40">Progress to {nextTier.name}</span>
                            <span className="text-white/60 font-mono">{(tierProgress * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${tierProgress * 100}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                            />
                        </div>
                        <div className="text-[10px] text-white/30">
                            Need {nextTier.minSlaHr.toFixed(1)} SLA/hr — you&apos;re {(nextTier.minSlaHr - avgSlaHr).toFixed(2)} away
                        </div>
                    </div>
                )}
                {!nextTier && (
                    <div className="text-sm text-violet-400 font-bold mt-2">
                        You&apos;ve reached the highest tier!
                    </div>
                )}
            </motion.div>

            {/* Streaks */}
            <div className="glass-card rounded-xl border-white/5 p-4">
                <div className="text-[10px] text-white/40 uppercase tracking-widest mb-3">Streaks</div>
                <div className="flex flex-wrap gap-4">
                    <StreakIndicator type="hot" days={hotStreak} />
                    <StreakIndicator type="qa" days={qaStreak} />
                </div>
                {hotStreak === 0 && qaStreak === 0 && (
                    <div className="text-xs text-white/20 mt-2">No active streaks. Keep going!</div>
                )}
            </div>

            {/* Campaign Leaderboard */}
            {teamAgents.length > 0 && (
                <div className="glass-card rounded-xl border-white/5 p-4">
                    <div className="text-[10px] text-white/40 uppercase tracking-widest mb-3">Campaign Leaderboard — Today</div>
                    <LeaderboardTable agents={teamAgents} currentAgentName={agentName} />
                </div>
            )}

            {/* 7-Day Trend Chart */}
            {chartData.length > 1 && (
                <div className="glass-card rounded-xl border-white/5 p-4">
                    <div className="text-[10px] text-white/40 uppercase tracking-widest mb-3">7-Day SLA/hr Trend</div>
                    <ResponsiveContainer width="100%" height={160}>
                        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="slaGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} />
                            <Tooltip
                                contentStyle={{ background: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                                labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                            />
                            <ReferenceLine y={agentBreakEven} stroke="#ef4444" strokeDasharray="3 3" label={{ value: `B/E ${agentBreakEven}`, fill: "#ef4444", fontSize: 10, position: "right" }} />
                            <Area type="monotone" dataKey="sla_hr" stroke="#6366f1" strokeWidth={2} fill="url(#slaGradient)" dot={{ fill: "#6366f1", r: 3 }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}

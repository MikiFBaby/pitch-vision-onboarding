"use client";

import React, { useMemo } from "react";
import CarrotGoalCard from "@/components/agent/CarrotGoalCard";
import { getDailyTransferTarget, getNextMilestone, getNextTier } from "@/utils/agent-tiers";
import type { TierDefinition } from "@/utils/agent-tiers";
import type { IntradayAgentRow, AgentPerformance } from "@/types/dialedin-types";
import type { EarningsData } from "@/hooks/useAgentEarnings";
import { motion } from "framer-motion";
import { DollarSign, TrendingUp, Calendar } from "lucide-react";

interface AgentEarningsTabProps {
    agentName: string;
    intradayAgent: IntradayAgentRow | null;
    earningsData: EarningsData | null;
    earningsLoading: boolean;
    recentDays: AgentPerformance[];
    tier: TierDefinition;
    avgSlaHr: number;
}

export default function AgentEarningsTab({
    agentName,
    intradayAgent,
    earningsData,
    earningsLoading,
    recentDays,
    tier,
    avgSlaHr,
}: AgentEarningsTabProps) {
    const todayHours = intradayAgent?.hours_worked ?? 0;
    const wage = earningsData?.hourly_wage_usd ?? 0;
    const todayEarnings = todayHours * wage;

    // Total period earnings including today
    const totalPeriodEarnings = (earningsData?.period_earnings_usd ?? 0) + todayEarnings;

    // Weekly estimate: avg daily earnings * 5 work days
    const periodDays = (earningsData?.period_days_worked ?? 0) + (todayHours > 0 ? 1 : 0);
    const avgDailyEarnings = periodDays > 0 ? totalPeriodEarnings / periodDays : 0;

    // This week's earnings (approximate — last 5 working days of period)
    const weeklyEarnings = useMemo(() => {
        const last5 = recentDays.slice(0, 5);
        const histHours = last5.reduce((s, d) => s + Number(d.hours_worked), 0);
        return histHours * wage + todayEarnings;
    }, [recentDays, wage, todayEarnings]);

    // Pay period progress
    const payPeriodProgress = useMemo(() => {
        if (!earningsData?.pay_period) return 0;
        const start = new Date(earningsData.pay_period.start + "T00:00:00");
        const end = new Date(earningsData.pay_period.end + "T23:59:59");
        const now = new Date();
        const total = end.getTime() - start.getTime();
        const elapsed = now.getTime() - start.getTime();
        return Math.min(Math.max(elapsed / total, 0), 1);
    }, [earningsData]);

    // Projected period total
    const projectedPeriodTotal = payPeriodProgress > 0
        ? totalPeriodEarnings / payPeriodProgress
        : totalPeriodEarnings;

    // Carrot goals
    const dailyTarget = getDailyTransferTarget(tier, 8);
    const currentTransfers = intradayAgent?.transfers ?? 0;
    const nextMilestone = getNextMilestone(weeklyEarnings);
    const nextTier = getNextTier(tier);

    if (earningsLoading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="glass-card rounded-xl border-white/5 p-6 h-24 animate-pulse bg-white/5" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Today's Earnings — Live Counter */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-xl border-white/5 p-5"
            >
                <div className="flex items-center gap-2 mb-4">
                    <DollarSign size={16} className="text-emerald-400" />
                    <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest">Today&apos;s Earnings</span>
                </div>
                <div className="flex items-baseline gap-3">
                    <span className="text-4xl font-bold font-mono text-white tabular-nums">
                        ${todayEarnings.toFixed(2)}
                    </span>
                    <span className="text-sm text-white/40">
                        {todayHours.toFixed(1)}h &times; ${wage.toFixed(2)}/hr
                    </span>
                </div>
                {earningsData?.country === "Canada" && (
                    <div className="text-[10px] text-white/30 mt-1">Converted from CAD at live FX rate</div>
                )}
            </motion.div>

            {/* Pay Period Tracker */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card rounded-xl border-white/5 p-5"
            >
                <div className="flex items-center gap-2 mb-4">
                    <Calendar size={16} className="text-indigo-400" />
                    <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest">Pay Period</span>
                </div>

                <div className="flex items-baseline justify-between mb-3">
                    <div>
                        <span className="text-2xl font-bold font-mono text-white">${totalPeriodEarnings.toFixed(0)}</span>
                        <span className="text-xs text-white/40 ml-2">earned so far</span>
                    </div>
                    <div className="text-right">
                        <span className="text-sm font-mono text-white/50">${projectedPeriodTotal.toFixed(0)}</span>
                        <span className="text-[10px] text-white/30 ml-1">projected</span>
                    </div>
                </div>

                <div className="space-y-1">
                    <div className="h-3 bg-white/5 rounded-full overflow-hidden relative">
                        <motion.div
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${payPeriodProgress * 100}%` }}
                            transition={{ duration: 1 }}
                        />
                    </div>
                    <div className="flex justify-between text-[10px] text-white/30">
                        <span>{earningsData?.pay_period?.start || ""}</span>
                        <span>{periodDays} day{periodDays !== 1 ? "s" : ""} worked</span>
                        <span>{earningsData?.pay_period?.end || ""}</span>
                    </div>
                </div>

                <div className="mt-3 text-[10px] text-white/30">
                    Avg ${avgDailyEarnings.toFixed(0)}/day &middot; ${(avgDailyEarnings * 5).toFixed(0)}/week pace
                </div>
            </motion.div>

            {/* Carrot Goals */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={14} className="text-amber-400" />
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Goals</span>
                </div>
                <div className="space-y-3">
                    <CarrotGoalCard
                        title="Daily Transfer Target"
                        current={currentTransfers}
                        target={dailyTarget}
                        unit="SLA"
                        rewardMessage="Hit your daily target!"
                        completed={currentTransfers >= dailyTarget}
                    />
                    {nextMilestone && (
                        <CarrotGoalCard
                            title="Weekly Earnings"
                            current={weeklyEarnings}
                            target={nextMilestone}
                            unit="$"
                            rewardMessage={`$${nextMilestone} milestone reached!`}
                            completed={weeklyEarnings >= nextMilestone}
                        />
                    )}
                    {nextTier && (
                        <CarrotGoalCard
                            title="Tier Promotion"
                            current={avgSlaHr}
                            target={nextTier.minSlaHr}
                            unit="SLA/hr"
                            rewardMessage={`${nextTier.name} tier unlocked!`}
                            completed={avgSlaHr >= nextTier.minSlaHr}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

"use client";

import React, { useMemo } from "react";
import CarrotGoalCard from "@/components/agent/CarrotGoalCard";
import { getDailyTransferTarget, getNextMilestone, getNextTier } from "@/utils/agent-tiers";
import type { TierDefinition } from "@/utils/agent-tiers";
import type { IntradayAgentRow, AgentPerformance } from "@/types/dialedin-types";
import type { EarningsData } from "@/hooks/useAgentEarnings";
import { motion } from "framer-motion";
import { DollarSign, TrendingUp, Calendar, Zap, Award, Star, CheckCircle, XCircle } from "lucide-react";

// Bonus payout table — indexed by [SLA tier][weekly hours bucket]
// Payouts are per pay period, same $ amount in agent's native currency (CAD or USD)
const BONUS_TABLE: { minSla: number; payouts: [number, number, number, number] }[] = [
    { minSla: 7.0, payouts: [300, 300, 275, 210] },
    { minSla: 6.5, payouts: [275, 265, 230, 165] },
    { minSla: 6.0, payouts: [250, 225, 180, 125] },
    { minSla: 5.5, payouts: [225, 195, 145, 95] },
    { minSla: 5.0, payouts: [200, 170, 125, 80] },
    { minSla: 4.5, payouts: [150, 125, 90, 60] },
    { minSla: 4.0, payouts: [100, 85, 65, 35] },
];

function lookupBonus(sla: number, weeklyHrs: number): number {
    if (sla < 4.0 || weeklyHrs < 30) return 0;
    const col = weeklyHrs >= 40 ? 0 : weeklyHrs >= 38 ? 1 : weeklyHrs >= 35 ? 2 : 3;
    const tier = BONUS_TABLE.find((t) => sla >= t.minSla);
    return tier ? tier.payouts[col] : 0;
}

function getHoursBucket(weeklyHrs: number): string {
    if (weeklyHrs >= 40) return "40+";
    if (weeklyHrs >= 38) return "38-39";
    if (weeklyHrs >= 35) return "35-37";
    if (weeklyHrs >= 30) return "30-34";
    return "<30";
}

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
    const todayPaidHours = intradayAgent?.paid_hours ?? 0;
    const todayTransfers = intradayAgent?.transfers ?? 0;
    const wage = earningsData?.hourly_wage ?? 0;
    const curr = earningsData?.currency ?? "USD";
    const todayEarnings = todayPaidHours * wage;

    // Total period earnings including today (using paid hours)
    const totalPeriodEarnings = (earningsData?.period_earnings ?? 0) + todayEarnings;
    const totalPeriodTransfers = (earningsData?.period_transfers ?? 0) + todayTransfers;

    // Weekly estimate: avg daily earnings * 5 work days
    const periodDays = (earningsData?.period_days_worked ?? 0) + (todayPaidHours > 0 ? 1 : 0);
    const avgDailyEarnings = periodDays > 0 ? totalPeriodEarnings / periodDays : 0;

    // ── Commission & Bonus Eligibility ──
    const totalPaidHours = (earningsData?.period_paid_hours ?? 0) + todayPaidHours;

    // SLA avg: include today's SLA in the daily average
    const todaySlaHr = todayPaidHours > 0 ? todayTransfers / todayPaidHours : 0;
    const periodSlaSum = (earningsData?.period_avg_sla_hr ?? 0) * (earningsData?.period_days_worked ?? 0);
    const avgSlaHrCalc = periodDays > 0 ? (periodSlaSum + todaySlaHr) / periodDays : 0;

    // Qualification checks
    const hoursQualified = totalPaidHours >= 60;
    const commissionSlaQualified = avgSlaHrCalc >= 3.0;
    const commissionEligible = hoursQualified && commissionSlaQualified;
    const bonusSlaQualified = avgSlaHrCalc >= 4.0;
    const bonusEligible = hoursQualified && bonusSlaQualified;

    // Commission amount
    const qualifyingTransfers = Math.floor(totalPeriodTransfers * 0.20);
    const commissionAmount = qualifyingTransfers * 6;

    // Bonus lookup
    const weeklyPaidHours = totalPaidHours / 2;
    const bonusAmount = lookupBonus(avgSlaHrCalc, weeklyPaidHours);

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
                    <span className="text-xs text-white/30 font-mono">{curr}</span>
                    <span className="text-sm text-white/40">
                        {todayPaidHours.toFixed(1)}h &times; ${wage.toFixed(2)}/hr
                    </span>
                </div>
                <div className="flex items-center gap-3 mt-2 text-sm text-white/50">
                    <span className="flex items-center gap-1">
                        <Zap size={12} className="text-amber-400" />
                        {todayTransfers} SLA today
                    </span>
                </div>
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
                        <span className="text-xs text-white/30 font-mono ml-1">{curr}</span>
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

                <div className="flex items-center justify-between mt-3">
                    <span className="text-[10px] text-white/30">
                        Avg ${avgDailyEarnings.toFixed(0)}/day &middot; ${(avgDailyEarnings * 5).toFixed(0)}/week pace
                    </span>
                    <span className="flex items-center gap-1 text-xs text-amber-400/80 font-mono">
                        <Zap size={11} />
                        {totalPeriodTransfers} SLA
                    </span>
                </div>
            </motion.div>

            {/* Commission Eligibility */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card rounded-xl border-white/5 p-5"
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Award size={16} className="text-cyan-400" />
                        <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-widest">Commission</span>
                    </div>
                    {commissionEligible ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                            <CheckCircle size={10} /> Qualified
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-white/40 bg-white/5 px-2 py-0.5 rounded">
                            <XCircle size={10} /> Not Yet
                        </span>
                    )}
                </div>

                {/* Progress bars */}
                <div className="space-y-3">
                    {/* SLA/hr progress */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-white/50">Avg SLA/hr</span>
                            <span className={`text-xs font-mono font-bold ${commissionSlaQualified ? "text-emerald-400" : "text-white/70"}`}>
                                {avgSlaHrCalc.toFixed(2)} / 3.00
                            </span>
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                className={`h-full rounded-full ${commissionSlaQualified ? "bg-emerald-500" : avgSlaHrCalc >= 2.5 ? "bg-amber-500" : "bg-red-500/70"}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min((avgSlaHrCalc / 3.0) * 100, 100)}%` }}
                                transition={{ duration: 0.8 }}
                            />
                        </div>
                        {!commissionSlaQualified && avgSlaHrCalc > 0 && (
                            <div className="text-[10px] text-white/30 mt-0.5">
                                Need {(3.0 - avgSlaHrCalc).toFixed(2)} more SLA/hr
                            </div>
                        )}
                    </div>

                    {/* Paid hours progress */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-white/50">Paid Hours</span>
                            <span className={`text-xs font-mono font-bold ${hoursQualified ? "text-emerald-400" : "text-white/70"}`}>
                                {totalPaidHours.toFixed(1)} / 60h
                            </span>
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                className={`h-full rounded-full ${hoursQualified ? "bg-emerald-500" : totalPaidHours >= 45 ? "bg-amber-500" : "bg-red-500/70"}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min((totalPaidHours / 60) * 100, 100)}%` }}
                                transition={{ duration: 0.8 }}
                            />
                        </div>
                        {!hoursQualified && (
                            <div className="text-[10px] text-white/30 mt-0.5">
                                Need {(60 - totalPaidHours).toFixed(1)} more hours
                            </div>
                        )}
                    </div>
                </div>

                {/* Commission amount */}
                {commissionEligible && (
                    <div className="mt-4 pt-3 border-t border-white/5">
                        <div className="flex items-baseline justify-between">
                            <div>
                                <span className="text-2xl font-bold font-mono text-cyan-400">${commissionAmount}</span>
                                <span className="text-xs text-white/30 font-mono ml-1">{curr}</span>
                            </div>
                            <span className="text-[10px] text-white/30 font-mono">
                                {qualifyingTransfers} qualifying &times; $6
                            </span>
                        </div>
                        <div className="text-[10px] text-white/30 mt-1">
                            {totalPeriodTransfers} total SLA &times; 20% = {qualifyingTransfers} qualifying transfers
                        </div>
                    </div>
                )}
                {!commissionEligible && totalPeriodTransfers > 0 && (
                    <div className="mt-4 pt-3 border-t border-white/5">
                        <div className="text-[10px] text-white/30">
                            If qualified: {qualifyingTransfers} &times; $6 = <span className="text-white/50 font-mono">${commissionAmount} {curr}</span>
                        </div>
                    </div>
                )}
            </motion.div>

            {/* Bonus Eligibility */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="glass-card rounded-xl border-white/5 p-5"
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Star size={16} className="text-amber-400" />
                        <span className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Bonus</span>
                    </div>
                    {bonusEligible ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                            <CheckCircle size={10} /> Qualified
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-white/40 bg-white/5 px-2 py-0.5 rounded">
                            <XCircle size={10} /> Not Yet
                        </span>
                    )}
                </div>

                <div className="space-y-3">
                    {/* SLA/hr progress toward 4.0 */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-white/50">Avg SLA/hr</span>
                            <span className={`text-xs font-mono font-bold ${bonusSlaQualified ? "text-emerald-400" : "text-white/70"}`}>
                                {avgSlaHrCalc.toFixed(2)} / 4.00
                            </span>
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                className={`h-full rounded-full ${bonusSlaQualified ? "bg-emerald-500" : avgSlaHrCalc >= 3.5 ? "bg-amber-500" : "bg-red-500/70"}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min((avgSlaHrCalc / 4.0) * 100, 100)}%` }}
                                transition={{ duration: 0.8 }}
                            />
                        </div>
                        {!bonusSlaQualified && avgSlaHrCalc > 0 && (
                            <div className="text-[10px] text-white/30 mt-0.5">
                                Need {(4.0 - avgSlaHrCalc).toFixed(2)} more SLA/hr
                            </div>
                        )}
                    </div>

                    {/* Paid hours progress */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-white/50">Paid Hours</span>
                            <span className={`text-xs font-mono font-bold ${hoursQualified ? "text-emerald-400" : "text-white/70"}`}>
                                {totalPaidHours.toFixed(1)} / 60h
                            </span>
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                className={`h-full rounded-full ${hoursQualified ? "bg-emerald-500" : totalPaidHours >= 45 ? "bg-amber-500" : "bg-red-500/70"}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min((totalPaidHours / 60) * 100, 100)}%` }}
                                transition={{ duration: 0.8 }}
                            />
                        </div>
                    </div>
                </div>

                {/* Bonus payout */}
                {bonusEligible && bonusAmount > 0 && (
                    <div className="mt-4 pt-3 border-t border-white/5">
                        <div className="flex items-baseline justify-between">
                            <div>
                                <span className="text-2xl font-bold font-mono text-amber-400">${bonusAmount}</span>
                                <span className="text-xs text-white/30 font-mono ml-1">{curr}</span>
                            </div>
                            <span className="text-[10px] text-white/30 font-mono">
                                {avgSlaHrCalc.toFixed(1)} SLA &middot; {getHoursBucket(weeklyPaidHours)} hrs/wk
                            </span>
                        </div>
                    </div>
                )}
                {!bonusEligible && (
                    <div className="mt-4 pt-3 border-t border-white/5 text-[10px] text-white/30">
                        Maintain 4.0+ SLA/hr avg and 30+ paid hours/week to qualify
                    </div>
                )}
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

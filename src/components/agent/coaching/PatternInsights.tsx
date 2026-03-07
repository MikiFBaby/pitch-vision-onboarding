"use client";

import type { PatternInsight } from "@/utils/coaching-insights";
import { getConsistencyDots } from "@/utils/coaching-insights";
import type { AgentPerformance } from "@/types/dialedin-types";
import InsightCard from "./InsightCard";

interface PatternInsightsProps {
    insights: PatternInsight[];
    recentDays: AgentPerformance[];
    breakEven: number;
}

export default function PatternInsights({ insights, recentDays, breakEven }: PatternInsightsProps) {
    if (insights.length === 0) return null;

    const dots = getConsistencyDots(recentDays, breakEven);

    return (
        <div className="space-y-3">
            <div className="text-[10px] text-white/40 uppercase tracking-widest">
                Your Patterns — Last {recentDays.length} Days
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {insights.map((insight, i) => (
                    <InsightCard key={insight.id} insight={insight} index={i} />
                ))}
            </div>
            {/* Consistency dot strip */}
            {dots.length > 0 && (
                <div className="flex items-center gap-1 px-1">
                    <span className="text-[9px] text-white/30 mr-2 shrink-0">14d</span>
                    {dots.map((above, i) => (
                        <div
                            key={i}
                            className={`w-2 h-2 rounded-full ${above ? "bg-emerald-500" : "bg-white/10"}`}
                            title={recentDays[i]?.report_date || ""}
                        />
                    ))}
                    <span className="text-[9px] text-white/30 ml-2 shrink-0">today</span>
                </div>
            )}
        </div>
    );
}

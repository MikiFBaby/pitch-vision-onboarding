"use client";

import { motion } from "framer-motion";
import type { PatternInsight } from "@/utils/coaching-insights";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Target, Calendar, ShieldCheck } from "lucide-react";

const ICON_MAP: Record<string, typeof TrendingUp> = {
    "top-violation": AlertTriangle,
    "trend": TrendingUp,
    "consistency": Target,
    "best-day": Calendar,
    "qa-score": ShieldCheck,
};

const SENTIMENT_COLORS = {
    positive: { border: "border-emerald-500/20", bg: "bg-emerald-500/10", text: "text-emerald-400" },
    negative: { border: "border-red-500/20", bg: "bg-red-500/10", text: "text-red-400" },
    neutral: { border: "border-white/10", bg: "bg-white/5", text: "text-white/60" },
};

export default function InsightCard({ insight, index }: { insight: PatternInsight; index: number }) {
    const Icon = insight.id === "trend" && insight.value.startsWith("-") ? TrendingDown
        : insight.id === "trend" && insight.value === "Stable" ? Minus
        : ICON_MAP[insight.id] || Target;
    const colors = SENTIMENT_COLORS[insight.sentiment];

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08, duration: 0.4 }}
            className={`glass-card rounded-xl border ${colors.border} p-4`}
        >
            <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${colors.bg} shrink-0`}>
                    <Icon size={14} className={colors.text} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-0.5">
                        {insight.label}
                    </div>
                    <div className={`text-lg font-bold ${colors.text}`}>{insight.value}</div>
                    <div className="text-xs text-white/50 mt-1 leading-relaxed">{insight.detail}</div>
                    <div className="text-[10px] text-indigo-400 mt-2 font-medium">{insight.action}</div>
                </div>
            </div>
        </motion.div>
    );
}

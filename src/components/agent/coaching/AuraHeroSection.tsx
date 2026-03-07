"use client";

import { motion } from "framer-motion";
import { Mic, MessageCircle, TrendingUp, TrendingDown, Minus, Target, AlertTriangle } from "lucide-react";
import AuraAvatar from "./AuraAvatar";
import type { PatternInsight } from "@/utils/coaching-insights";

interface AuraHeroSectionProps {
    agentName: string;
    insights: PatternInsight[];
    onChat: () => void;
    onVoice: () => void;
}

export default function AuraHeroSection({ agentName, insights, onChat, onVoice }: AuraHeroSectionProps) {
    const firstName = agentName.split(" ")[0] || "Agent";
    const trend = insights.find((i) => i.id === "trend");
    const consistency = insights.find((i) => i.id === "consistency");
    const topViolation = insights.find((i) => i.id === "top-violation");

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="glass-card rounded-2xl border border-white/5 overflow-hidden relative"
        >
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/8 via-purple-600/5 to-pink-600/8" />
            <div className="absolute -top-16 -right-16 w-32 h-32 bg-purple-500/15 rounded-full blur-3xl" />

            <div className="relative z-10 p-6">
                <div className="flex items-start gap-5">
                    {/* Large Aura avatar */}
                    <AuraAvatar size={80} />

                    <div className="flex-1 min-w-0">
                        {/* Greeting */}
                        <h3 className="text-lg font-bold text-white mb-1">
                            Hi {firstName} — here&apos;s your coaching snapshot
                        </h3>
                        <p className="text-sm text-white/40 mb-4">Based on your last 14 days of performance</p>

                        {/* 3 inline stat badges */}
                        <div className="flex flex-wrap gap-2 mb-5">
                            {trend && (
                                <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border ${
                                    trend.sentiment === "positive"
                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                        : trend.sentiment === "negative"
                                            ? "bg-red-500/10 text-red-400 border-red-500/20"
                                            : "bg-white/5 text-white/60 border-white/10"
                                }`}>
                                    {trend.value.startsWith("+") ? <TrendingUp size={12} /> : trend.value.startsWith("-") ? <TrendingDown size={12} /> : <Minus size={12} />}
                                    {trend.value === "Stable" ? "Stable trend" : `${trend.value} trend`}
                                </span>
                            )}
                            {consistency && (
                                <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border ${
                                    consistency.sentiment === "positive"
                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                        : consistency.sentiment === "negative"
                                            ? "bg-red-500/10 text-red-400 border-red-500/20"
                                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                }`}>
                                    <Target size={12} />
                                    {consistency.value} above break-even
                                </span>
                            )}
                            {topViolation && (
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border bg-red-500/10 text-red-400 border-red-500/20">
                                    <AlertTriangle size={12} />
                                    {topViolation.value} — {topViolation.detail.split("—")[0]?.trim()}
                                </span>
                            )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onVoice}
                                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl text-white font-bold text-sm transition-all shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 hover:scale-[1.02]"
                            >
                                <Mic size={14} />
                                Talk to Aura
                            </button>
                            <button
                                onClick={onChat}
                                className="flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/70 text-sm font-medium transition-all"
                            >
                                <MessageCircle size={14} />
                                Chat
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

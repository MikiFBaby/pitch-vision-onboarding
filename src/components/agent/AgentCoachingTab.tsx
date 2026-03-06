"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Star, TrendingUp, Target, RefreshCw } from "lucide-react";
import type { CoachingCard } from "@/hooks/useAgentCoaching";

interface AgentCoachingTabProps {
    agentName: string;
    cards: CoachingCard[];
    loading: boolean;
    onRefresh?: () => void;
}

const CARD_CONFIG: Record<string, { icon: typeof Star; color: string; bgColor: string; borderColor: string }> = {
    strength: { icon: Star, color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/20" },
    growth: { icon: TrendingUp, color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/20" },
    challenge: { icon: Target, color: "text-indigo-400", bgColor: "bg-indigo-500/10", borderColor: "border-indigo-500/20" },
};

export default function AgentCoachingTab({ agentName, cards, loading, onRefresh }: AgentCoachingTabProps) {
    const todayKey = `coaching-challenge-${agentName}-${new Date().toISOString().slice(0, 10)}`;
    const [challengeAccepted, setChallengeAccepted] = useState(false);

    useEffect(() => {
        setChallengeAccepted(localStorage.getItem(todayKey) === "accepted");
    }, [todayKey]);

    const acceptChallenge = () => {
        localStorage.setItem(todayKey, "accepted");
        setChallengeAccepted(true);
    };

    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="glass-card rounded-xl border-white/5 p-6 h-32 animate-pulse bg-white/5" />
                ))}
            </div>
        );
    }

    if (cards.length === 0) {
        return (
            <div className="glass-card rounded-xl border-white/5 p-8 text-center">
                <Target size={32} className="mx-auto text-white/20 mb-3" />
                <p className="text-white/40 text-sm">No coaching data available yet.</p>
                <p className="text-white/20 text-xs mt-1">Work a few shifts to generate personalized coaching tips.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="text-[10px] text-white/40 uppercase tracking-widest">
                    AI Coaching — refreshes daily
                </div>
                {onRefresh && (
                    <button
                        onClick={onRefresh}
                        className="text-white/30 hover:text-white/60 transition-colors"
                    >
                        <RefreshCw size={14} />
                    </button>
                )}
            </div>

            {cards.map((card, i) => {
                const config = CARD_CONFIG[card.type] || CARD_CONFIG.strength;
                const Icon = config.icon;
                const isChallenge = card.type === "challenge";

                return (
                    <motion.div
                        key={card.type}
                        initial={{ opacity: 0, y: 15, rotateX: -10 }}
                        animate={{ opacity: 1, y: 0, rotateX: 0 }}
                        transition={{ delay: i * 0.15, duration: 0.5 }}
                        className={`glass-card rounded-xl border p-5 ${config.borderColor}`}
                    >
                        <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${config.bgColor} shrink-0`}>
                                <Icon size={16} className={config.color} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-[10px] font-bold uppercase tracking-widest ${config.color}`}>
                                        {card.type === "strength" ? "Strength" : card.type === "growth" ? "Growth Area" : "Daily Challenge"}
                                    </span>
                                    {card.metric && (
                                        <span className="text-[10px] text-white/30 font-mono">{card.metric}</span>
                                    )}
                                </div>
                                <div className="text-sm font-bold text-white mb-1">{card.title}</div>
                                <div className="text-xs text-white/60 leading-relaxed">{card.body}</div>

                                {isChallenge && (
                                    <div className="mt-3">
                                        {challengeAccepted ? (
                                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">
                                                Challenge Accepted
                                            </span>
                                        ) : (
                                            <button
                                                onClick={acceptChallenge}
                                                className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1 rounded-full transition-colors"
                                            >
                                                Accept Challenge
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
}

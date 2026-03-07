"use client";

import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { MessageCircle, Phone } from "lucide-react";
import type { AgentPerformance } from "@/types/dialedin-types";
import { computeInsights, type PatternInsight } from "@/utils/coaching-insights";
import AuraHeroSection from "./coaching/AuraHeroSection";
import AuraCoachChat from "./coaching/AuraCoachChat";
import RecentCallsList from "./coaching/RecentCallsList";
import AgentCallDetailDrawer from "./AgentCallDetailDrawer";
import AuraCoachOverlay from "./AuraCoachOverlay";

interface RecentViolation {
    code: string;
    violation: string;
    date: string;
}

interface RecentCall {
    id: number;
    call_date: string;
    phone_number: string;
    compliance_score: number | null;
    auto_fail_triggered: boolean;
    auto_fail_reasons?: unknown[] | null;
    risk_level: string;
    call_duration: string | null;
    product_type: string | null;
    recording_url?: string | null;
    compliance_checklist?: unknown[] | null;
}

interface AgentCoachingTabProps {
    agentName: string;
    agentEmail: string;
    loading: boolean;
    recentViolations?: RecentViolation[];
    recentDays: AgentPerformance[];
    qaStats: { avg_score: number; total_calls: number; auto_fail_count: number; pass_rate: number } | null;
    agentBreakEven: number;
    productType: string;
    recentCalls: RecentCall[];
}

type SubTab = "chat" | "calls";

export default function AgentCoachingTab({
    agentName, agentEmail, loading,
    recentViolations, recentDays, qaStats,
    agentBreakEven, productType, recentCalls,
}: AgentCoachingTabProps) {
    const [voiceOpen, setVoiceOpen] = useState(false);
    const [subTab, setSubTab] = useState<SubTab>("chat");
    const [selectedCall, setSelectedCall] = useState<RecentCall | null>(null);

    // Compute pattern insights from existing data
    const insights: PatternInsight[] = useMemo(() => {
        return computeInsights({
            recentDays,
            recentViolations: recentViolations || [],
            qaStats: qaStats ? { avg_score: qaStats.avg_score, pass_rate: qaStats.pass_rate } : null,
            breakEven: agentBreakEven,
        });
    }, [recentDays, recentViolations, qaStats, agentBreakEven]);

    // Extract top violation code for quick chips
    const topViolationCode = useMemo(() => {
        const topInsight = insights.find((i) => i.id === "top-violation");
        return topInsight?.value || null;
    }, [insights]);

    // Build performance profile for Aura context
    const performanceProfile = useMemo(() => {
        const avgSlaHr = recentDays.length > 0
            ? recentDays.reduce((s, d) => s + Number(d.sla_hr), 0) / recentDays.length
            : null;
        const trendInsight = insights.find((i) => i.id === "trend");
        const trend = trendInsight?.value.startsWith("+") ? "improving" as const
            : trendInsight?.value.startsWith("-") ? "declining" as const
            : "stable" as const;
        return {
            avgSlaHr: avgSlaHr ? Math.round(avgSlaHr * 10) / 10 : null,
            breakEven: agentBreakEven,
            breakEvenGap: avgSlaHr != null ? Math.round((avgSlaHr - agentBreakEven) * 10) / 10 : null,
            tierName: null as string | null,
            trend,
            conversionRate: recentDays.length > 0
                ? Math.round(recentDays.reduce((s, d) => s + d.conversion_rate, 0) / recentDays.length * 10) / 10
                : null,
            qaScore: qaStats?.avg_score ?? null,
        };
    }, [recentDays, insights, agentBreakEven, qaStats]);

    const afCodes = useMemo(() => {
        const codes = (recentViolations || []).map((v) => v.code);
        return [...new Set(codes)];
    }, [recentViolations]);

    const manualViolationTexts = useMemo(() => {
        return (recentViolations || []).map((v) => `${v.code}: ${v.violation}`);
    }, [recentViolations]);

    if (loading && recentDays.length === 0) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="glass-card rounded-xl border-white/5 p-6 h-32 animate-pulse bg-white/5" />
                ))}
            </div>
        );
    }

    const SUB_TABS: { id: SubTab; label: string; icon: typeof MessageCircle }[] = [
        { id: "chat", label: "Aura Chat", icon: MessageCircle },
        { id: "calls", label: "Recent Calls", icon: Phone },
    ];

    return (
        <div className="space-y-6">
            {/* Section 1: Aura Hero + Key Stats */}
            <AuraHeroSection
                agentName={agentName}
                insights={insights}
                onChat={() => setSubTab("chat")}
                onVoice={() => setVoiceOpen(true)}
            />

            {/* Section 2: Chat + Calls tabbed area */}
            <div>
                {/* Mini tab strip */}
                <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-4">
                    {SUB_TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = subTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setSubTab(tab.id)}
                                className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all flex-1 justify-center ${
                                    isActive ? "text-white" : "text-white/40 hover:text-white/60"
                                }`}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="coachingSubTab"
                                        className="absolute inset-0 bg-white/10 rounded-lg"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                                    />
                                )}
                                <Icon size={14} className="relative z-10" />
                                <span className="relative z-10">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Sub-tab content */}
                {subTab === "chat" && (
                    <AuraCoachChat
                        agentName={agentName}
                        agentEmail={agentEmail}
                        context={{
                            productType,
                            afCodes,
                            manualViolations: manualViolationTexts,
                            performanceProfile,
                        }}
                        onStartVoice={() => setVoiceOpen(true)}
                        topViolationCode={topViolationCode}
                    />
                )}

                {subTab === "calls" && (
                    <RecentCallsList
                        calls={recentCalls}
                        onSelect={setSelectedCall}
                    />
                )}
            </div>

            {/* Call detail drawer */}
            <AgentCallDetailDrawer
                call={selectedCall}
                onClose={() => setSelectedCall(null)}
            />

            {/* AuraCoachOverlay (voice mode) */}
            {voiceOpen && (
                <AuraCoachOverlay
                    agentName={agentName}
                    agentEmail={agentEmail}
                    productType={productType}
                    afCodes={afCodes}
                    manualViolations={manualViolationTexts}
                    performanceProfile={performanceProfile}
                    onClose={() => setVoiceOpen(false)}
                />
            )}
        </div>
    );
}

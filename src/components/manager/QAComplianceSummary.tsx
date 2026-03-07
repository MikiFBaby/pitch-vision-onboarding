"use client";

import { useState } from "react";
import { ShieldCheck, ChevronDown, ChevronUp, AlertTriangle, ShieldAlert } from "lucide-react";
import type { ManagerQAData } from "@/hooks/useManagerQAStats";

interface QAComplianceSummaryProps {
    data: ManagerQAData | null;
    loading: boolean;
    onAgentClick?: (name: string) => void;
}

function getScoreColor(score: number): string {
    if (score >= 90) return "text-emerald-400";
    if (score >= 75) return "text-amber-400";
    return "text-red-400";
}

function getScoreBg(score: number): string {
    if (score >= 90) return "bg-emerald-500/15";
    if (score >= 75) return "bg-amber-500/15";
    return "bg-red-500/15";
}

function getTrendArrow(trend: "up" | "down" | "stable"): string {
    if (trend === "up") return "text-emerald-400";
    if (trend === "down") return "text-red-400";
    return "text-white/40";
}

export default function QAComplianceSummary({ data, loading, onAgentClick }: QAComplianceSummaryProps) {
    const [expanded, setExpanded] = useState(false);

    if (loading && !data) {
        return (
            <div className="glass-card p-4 rounded-2xl border-white/5 animate-pulse">
                <div className="h-4 bg-white/5 rounded w-1/3 mb-3" />
                <div className="grid grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-16 bg-white/5 rounded-lg" />
                    ))}
                </div>
            </div>
        );
    }

    if (!data) return null;

    const { team_avg_score, team_pass_rate, total_auto_fails_7d, manual_violations_7d, recent_violations, trend } = data;

    return (
        <div className="glass-card p-4 rounded-2xl border-white/5">
            {/* Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center justify-between w-full mb-3"
            >
                <div className="flex items-center gap-2">
                    <ShieldCheck size={14} className="text-indigo-400" />
                    <h4 className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
                        QA Compliance
                    </h4>
                    <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${getScoreBg(team_avg_score)} ${getScoreColor(team_avg_score)}`}>
                        {team_avg_score}
                    </span>
                    <span className={`text-[9px] ${getTrendArrow(trend)}`}>
                        {trend === "up" ? "improving" : trend === "down" ? "declining" : ""}
                    </span>
                </div>
                {expanded ? (
                    <ChevronUp size={14} className="text-white/30" />
                ) : (
                    <ChevronDown size={14} className="text-white/30" />
                )}
            </button>

            {/* Metrics Row */}
            <div className="grid grid-cols-4 gap-3">
                <div className="bg-white/5 rounded-lg p-2.5">
                    <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Avg Score</div>
                    <div className={`text-lg font-bold font-mono tabular-nums ${getScoreColor(team_avg_score)}`}>
                        {team_avg_score}
                    </div>
                </div>
                <div className="bg-white/5 rounded-lg p-2.5">
                    <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Pass Rate</div>
                    <div className={`text-lg font-bold font-mono tabular-nums ${team_pass_rate >= 80 ? "text-emerald-400" : "text-amber-400"}`}>
                        {team_pass_rate}%
                    </div>
                </div>
                <div className="bg-white/5 rounded-lg p-2.5">
                    <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Auto-Fails 7d</div>
                    <div className={`text-lg font-bold font-mono tabular-nums ${total_auto_fails_7d > 0 ? "text-red-400" : "text-white/50"}`}>
                        {total_auto_fails_7d}
                    </div>
                </div>
                <div className="bg-white/5 rounded-lg p-2.5">
                    <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Manual Viol.</div>
                    <div className={`text-lg font-bold font-mono tabular-nums ${manual_violations_7d > 0 ? "text-amber-400" : "text-white/50"}`}>
                        {manual_violations_7d}
                    </div>
                </div>
            </div>

            {/* Expanded: Recent Violations Ticker */}
            {expanded && recent_violations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/5 space-y-1.5">
                    <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">
                        Recent Violations (7d)
                    </div>
                    {recent_violations.slice(0, 5).map((v, i) => (
                        <div
                            key={`${v.agent_name}-${v.date}-${v.type}-${i}`}
                            className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-white/5 transition-colors"
                        >
                            {v.source === "auto_fail" ? (
                                <ShieldAlert size={12} className="text-red-400 shrink-0" />
                            ) : (
                                <AlertTriangle size={12} className="text-amber-400 shrink-0" />
                            )}
                            <button
                                onClick={() => onAgentClick?.(v.agent_name)}
                                className="text-white/80 font-medium truncate flex-1 text-left cursor-pointer hover:text-cyan-400 transition-colors"
                            >
                                {v.agent_name}
                            </button>
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                v.severity === "critical"
                                    ? "bg-red-500/15 text-red-400"
                                    : "bg-amber-500/15 text-amber-400"
                            }`}>
                                {v.type}
                            </span>
                            <span className="text-[10px] text-white/30 font-mono shrink-0">
                                {v.date}
                            </span>
                        </div>
                    ))}
                    {recent_violations.length > 5 && (
                        <div className="text-[9px] text-white/30 text-center pt-1">
                            +{recent_violations.length - 5} more
                        </div>
                    )}
                </div>
            )}

            {expanded && recent_violations.length === 0 && (
                <div className="mt-3 pt-3 border-t border-white/5 text-center">
                    <p className="text-[10px] text-white/30 italic">No violations in the last 7 days</p>
                </div>
            )}
        </div>
    );
}

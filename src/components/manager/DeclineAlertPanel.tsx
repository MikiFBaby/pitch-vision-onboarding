"use client";

import { TrendingDown } from "lucide-react";
import type { DeclineAlert } from "@/hooks/useManagerDeclineAlerts";

interface DeclineAlertPanelProps {
    alerts: DeclineAlert[];
    loading: boolean;
    onAgentClick?: (name: string) => void;
}

function MiniSparkline({ values }: { values: number[] }) {
    if (values.length < 2) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const width = 60;
    const height = 20;
    const padding = 2;

    const points = values.map((v, i) => {
        const x = padding + (i / (values.length - 1)) * (width - 2 * padding);
        const y = padding + (1 - (v - min) / range) * (height - 2 * padding);
        return `${x},${y}`;
    });

    return (
        <svg width={width} height={height} className="inline-block">
            <polyline
                points={points.join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                className="text-red-400"
            />
            <circle
                cx={points[points.length - 1].split(",")[0]}
                cy={points[points.length - 1].split(",")[1]}
                r="2"
                className="fill-red-400"
            />
        </svg>
    );
}

export default function DeclineAlertPanel({ alerts, loading, onAgentClick }: DeclineAlertPanelProps) {
    if (loading && alerts.length === 0) {
        return (
            <div className="glass-card p-4 rounded-2xl border-white/5 animate-pulse">
                <div className="h-4 bg-white/5 rounded w-1/3 mb-3" />
                <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-10 bg-white/5 rounded" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="glass-card p-4 rounded-2xl border-white/5">
            <div className="flex items-center gap-2 mb-3">
                <TrendingDown size={14} className="text-red-400" />
                <h4 className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
                    Declining Agents
                </h4>
                {alerts.length > 0 && (
                    <span className="text-[9px] font-bold bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded ml-auto">
                        {alerts.length}
                    </span>
                )}
            </div>

            {alerts.length === 0 ? (
                <p className="text-white/30 text-[10px] italic">No agents with declining trends</p>
            ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {alerts.map((a) => (
                        <div
                            key={a.agent_name}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
                        >
                            {/* Agent name */}
                            <div className="flex-1 min-w-0">
                                <button
                                    onClick={() => onAgentClick?.(a.agent_name)}
                                    className="text-xs text-white/90 font-medium truncate text-left cursor-pointer hover:text-cyan-400 transition-colors"
                                >
                                    {a.agent_name}
                                </button>
                                <div className="text-[9px] text-white/40 font-mono">
                                    {a.tph_start.toFixed(2)} → {a.tph_end.toFixed(2)} SLA/hr
                                </div>
                            </div>

                            {/* Sparkline */}
                            <MiniSparkline values={a.sparkline} />

                            {/* Streak + severity */}
                            <div className="flex flex-col items-end shrink-0">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                    a.severity === "critical"
                                        ? "bg-red-500/15 text-red-400"
                                        : "bg-amber-500/15 text-amber-400"
                                }`}>
                                    {a.consecutive_decline_days}d
                                </span>
                                <span className="text-[9px] text-red-400 font-mono">
                                    -{a.drop_pct}%
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

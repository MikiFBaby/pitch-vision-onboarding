"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, TrendingUp, TrendingDown, MessageSquare, StickyNote, GraduationCap, Send, Loader2, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useAgentScoutingData, type VARTier } from "@/hooks/useAgentScoutingData";
import type { IntradayAgentRow } from "@/types/dialedin-types";
import type { AttentionFlag } from "./AttentionPanel";

// ─── Types ───────────────────────────────────────────────

interface AnnotatedAgent extends IntradayAgentRow {
    be: number;
    aboveBE: boolean;
}

interface PerAgentQA {
    avg_score: number;
    auto_fail_count: number;
    pass_rate: number;
    total_calls: number;
    manual_violations: number;
}

interface DeclineAlertInfo {
    agent_name: string;
    consecutive_decline_days: number;
    tph_start: number;
    tph_end: number;
    drop_pct: number;
    sparkline: number[];
    severity: "warning" | "critical";
}

interface TeamStats {
    avgConvRate: number;
    avgDialsPerHour: number;
    avgSlaHr: number;
    totalAgents: number;
}

interface AgentScoutingCardProps {
    isOpen: boolean;
    onClose: () => void;
    agentName: string | null;
    intradayAgent: AnnotatedAgent | null;
    yesterdayData: { sla_hr: number; transfers: number } | null;
    qaPerAgent: PerAgentQA | null;
    declineAlert: DeclineAlertInfo | null;
    attentionFlags: AttentionFlag[] | null;
    breakEven: number;
    teamStats: TeamStats;
    agentNames?: string[];
    onNavigate?: (name: string) => void;
}

// ─── VAR Styling ─────────────────────────────────────────

const VAR_STYLES: Record<VARTier, { bg: string; text: string; label: string; glow?: string }> = {
    star: { bg: "bg-emerald-500/20", text: "text-emerald-300", label: "STAR", glow: "shadow-[0_0_12px_rgba(16,185,129,0.3)]" },
    contributor: { bg: "bg-emerald-500/10", text: "text-emerald-400", label: "CONTRIBUTOR" },
    neutral: { bg: "bg-white/10", text: "text-white/70", label: "NEUTRAL" },
    watch: { bg: "bg-amber-500/15", text: "text-amber-400", label: "WATCH" },
    risk: { bg: "bg-red-500/15", text: "text-red-400", label: "RISK" },
};

const FLAG_STYLES: Record<string, string> = {
    critical: "bg-red-500/20 text-red-400 border-red-500/30",
    warning: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    info: "bg-blue-500/15 text-blue-400 border-blue-500/25",
};

// ─── Sparkline ───────────────────────────────────────────

function Sparkline({ values, color = "text-cyan-400" }: { values: number[]; color?: string }) {
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const width = 200;
    const height = 40;
    const padding = 3;

    const points = values.map((v, i) => {
        const x = padding + (i / (values.length - 1)) * (width - 2 * padding);
        const y = padding + (1 - (v - min) / range) * (height - 2 * padding);
        return `${x},${y}`;
    });

    const lastPoint = points[points.length - 1].split(",");

    return (
        <svg width={width} height={height} className="w-full">
            <polyline
                points={points.join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                className={color}
            />
            <circle cx={lastPoint[0]} cy={lastPoint[1]} r="3" className={`fill-current ${color}`} />
        </svg>
    );
}

// ─── Stat Block ──────────────────────────────────────────

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
    return (
        <div className="bg-white/5 rounded-lg p-2.5">
            <div className="text-[9px] text-white/40 uppercase tracking-wider mb-0.5">{label}</div>
            <div className={`text-sm font-bold font-mono tabular-nums ${color || "text-white"}`}>{value}</div>
            {sub && <div className="text-[9px] text-white/40 mt-0.5">{sub}</div>}
        </div>
    );
}

// ─── Quick Action ────────────────────────────────────────

type ActionType = "coach" | "dm" | "note";

function QuickActionButton({
    icon,
    label,
    active,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                active
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 border border-white/5"
            }`}
        >
            {icon}
            {label}
        </button>
    );
}

// ─── Fade-in section wrapper ────────────────────────────

function FadeIn({ show, children, delay = 0 }: { show: boolean; children: React.ReactNode; delay?: number }) {
    return (
        <div
            className={`transition-all duration-300 ease-out ${show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
            style={{ transitionDelay: show ? `${delay}ms` : "0ms" }}
        >
            {children}
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────

export default function AgentScoutingCard({
    isOpen,
    onClose,
    agentName,
    intradayAgent,
    yesterdayData,
    qaPerAgent,
    declineAlert,
    attentionFlags,
    breakEven,
    teamStats,
    agentNames,
    onNavigate,
}: AgentScoutingCardProps) {
    const drawerRef = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    // Scouting data hook — fetches on open
    const { metrics, loading: scoutingLoading } = useAgentScoutingData({
        agentName: isOpen ? agentName : null,
        team: intradayAgent?.team ?? null,
        breakEven,
        teamStats,
    });

    // Quick action state
    const [activeAction, setActiveAction] = useState<ActionType | null>(null);
    const [actionText, setActionText] = useState("");
    const [actionLoading, setActionLoading] = useState(false);
    const [actionSuccess, setActionSuccess] = useState<string | null>(null);

    // AI coaching state
    const [aiCoachLoading, setAiCoachLoading] = useState(false);
    const [aiCoachResponse, setAiCoachResponse] = useState<string | null>(null);

    // Slide-in animation: mount first, then animate
    useEffect(() => {
        if (isOpen) {
            // Next frame to trigger CSS transition
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setVisible(true));
            });
        } else {
            setVisible(false);
        }
    }, [isOpen]);

    // Reset action state when agent changes
    useEffect(() => {
        setActiveAction(null);
        setActionText("");
        setActionSuccess(null);
        setAiCoachResponse(null);
    }, [agentName]);

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [isOpen, onClose]);

    // Close on outside click
    const handleBackdropClick = useCallback(
        (e: React.MouseEvent) => {
            if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
                onClose();
            }
        },
        [onClose]
    );

    // Navigation helpers
    const currentIndex = agentNames && agentName ? agentNames.indexOf(agentName) : -1;
    const canPrev = currentIndex > 0;
    const canNext = agentNames ? currentIndex < agentNames.length - 1 : false;

    const goToPrev = useCallback(() => {
        if (canPrev && agentNames && onNavigate) onNavigate(agentNames[currentIndex - 1]);
    }, [canPrev, agentNames, currentIndex, onNavigate]);

    const goToNext = useCallback(() => {
        if (canNext && agentNames && onNavigate) onNavigate(agentNames[currentIndex + 1]);
    }, [canNext, agentNames, currentIndex, onNavigate]);

    // Arrow key navigation
    useEffect(() => {
        if (!isOpen || !onNavigate) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); goToPrev(); }
            if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); goToNext(); }
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [isOpen, onNavigate, goToPrev, goToNext]);

    // Generate AI coaching suggestions via OpenRouter (Claude Sonnet 4.5)
    const generateAICoaching = useCallback(async () => {
        if (!agentName) return;
        setAiCoachLoading(true);
        setAiCoachResponse(null);
        try {
            const a = intradayAgent;
            const m = metrics;

            const res = await fetch("/api/ai/manager-coach", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    agentName,
                    slaHr: a?.sla_hr,
                    breakEven,
                    transfers: a?.transfers,
                    hoursWorked: a?.hours_worked,
                    momentum: a?.momentum,
                    varValue: m?.var_value,
                    varTier: m?.var_tier,
                    consistencyScore: m?.consistency_score,
                    trendDirection: m?.trend_direction,
                    trendSlope: m?.trend_slope,
                    hotColdStreak: m?.hot_cold_streak,
                    conversionVsTeam: m?.conversion_vs_team,
                    activityVsTeam: m?.activity_vs_team,
                    avg14dTph: m?.avg_14d?.tph,
                    qaScore: m?.qa?.avg_score,
                    qaPassRate: m?.qa?.pass_rate,
                    qaAutoFails: m?.qa?.auto_fail_count,
                    attentionFlags: attentionFlags?.map((f) => f.label).join(", ") || undefined,
                    declineStreak: declineAlert?.consecutive_decline_days,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setAiCoachResponse(data.response);
            } else {
                setAiCoachResponse("Failed to generate coaching suggestion. Please try again.");
            }
        } catch {
            setAiCoachResponse("Failed to generate coaching suggestion. Please try again.");
        } finally {
            setAiCoachLoading(false);
        }
    }, [agentName, intradayAgent, metrics, breakEven, attentionFlags, declineAlert]);

    // Submit quick action
    const submitAction = useCallback(async () => {
        if (!activeAction || !actionText.trim() || !metrics?.employee_id) return;
        setActionLoading(true);
        try {
            let url = "";
            let body: Record<string, unknown> = {};

            if (activeAction === "coach") {
                url = "/api/dialedin/coaching";
                body = {
                    agent_name: agentName,
                    event_type: "coaching",
                    notes: actionText.trim(),
                };
            } else if (activeAction === "dm") {
                url = "/api/slack/send-dm";
                body = {
                    employee_id: metrics.employee_id,
                    message: actionText.trim(),
                };
            } else if (activeAction === "note") {
                url = "/api/hr/employee-notes";
                body = {
                    employee_id: metrics.employee_id,
                    note: actionText.trim(),
                    note_type: "general",
                };
            }

            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                setActionSuccess(
                    activeAction === "coach"
                        ? "Coaching logged"
                        : activeAction === "dm"
                          ? "Message sent"
                          : "Note added"
                );
                setActionText("");
                setTimeout(() => {
                    setActionSuccess(null);
                    setActiveAction(null);
                }, 2000);
            }
        } catch {
            // Silent fail
        } finally {
            setActionLoading(false);
        }
    }, [activeAction, actionText, metrics?.employee_id, agentName]);

    if (!isOpen || !agentName) return null;

    const a = intradayAgent;
    const m = metrics;
    const varStyle = m ? VAR_STYLES[m.var_tier] : null;

    // Tenure
    const tenure = m?.hired_at
        ? (() => {
              const months = Math.round((Date.now() - new Date(m.hired_at!).getTime()) / (1000 * 60 * 60 * 24 * 30));
              return months < 1 ? "< 1mo" : months < 12 ? `${months}mo` : `${Math.round(months / 12 * 10) / 10}yr`;
          })()
        : null;

    return (
        <div
            className="fixed inset-0 z-50 flex justify-end"
            onClick={handleBackdropClick}
        >
            {/* Backdrop */}
            <div className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`} />

            {/* Drawer */}
            <div
                ref={drawerRef}
                className={`relative max-w-md w-full bg-gradient-to-b from-slate-950 via-gray-950 to-slate-950 overflow-y-auto border-l border-white/10 shadow-2xl transition-transform duration-300 ease-out ${visible ? "translate-x-0" : "translate-x-full"}`}
            >
                {/* Header */}
                <div className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur-md border-b border-white/5 px-5 py-4">
                    <div className="absolute top-4 right-4 flex items-center gap-1">
                        {/* Prev/Next navigation */}
                        {onNavigate && agentNames && (
                            <>
                                <button
                                    onClick={goToPrev}
                                    disabled={!canPrev}
                                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                    title="Previous agent (←)"
                                >
                                    <ChevronLeft size={14} className="text-white/50" />
                                </button>
                                <span className="text-[9px] text-white/30 font-mono tabular-nums min-w-[3ch] text-center">
                                    {currentIndex + 1}/{agentNames.length}
                                </span>
                                <button
                                    onClick={goToNext}
                                    disabled={!canNext}
                                    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                    title="Next agent (→)"
                                >
                                    <ChevronRight size={14} className="text-white/50" />
                                </button>
                            </>
                        )}
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                        >
                            <X size={16} className="text-white/50" />
                        </button>
                    </div>

                    <div className="flex items-center gap-3 pr-28">
                        {/* Avatar */}
                        <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center overflow-hidden shrink-0">
                            {m?.user_image ? (
                                <img src={m.user_image} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-indigo-400 font-bold text-lg">
                                    {agentName.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>

                        <div className="min-w-0">
                            <h3 className="text-white font-bold text-sm truncate">{agentName}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                                {a?.team && (
                                    <span className="text-[9px] font-bold bg-indigo-500/15 text-indigo-400 px-1.5 py-0.5 rounded">
                                        {a.team}
                                    </span>
                                )}
                                {a?.rank && (
                                    <span className="text-[10px] text-white/40 font-mono">#{a.rank}</span>
                                )}
                                {a?.is_new_hire && (
                                    <span className="text-[9px] font-bold bg-blue-500/20 text-blue-400 px-1 py-0.5 rounded">
                                        NEW
                                    </span>
                                )}
                                {tenure && <span className="text-[10px] text-white/30">{tenure}</span>}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-5 py-4 space-y-5">
                    {/* ── Moneyball Headline ── */}
                    {scoutingLoading && !m ? (
                        <div className="bg-white/5 rounded-xl p-4 border border-white/10 animate-pulse">
                            <div className="h-10 bg-white/5 rounded" />
                        </div>
                    ) : m ? (
                        <FadeIn show={!!m}>
                            <div className={`bg-white/5 rounded-xl p-4 border border-white/10 ${varStyle?.glow || ""}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] text-white/40 uppercase tracking-wider">VAR</span>
                                        <span className={`text-lg font-bold font-mono tabular-nums ${varStyle?.text}`}>
                                            {m.var_value >= 0 ? "+" : ""}${m.var_value.toFixed(2)}
                                        </span>
                                        <span className="text-[9px] text-white/30">/day</span>
                                    </div>
                                    <span
                                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${varStyle?.bg} ${varStyle?.text}`}
                                    >
                                        {varStyle?.label}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 text-[10px]">
                                    <span className="text-white/50">
                                        Consistency:{" "}
                                        <span className="text-white font-mono font-bold">{m.consistency_score}</span>
                                    </span>
                                    <span className="text-white/50 flex items-center gap-1">
                                        Trend:{" "}
                                        {m.trend_direction === "up" ? (
                                            <TrendingUp size={10} className="text-emerald-400" />
                                        ) : m.trend_direction === "down" ? (
                                            <TrendingDown size={10} className="text-red-400" />
                                        ) : (
                                            <span className="text-white/30">-</span>
                                        )}
                                        <span className="text-white font-mono">
                                            {m.trend_slope >= 0 ? "+" : ""}
                                            {m.trend_slope.toFixed(3)}
                                        </span>
                                    </span>
                                    {m.hot_cold_streak !== 0 && (
                                        <span className={m.hot_cold_streak > 0 ? "text-emerald-400" : "text-red-400"}>
                                            {m.hot_cold_streak > 0 ? `${m.hot_cold_streak}d hot` : `${Math.abs(m.hot_cold_streak)}d cold`}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </FadeIn>
                    ) : null}

                    {/* ── Today (Live) — instant, no loading needed ── */}
                    {a && (
                        <div>
                            <div className="text-[9px] text-white/30 uppercase tracking-widest font-bold mb-2">
                                Today (Live)
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                                <Stat
                                    label="SLA/hr"
                                    value={a.sla_hr.toFixed(2)}
                                    color={a.aboveBE ? "text-emerald-400" : "text-red-400"}
                                />
                                <Stat label="SLAs" value={String(a.transfers)} />
                                <Stat label="Hours" value={`${a.hours_worked.toFixed(1)}h`} />
                                <Stat
                                    label="Momentum"
                                    value={
                                        a.momentum === "up"
                                            ? "Up"
                                            : a.momentum === "down"
                                              ? "Down"
                                              : "Steady"
                                    }
                                    sub={a.sla_hr_2h_ago ? `was ${a.sla_hr_2h_ago.toFixed(2)}` : undefined}
                                    color={
                                        a.momentum === "up"
                                            ? "text-emerald-400"
                                            : a.momentum === "down"
                                              ? "text-red-400"
                                              : "text-white/50"
                                    }
                                />
                            </div>
                            {yesterdayData && (
                                <div className="text-[10px] text-white/40 mt-2 font-mono">
                                    vs Yesterday: {yesterdayData.sla_hr.toFixed(2)} SLA/hr
                                    <span
                                        className={`ml-1 ${
                                            a.sla_hr - yesterdayData.sla_hr >= 0 ? "text-emerald-400" : "text-red-400"
                                        }`}
                                    >
                                        ({a.sla_hr - yesterdayData.sla_hr >= 0 ? "+" : ""}
                                        {(a.sla_hr - yesterdayData.sla_hr).toFixed(2)})
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── 14-Day Performance ── */}
                    {m && m.sparkline_14d.length > 0 && (
                        <FadeIn show={!!m} delay={50}>
                            <div>
                                <div className="text-[9px] text-white/30 uppercase tracking-widest font-bold mb-2">
                                    14-Day Performance
                                </div>
                                <div className="bg-white/5 rounded-lg p-3 mb-2">
                                    <Sparkline
                                        values={m.sparkline_14d}
                                        color={m.trend_direction === "up" ? "text-emerald-400" : m.trend_direction === "down" ? "text-red-400" : "text-cyan-400"}
                                    />
                                </div>
                                {m.avg_14d && (
                                    <div className="grid grid-cols-4 gap-2">
                                        <Stat label="Avg TPH" value={m.avg_14d.tph.toFixed(2)} />
                                        <Stat
                                            label="Conv %"
                                            value={`${m.avg_14d.conversion_rate.toFixed(1)}%`}
                                            sub={
                                                m.conversion_vs_team !== 0
                                                    ? `${m.conversion_vs_team >= 0 ? "+" : ""}${m.conversion_vs_team.toFixed(1)} vs team`
                                                    : undefined
                                            }
                                            color={m.conversion_vs_team > 0 ? "text-emerald-400" : undefined}
                                        />
                                        <Stat label="Dials/hr" value={String(m.dials_per_hour)} />
                                        <Stat
                                            label="Activity"
                                            value={
                                                Math.abs(m.activity_vs_team) < 2
                                                    ? "Normal"
                                                    : m.activity_vs_team > 0
                                                      ? "High"
                                                      : "Low"
                                            }
                                            color={
                                                m.activity_vs_team < -2
                                                    ? "text-amber-400"
                                                    : m.activity_vs_team > 2
                                                      ? "text-emerald-400"
                                                      : "text-white/50"
                                            }
                                        />
                                    </div>
                                )}
                            </div>
                        </FadeIn>
                    )}

                    {scoutingLoading && !m && (
                        <div className="space-y-2">
                            <div className="h-12 bg-white/5 rounded-lg animate-pulse" />
                            <div className="h-12 bg-white/5 rounded-lg animate-pulse" />
                        </div>
                    )}

                    {/* ── Attention Flags ── */}
                    {attentionFlags && attentionFlags.length > 0 && (
                        <div>
                            <div className="text-[9px] text-white/30 uppercase tracking-widest font-bold mb-2">
                                Attention Flags
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {attentionFlags.map((f) => (
                                    <span
                                        key={f.type}
                                        className={`text-[9px] font-bold px-2 py-1 rounded border ${FLAG_STYLES[f.severity]}`}
                                    >
                                        {f.label}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Decline Alert ── */}
                    {declineAlert && (
                        <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[9px] text-red-400 uppercase tracking-wider font-bold">
                                    Decline Streak
                                </span>
                                <span className="text-[10px] font-bold text-red-400">
                                    {declineAlert.consecutive_decline_days}d (-{declineAlert.drop_pct}%)
                                </span>
                            </div>
                            <div className="text-[10px] text-white/40 font-mono">
                                {declineAlert.tph_start.toFixed(2)} &rarr; {declineAlert.tph_end.toFixed(2)} SLA/hr
                            </div>
                        </div>
                    )}

                    {/* ── QA & Compliance ── */}
                    {(qaPerAgent || m?.qa) && (
                        <FadeIn show={!!(qaPerAgent || m?.qa)} delay={100}>
                            <div>
                                <div className="text-[9px] text-white/30 uppercase tracking-widest font-bold mb-2">
                                    QA & Compliance {m?.qa ? "(90d)" : "(7d)"}
                                </div>
                                <div className="grid grid-cols-4 gap-2">
                                    {(() => {
                                        const qa = m?.qa || (qaPerAgent ? {
                                            avg_score: qaPerAgent.avg_score,
                                            pass_rate: qaPerAgent.pass_rate,
                                            auto_fail_count: qaPerAgent.auto_fail_count,
                                            total_calls: qaPerAgent.total_calls,
                                        } : null);
                                        if (!qa) return null;
                                        return (
                                            <>
                                                <Stat
                                                    label="Score"
                                                    value={String(Math.round(qa.avg_score))}
                                                    color={qa.avg_score >= 90 ? "text-emerald-400" : qa.avg_score >= 75 ? "text-amber-400" : "text-red-400"}
                                                />
                                                <Stat label="Pass Rate" value={`${Math.round(qa.pass_rate)}%`} />
                                                <Stat
                                                    label="Auto-Fails"
                                                    value={String(qa.auto_fail_count)}
                                                    color={qa.auto_fail_count > 0 ? "text-red-400" : "text-white/50"}
                                                />
                                                <Stat label="Calls" value={String(qa.total_calls)} />
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </FadeIn>
                    )}

                    {/* ── Coaching History ── */}
                    {m && (
                        <FadeIn show={!!m} delay={150}>
                            <div>
                                <div className="text-[9px] text-white/30 uppercase tracking-widest font-bold mb-2">
                                    Coaching History
                                </div>
                                {m.last_coached_days_ago !== null ? (
                                    <div className="text-[10px] text-white/40 mb-2">
                                        Last coached:{" "}
                                        <span className={m.last_coached_days_ago > 30 ? "text-amber-400" : "text-white/60"}>
                                            {m.last_coached_days_ago === 0
                                                ? "Today"
                                                : `${m.last_coached_days_ago} days ago`}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="text-[10px] text-white/30 italic mb-2">No coaching records</div>
                                )}
                                {m.coaching_events.length > 0 && (
                                    <div className="space-y-1">
                                        {m.coaching_events.map((e, i) => (
                                            <div
                                                key={`${e.event_date}-${i}`}
                                                className="flex items-center gap-2 text-[10px] py-1 px-2 rounded hover:bg-white/5"
                                            >
                                                <span className="text-white/30 font-mono shrink-0">
                                                    {e.event_date.slice(5)}
                                                </span>
                                                <span
                                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                                        e.event_type === "warning"
                                                            ? "bg-amber-500/15 text-amber-400"
                                                            : e.event_type === "pip"
                                                              ? "bg-red-500/15 text-red-400"
                                                              : "bg-indigo-500/15 text-indigo-400"
                                                    }`}
                                                >
                                                    {e.event_type}
                                                </span>
                                                <span className="text-white/50 truncate">{e.notes}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </FadeIn>
                    )}

                    {/* ── Quick Actions ── */}
                    <div className="border-t border-white/5 pt-4">
                        <div className="text-[9px] text-white/30 uppercase tracking-widest font-bold mb-2">
                            Quick Actions
                        </div>

                        {!m?.employee_id && !scoutingLoading && (
                            <div className="text-[10px] text-white/30 italic">
                                No directory match found — actions unavailable
                            </div>
                        )}

                        {(m?.employee_id || scoutingLoading) && (
                            <>
                                <div className="flex gap-2 mb-3">
                                    <QuickActionButton
                                        icon={<GraduationCap size={12} />}
                                        label="Coach"
                                        active={activeAction === "coach"}
                                        onClick={() => setActiveAction(activeAction === "coach" ? null : "coach")}
                                    />
                                    {m?.slack_user_id && (
                                        <QuickActionButton
                                            icon={<MessageSquare size={12} />}
                                            label="DM Slack"
                                            active={activeAction === "dm"}
                                            onClick={() => setActiveAction(activeAction === "dm" ? null : "dm")}
                                        />
                                    )}
                                    <QuickActionButton
                                        icon={<StickyNote size={12} />}
                                        label="Add Note"
                                        active={activeAction === "note"}
                                        onClick={() => setActiveAction(activeAction === "note" ? null : "note")}
                                    />
                                </div>

                                {activeAction && (
                                    <div className="space-y-2">
                                        <textarea
                                            value={actionText}
                                            onChange={(e) => setActionText(e.target.value)}
                                            placeholder={
                                                activeAction === "coach"
                                                    ? "Coaching notes..."
                                                    : activeAction === "dm"
                                                      ? "Slack message..."
                                                      : "Note..."
                                            }
                                            rows={3}
                                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500/50 resize-none"
                                        />

                                        {/* AI Coaching Suggest — only for coach action */}
                                        {activeAction === "coach" && (
                                            <div className="space-y-2">
                                                <button
                                                    onClick={generateAICoaching}
                                                    disabled={aiCoachLoading || scoutingLoading}
                                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-500/15 text-purple-300 text-[10px] font-medium hover:bg-purple-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    {aiCoachLoading ? (
                                                        <Loader2 size={10} className="animate-spin" />
                                                    ) : (
                                                        <Sparkles size={10} />
                                                    )}
                                                    {aiCoachLoading ? "Generating..." : "AI Suggest"}
                                                </button>

                                                {aiCoachResponse && (
                                                    <div className="bg-purple-500/5 border border-purple-500/15 rounded-lg p-3 space-y-2">
                                                        <div className="text-[9px] text-purple-300/60 uppercase tracking-wider font-bold">
                                                            AI Coaching Suggestion
                                                        </div>
                                                        <div className="text-[11px] text-white/80 leading-relaxed whitespace-pre-wrap">
                                                            {aiCoachResponse}
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                setActionText(aiCoachResponse);
                                                                setAiCoachResponse(null);
                                                            }}
                                                            className="text-[10px] text-purple-300 hover:text-purple-200 font-medium transition-colors"
                                                        >
                                                            Use as coaching notes
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between">
                                            {actionSuccess ? (
                                                <span className="text-[10px] text-emerald-400 font-medium">
                                                    {actionSuccess}
                                                </span>
                                            ) : (
                                                <span />
                                            )}
                                            <button
                                                onClick={submitAction}
                                                disabled={!actionText.trim() || actionLoading}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-medium hover:bg-indigo-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                {actionLoading ? (
                                                    <Loader2 size={12} className="animate-spin" />
                                                ) : (
                                                    <Send size={12} />
                                                )}
                                                Send
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Cost efficiency (bottom) */}
                    {m?.cost_per_sla && (
                        <div className="text-[10px] text-white/30 text-center border-t border-white/5 pt-3">
                            Cost/SLA: <span className="text-white/50 font-mono">${m.cost_per_sla.toFixed(2)}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

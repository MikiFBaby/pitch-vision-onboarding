"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X, Phone, Mail, MapPin, Calendar, Shield, TrendingUp,
    Zap, Target, Clock, Award, AlertTriangle, Ban, Loader2,
    ExternalLink,
} from "lucide-react";

interface AgentCardEmployee {
    id: string;
    first_name: string;
    last_name: string;
    role: string | null;
    email: string | null;
    phone: string | null;
    country: string | null;
    employee_status: string | null;
    hired_at: string | null;
    hourly_wage: number | null;
    user_image: string | null;
    current_campaigns?: string[] | null;
    slack_display_name: string | null;
}

interface PerfStats {
    tph: number;
    adjusted_tph: number | null;
    transfers: number;
    conversion_rate: number;
    connect_rate: number;
    hours_worked: number;
    dials: number;
    connects: number;
    tph_rank: number | null;
}

interface QAStats {
    avg_score: number;
    pass_rate: number;
    auto_fail_count: number;
    total_calls: number;
}

interface AttendanceContext {
    recentUnplannedCount: number;
    recentPlannedCount: number;
    recentScore: number;
    occurrenceScore: number;
    trend: "worsening" | "improving" | "stable" | "new";
}

interface AgentBaseballCardProps {
    isOpen: boolean;
    onClose: () => void;
    employee: AgentCardEmployee | null;
    attendance?: AttendanceContext;
    onViewFullProfile?: () => void;
}

const CAMPAIGN_COLORS: Record<string, string> = {
    medicare: "from-blue-500/30 to-blue-600/10 text-blue-300 border-blue-500/30",
    aca: "from-emerald-500/30 to-emerald-600/10 text-emerald-300 border-emerald-500/30",
    whatif: "from-purple-500/30 to-purple-600/10 text-purple-300 border-purple-500/30",
    "home care michigan": "from-teal-500/30 to-teal-600/10 text-teal-300 border-teal-500/30",
    hospital: "from-rose-500/30 to-rose-600/10 text-rose-300 border-rose-500/30",
    "pitch meals": "from-orange-500/30 to-orange-600/10 text-orange-300 border-orange-500/30",
};

function getCampaignColor(campaign: string) {
    const key = campaign.toLowerCase().replace(/[^a-z ]/g, "").trim();
    for (const [k, v] of Object.entries(CAMPAIGN_COLORS)) {
        if (key.includes(k)) return v;
    }
    return "from-white/10 to-white/5 text-white/60 border-white/15";
}

function getTenure(hiredAt: string | null): string {
    if (!hiredAt) return "—";
    const hired = new Date(hiredAt);
    const now = new Date();
    const months = (now.getFullYear() - hired.getFullYear()) * 12 + (now.getMonth() - hired.getMonth());
    if (months < 1) return "< 1mo";
    if (months < 12) return `${months}mo`;
    const years = Math.floor(months / 12);
    const rem = months % 12;
    return rem > 0 ? `${years}y ${rem}mo` : `${years}y`;
}

export default function AgentBaseballCard({ isOpen, onClose, employee, attendance, onViewFullProfile }: AgentBaseballCardProps) {
    const [perf, setPerf] = useState<PerfStats | null>(null);
    const [qa, setQA] = useState<QAStats | null>(null);
    const [loading, setLoading] = useState(true);
    const cardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen || !employee) return;
        setPerf(null);
        setQA(null);
        setLoading(true);

        const name = `${employee.first_name} ${employee.last_name}`.trim();

        Promise.allSettled([
            fetch(`/api/dialedin/agent-stats?name=${encodeURIComponent(name)}`).then(r => r.json()),
            fetch(`/api/dialedin/qa-stats?days=90&agent=${encodeURIComponent(name)}`).then(r => r.json()),
        ]).then(([perfResult, qaResult]) => {
            if (perfResult.status === "fulfilled" && perfResult.value?.averages) {
                const avg = perfResult.value.averages;
                const latest = perfResult.value.latest;
                setPerf({
                    tph: avg.tph ?? latest?.tph ?? 0,
                    adjusted_tph: avg.adjusted_tph ?? latest?.adjusted_tph ?? null,
                    transfers: perfResult.value.totals?.transfers ?? 0,
                    conversion_rate: avg.conversion_rate ?? 0,
                    connect_rate: avg.connect_rate ?? 0,
                    hours_worked: avg.hours_worked ?? 0,
                    dials: perfResult.value.totals?.dials ?? 0,
                    connects: perfResult.value.totals?.connects ?? 0,
                    tph_rank: latest?.tph_rank ?? null,
                });
            }
            if (qaResult.status === "fulfilled" && qaResult.value?.data) {
                const agents = Object.values(qaResult.value.data) as any[];
                if (agents.length > 0) {
                    const a = agents[0];
                    setQA({
                        avg_score: a.avg_score ?? 0,
                        pass_rate: a.pass_rate ?? 0,
                        auto_fail_count: a.auto_fail_count ?? 0,
                        total_calls: a.total_calls ?? 0,
                    });
                }
            }
            setLoading(false);
        });
    }, [isOpen, employee]);

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [isOpen, onClose]);

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [isOpen, onClose]);

    if (!employee) return null;

    const fullName = `${employee.first_name} ${employee.last_name}`.trim();
    const initials = `${(employee.first_name || "?")[0]}${(employee.last_name || "?")[0]}`.toUpperCase();
    const tenure = getTenure(employee.hired_at);
    const campaigns = employee.current_campaigns || [];
    const isAgent = employee.role?.toLowerCase() === "agent";

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                >
                    <motion.div
                        ref={cardRef}
                        initial={{ opacity: 0, scale: 0.92, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 20 }}
                        transition={{ type: "spring", damping: 28, stiffness: 350 }}
                        className="relative w-full max-w-[420px] overflow-hidden rounded-2xl"
                    >
                        {/* Outer glow ring */}
                        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-white/20 via-white/[0.06] to-white/[0.02]" />

                        {/* Card body */}
                        <div className="relative bg-[#0a0d14] rounded-2xl overflow-hidden">
                            {/* Top accent bar */}
                            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

                            {/* Close button */}
                            <button
                                onClick={onClose}
                                className="absolute top-3 right-3 z-20 w-7 h-7 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white/30 hover:text-white/70 transition-all"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>

                            {/* ── Hero Section ── */}
                            <div className="relative px-6 pt-6 pb-4">
                                {/* Subtle gradient backdrop behind avatar */}
                                <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-cyan-500/[0.06] to-transparent" />

                                <div className="relative flex items-start gap-4">
                                    {/* Avatar with holographic border */}
                                    <div className="relative shrink-0">
                                        <div className="absolute -inset-[2px] rounded-xl bg-gradient-to-br from-cyan-400/40 via-purple-400/20 to-rose-400/30 animate-[spin_8s_linear_infinite] opacity-70" style={{ filter: "blur(1px)" }} />
                                        <div className="relative w-[68px] h-[68px] rounded-xl overflow-hidden bg-[#12151e] ring-1 ring-white/[0.08]">
                                            {employee.user_image ? (
                                                <img src={employee.user_image} alt={fullName} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/[0.08] to-white/[0.02] text-white/50 text-lg font-bold">
                                                    {initials}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Name + metadata */}
                                    <div className="flex-1 min-w-0 pt-1">
                                        <h3 className="text-[17px] font-bold text-white tracking-tight leading-tight">
                                            {fullName}
                                        </h3>
                                        <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                                            <span className={`inline-flex items-center px-1.5 py-[1px] rounded font-semibold text-[10px] uppercase tracking-wider ${
                                                employee.employee_status === "Active"
                                                    ? "bg-emerald-500/15 text-emerald-400"
                                                    : employee.employee_status === "Terminated"
                                                        ? "bg-red-500/15 text-red-400"
                                                        : "bg-amber-500/15 text-amber-400"
                                            }`}>
                                                {employee.employee_status || "Unknown"}
                                            </span>
                                            {employee.role && (
                                                <span className="text-white/70">{employee.role}</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 mt-2 text-[11px] text-white/60">
                                            {employee.country && (
                                                <span className="flex items-center gap-1">
                                                    <MapPin className="w-[10px] h-[10px]" />
                                                    {employee.country}
                                                </span>
                                            )}
                                            {employee.hired_at && (
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-[10px] h-[10px]" />
                                                    {tenure}
                                                </span>
                                            )}
                                            {isAgent && employee.hourly_wage != null && (
                                                <span className="text-white/60 font-medium tabular-nums">
                                                    ${employee.hourly_wage.toFixed(2)}/hr
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Campaign tags */}
                                {campaigns.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-3">
                                        {campaigns.map((c) => (
                                            <span
                                                key={c}
                                                className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold border bg-gradient-to-r ${getCampaignColor(c)}`}
                                            >
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* ── Divider ── */}
                            <div className="mx-5 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

                            {/* ── Stats Grid (Performance + QA) ── */}
                            {isAgent && (
                                <div className="px-5 py-4">
                                    {loading ? (
                                        <div className="flex items-center justify-center gap-2 py-6 text-white/50 text-[11px]">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            Loading stats...
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {/* Performance row */}
                                            {perf && (
                                                <div>
                                                    <div className="text-[10px] uppercase tracking-[0.1em] text-white/50 font-semibold mb-2">Performance · 14-Day Avg</div>
                                                    <div className="grid grid-cols-4 gap-2">
                                                        <StatBlock
                                                            label="SLA/hr"
                                                            value={perf.tph.toFixed(1)}
                                                            icon={<Zap className="w-3 h-3" />}
                                                            color="cyan"
                                                            badge={perf.tph_rank != null && perf.tph_rank <= 10 ? `#${perf.tph_rank}` : undefined}
                                                        />
                                                        <StatBlock
                                                            label="Conv %"
                                                            value={`${perf.conversion_rate.toFixed(1)}%`}
                                                            icon={<Target className="w-3 h-3" />}
                                                            color="emerald"
                                                        />
                                                        <StatBlock
                                                            label="Transfers"
                                                            value={String(perf.transfers)}
                                                            icon={<TrendingUp className="w-3 h-3" />}
                                                            color="white"
                                                        />
                                                        <StatBlock
                                                            label="Hrs/Day"
                                                            value={perf.hours_worked.toFixed(1)}
                                                            icon={<Clock className="w-3 h-3" />}
                                                            color="white"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {/* QA row */}
                                            {qa && (
                                                <div>
                                                    <div className="text-[10px] uppercase tracking-[0.1em] text-white/50 font-semibold mb-2">QA Compliance · 90 Days</div>
                                                    <div className="grid grid-cols-4 gap-2">
                                                        <StatBlock
                                                            label="Score"
                                                            value={qa.avg_score.toFixed(0)}
                                                            icon={<Shield className="w-3 h-3" />}
                                                            color={qa.avg_score >= 70 ? "emerald" : qa.avg_score >= 40 ? "amber" : "red"}
                                                        />
                                                        <StatBlock
                                                            label="Pass Rate"
                                                            value={`${qa.pass_rate.toFixed(0)}%`}
                                                            icon={<Award className="w-3 h-3" />}
                                                            color={qa.pass_rate >= 80 ? "emerald" : qa.pass_rate >= 60 ? "amber" : "red"}
                                                        />
                                                        <StatBlock
                                                            label="Auto-Fails"
                                                            value={String(qa.auto_fail_count)}
                                                            icon={<AlertTriangle className="w-3 h-3" />}
                                                            color={qa.auto_fail_count === 0 ? "emerald" : qa.auto_fail_count <= 2 ? "amber" : "red"}
                                                        />
                                                        <StatBlock
                                                            label="Calls"
                                                            value={String(qa.total_calls)}
                                                            icon={<Phone className="w-3 h-3" />}
                                                            color="white"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {!perf && !qa && (
                                                <div className="text-center py-4 text-[11px] text-white/40">
                                                    No performance or QA data available
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Attendance Section ── */}
                            {attendance && (
                                <>
                                    <div className="mx-5 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
                                    <div className="px-5 py-3">
                                        <div className="text-[10px] uppercase tracking-[0.1em] text-white/50 font-semibold mb-2">Attendance · Last 14 Days</div>
                                        <div className="flex items-center gap-2">
                                            {attendance.recentUnplannedCount > 0 && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-amber-500/15 text-amber-300">
                                                    <AlertTriangle className="w-[10px] h-[10px]" />
                                                    {attendance.recentUnplannedCount} unplanned
                                                </span>
                                            )}
                                            {attendance.recentPlannedCount > 0 && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md bg-white/[0.06] text-white/40">
                                                    <Calendar className="w-[10px] h-[10px]" />
                                                    {attendance.recentPlannedCount} planned
                                                </span>
                                            )}
                                            <span className={`ml-auto text-[10px] font-bold tabular-nums px-2 py-1 rounded-md ${
                                                attendance.recentScore >= 4
                                                    ? "bg-red-500/15 text-red-400"
                                                    : attendance.recentScore >= 2
                                                        ? "bg-amber-500/15 text-amber-300"
                                                        : "bg-white/[0.06] text-white/40"
                                            }`}>
                                                {attendance.recentScore.toFixed(1)} pts
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* ── Contact Row ── */}
                            <div className="mx-5 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
                            <div className="flex items-center gap-3 px-5 py-3 text-[11px] text-white/50">
                                {employee.email && (
                                    <span className="flex items-center gap-1 truncate">
                                        <Mail className="w-[10px] h-[10px] shrink-0" />
                                        {employee.email}
                                    </span>
                                )}
                                {employee.phone && (
                                    <span className="flex items-center gap-1 shrink-0">
                                        <Phone className="w-[10px] h-[10px]" />
                                        {employee.phone}
                                    </span>
                                )}
                            </div>

                            {/* ── Footer ── */}
                            {onViewFullProfile && (
                                <>
                                    <div className="mx-5 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
                                    <div className="px-5 py-3">
                                        <button
                                            onClick={onViewFullProfile}
                                            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.12] text-white/50 hover:text-white/80 transition-all text-[11px] font-semibold"
                                        >
                                            View Full Profile
                                            <ExternalLink className="w-3 h-3" />
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* Bottom accent */}
                            <div className="absolute bottom-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/* ── Stat Block Sub-Component ── */

const COLOR_MAP: Record<string, { icon: string; value: string; bg: string }> = {
    cyan:    { icon: "text-cyan-400",    value: "text-cyan-300",    bg: "bg-cyan-500/10" },
    emerald: { icon: "text-emerald-400", value: "text-emerald-300", bg: "bg-emerald-500/10" },
    amber:   { icon: "text-amber-400",   value: "text-amber-300",   bg: "bg-amber-500/10" },
    red:     { icon: "text-red-400",     value: "text-red-300",     bg: "bg-red-500/10" },
    white:   { icon: "text-white/60",    value: "text-white/90",    bg: "bg-white/[0.06]" },
};

function StatBlock({ label, value, icon, color, badge }: {
    label: string;
    value: string;
    icon: React.ReactNode;
    color: string;
    badge?: string;
}) {
    const c = COLOR_MAP[color] || COLOR_MAP.white;
    return (
        <div className={`relative rounded-lg ${c.bg} px-2.5 py-2 text-center`}>
            {badge && (
                <span className="absolute -top-1.5 -right-1.5 text-[8px] font-black bg-cyan-500/90 text-white px-1.5 py-[1px] rounded-full shadow-lg shadow-cyan-500/30">
                    {badge}
                </span>
            )}
            <div className={`flex items-center justify-center gap-1 mb-1 ${c.icon}`}>
                {icon}
            </div>
            <div className={`text-[15px] font-bold tabular-nums leading-none ${c.value}`}>
                {value}
            </div>
            <div className="text-[9px] uppercase tracking-wider text-white/50 font-semibold mt-1">
                {label}
            </div>
        </div>
    );
}

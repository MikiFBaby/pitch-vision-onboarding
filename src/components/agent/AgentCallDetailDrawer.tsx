"use client";

import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, AlertTriangle, CheckCircle, XCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AutoFailReason {
    code: string;
    violation: string;
    description?: string;
    timestamp?: string | null;
    evidence?: string | null;
}

interface ChecklistItem {
    item: string;
    status: string;
    details?: string;
}

interface CallData {
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

interface AgentCallDetailDrawerProps {
    call: CallData | null;
    onClose: () => void;
}

export default function AgentCallDetailDrawer({ call, onClose }: AgentCallDetailDrawerProps) {
    const backdropRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [onClose]);

    const afReasons: AutoFailReason[] = call?.auto_fail_reasons
        ? (call.auto_fail_reasons as AutoFailReason[]).filter((r) => r && typeof r === "object")
        : [];

    const checklist: ChecklistItem[] = call?.compliance_checklist
        ? (call.compliance_checklist as ChecklistItem[]).filter((c) => c && typeof c === "object")
        : [];

    const failedItems = checklist.filter((c) => c.status?.toUpperCase() === "FAIL" || c.status?.toUpperCase() === "REVIEW");

    return (
        <AnimatePresence>
            {call && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        ref={backdropRef}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 z-50"
                        onClick={onClose}
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-[#0a0a0f] border-l border-white/10 z-50 overflow-y-auto"
                    >
                        <div className="p-6 space-y-6">
                            {/* Header */}
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-white">Call Details</h3>
                                    <p className="text-sm text-white/50 mt-1">
                                        {call.call_date ? new Date(call.call_date + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "Unknown date"}
                                        {call.phone_number ? ` · ${call.phone_number.slice(0, 3)}-***-${call.phone_number.slice(-4)}` : ""}
                                    </p>
                                </div>
                                <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                                    <X size={18} className="text-white/50" />
                                </button>
                            </div>

                            {/* Score + Status */}
                            <div className="flex items-center gap-3">
                                <span className={cn(
                                    "text-2xl font-bold font-mono px-3 py-1 rounded-lg",
                                    call.compliance_score == null ? "bg-white/5 text-white/30" :
                                    call.compliance_score >= 80 ? "bg-emerald-500/10 text-emerald-400" :
                                    call.compliance_score >= 60 ? "bg-amber-500/10 text-amber-400" :
                                    "bg-red-500/10 text-red-400"
                                )}>
                                    {call.compliance_score != null ? `${call.compliance_score}%` : "—"}
                                </span>
                                {call.auto_fail_triggered && (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-red-500/15 text-red-400 px-3 py-1.5 rounded-lg border border-red-500/20">
                                        <AlertTriangle size={12} />
                                        Auto-Fail
                                    </span>
                                )}
                                {call.product_type && (
                                    <span className="text-xs font-bold text-white/40 bg-white/5 px-2 py-1 rounded capitalize">{call.product_type}</span>
                                )}
                                {call.call_duration && (
                                    <span className="text-xs text-white/40 font-mono">{call.call_duration}</span>
                                )}
                            </div>

                            {/* Audio Player */}
                            {call.recording_url && (
                                <div className="bg-white/5 rounded-xl p-4 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Play size={14} className="text-indigo-400" />
                                        <span className="text-xs font-bold text-white/60 uppercase tracking-wider">Call Recording</span>
                                    </div>
                                    <audio
                                        controls
                                        preload="none"
                                        className="w-full h-10 [&::-webkit-media-controls-panel]:bg-white/5 rounded"
                                        src={call.recording_url}
                                    >
                                        Your browser does not support audio playback.
                                    </audio>
                                </div>
                            )}
                            {!call.recording_url && (
                                <div className="bg-white/5 rounded-xl p-4 text-center">
                                    <p className="text-xs text-white/30">No recording available for this call</p>
                                </div>
                            )}

                            {/* Auto-Fail Violations */}
                            {afReasons.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="text-sm font-bold text-red-400 uppercase tracking-wider">Violations</h4>
                                    <div className="space-y-3">
                                        {afReasons.map((r, i) => (
                                            <div key={i} className="bg-red-500/5 border border-red-500/10 rounded-xl p-4 space-y-2">
                                                <div className="flex items-start gap-2">
                                                    <span className="text-[10px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded font-mono shrink-0">{r.code}</span>
                                                    <p className="text-sm text-white/80">{r.violation}</p>
                                                </div>
                                                {r.description && r.description !== r.violation && (
                                                    <p className="text-xs text-white/50 pl-8">{r.description}</p>
                                                )}
                                                {r.evidence && (
                                                    <div className="pl-8">
                                                        <p className="text-xs text-white/40 italic border-l-2 border-red-500/20 pl-3">&ldquo;{r.evidence}&rdquo;</p>
                                                    </div>
                                                )}
                                                {r.timestamp && (
                                                    <p className="text-[10px] text-white/30 font-mono pl-8">at {r.timestamp}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Checklist Items (FAIL / REVIEW only) */}
                            {failedItems.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="text-sm font-bold text-amber-400 uppercase tracking-wider">Checklist Issues</h4>
                                    <div className="space-y-2">
                                        {failedItems.map((c, i) => {
                                            const isFail = c.status?.toUpperCase() === "FAIL";
                                            return (
                                                <div key={i} className="flex items-start gap-3 bg-white/5 rounded-lg p-3">
                                                    {isFail ? (
                                                        <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                                                    ) : (
                                                        <HelpCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                                                    )}
                                                    <div>
                                                        <p className="text-xs text-white/80">{c.item}</p>
                                                        {c.details && <p className="text-[11px] text-white/40 mt-0.5">{c.details}</p>}
                                                    </div>
                                                    <span className={cn(
                                                        "text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ml-auto",
                                                        isFail ? "text-red-400 bg-red-500/15" : "text-amber-400 bg-amber-500/15"
                                                    )}>
                                                        {c.status}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Passed items summary (compact) */}
                            {checklist.length > 0 && checklist.length > failedItems.length && (
                                <div className="flex items-center gap-2 text-xs text-emerald-400/60">
                                    <CheckCircle size={12} />
                                    <span>{checklist.length - failedItems.length} checklist items passed</span>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

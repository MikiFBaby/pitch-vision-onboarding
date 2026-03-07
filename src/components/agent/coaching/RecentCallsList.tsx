"use client";

import { motion } from "framer-motion";
import { Play, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

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

interface RecentCallsListProps {
    calls: RecentCall[];
    onSelect: (call: RecentCall) => void;
}

export default function RecentCallsList({ calls, onSelect }: RecentCallsListProps) {
    if (calls.length === 0) {
        return (
            <div className="text-center py-8">
                <p className="text-white/30 text-sm">No reviewed calls yet.</p>
                <p className="text-white/20 text-xs mt-1">Calls will appear here after QA review.</p>
            </div>
        );
    }

    return (
        <div className="space-y-1.5">
            {calls.slice(0, 8).map((call, i) => {
                const afReasons = call.auto_fail_reasons
                    ? (call.auto_fail_reasons as { code?: string }[]).filter((r) => r?.code)
                    : [];
                const uniqueCodes = [...new Set(afReasons.map((r) => r.code))];

                return (
                    <motion.button
                        key={call.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        onClick={() => onSelect(call)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] hover:bg-white/5 border border-transparent hover:border-white/5 transition-all text-left group"
                    >
                        {/* Score badge */}
                        <span className={cn(
                            "text-sm font-bold font-mono w-12 text-center px-1.5 py-1 rounded-lg shrink-0",
                            call.compliance_score == null ? "bg-white/5 text-white/30" :
                            call.compliance_score >= 80 ? "bg-emerald-500/10 text-emerald-400" :
                            call.compliance_score >= 60 ? "bg-amber-500/10 text-amber-400" :
                            "bg-red-500/10 text-red-400"
                        )}>
                            {call.compliance_score != null ? `${call.compliance_score}` : "—"}
                        </span>

                        {/* Date + phone */}
                        <div className="flex-1 min-w-0">
                            <div className="text-xs text-white/70 font-medium">
                                {call.call_date
                                    ? new Date(call.call_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })
                                    : "—"}
                                {call.phone_number && (
                                    <span className="text-white/30 ml-2 font-mono">
                                        ***-{call.phone_number.slice(-4)}
                                    </span>
                                )}
                            </div>
                            {/* AF code pills */}
                            {uniqueCodes.length > 0 && (
                                <div className="flex items-center gap-1 mt-1">
                                    {call.auto_fail_triggered && <AlertTriangle size={10} className="text-red-400 shrink-0" />}
                                    {uniqueCodes.slice(0, 3).map((code) => (
                                        <span key={code} className="text-[9px] font-bold text-red-400/80 bg-red-500/10 px-1.5 py-0.5 rounded font-mono">
                                            {code}
                                        </span>
                                    ))}
                                    {uniqueCodes.length > 3 && (
                                        <span className="text-[9px] text-white/30">+{uniqueCodes.length - 3}</span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Duration + play hint */}
                        <div className="flex items-center gap-2 shrink-0">
                            {call.call_duration && (
                                <span className="text-[10px] text-white/30 font-mono">{call.call_duration}</span>
                            )}
                            <Play size={12} className="text-white/20 group-hover:text-indigo-400 transition-colors" />
                        </div>
                    </motion.button>
                );
            })}
        </div>
    );
}

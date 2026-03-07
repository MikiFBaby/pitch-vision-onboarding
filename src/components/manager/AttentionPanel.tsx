import { AlertTriangle } from "lucide-react";

export interface AttentionFlag {
    type: "below_be" | "declining" | "qa_issue" | "decline_streak" | "new_hire_struggling";
    label: string;
    severity: "critical" | "warning" | "info";
}

export interface ActionAgent {
    name: string;
    sla_hr: number;
    transfers: number;
    hours_worked: number;
    be: number;
    flags: AttentionFlag[];
    priority: number;
}

interface AttentionPanelProps {
    agents: ActionAgent[];
    loading: boolean;
    onAgentClick?: (name: string) => void;
}

const SEVERITY_COLORS: Record<string, string> = {
    critical: "bg-red-500/20 text-red-400 border-red-500/30",
    warning: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    info: "bg-blue-500/15 text-blue-400 border-blue-500/25",
};

export default function AttentionPanel({ agents, loading, onAgentClick }: AttentionPanelProps) {
    const criticalCount = agents.filter((a) => a.flags.some((f) => f.severity === "critical")).length;

    return (
        <div className="glass-card p-6 rounded-2xl border-white/5">
            <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={14} className="text-amber-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-widest">Action Center</h3>
                {criticalCount > 0 && (
                    <span className="ml-auto text-[10px] font-bold bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
                        {criticalCount}
                    </span>
                )}
            </div>
            {loading ? (
                <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-14 bg-white/5 rounded animate-pulse" />
                    ))}
                </div>
            ) : agents.length === 0 ? (
                <div className="text-center py-8">
                    <span className="text-emerald-400 text-2xl">&#10003;</span>
                    <p className="text-white/50 text-sm mt-2">All agents performing well.</p>
                </div>
            ) : (
                <div className="space-y-2 overflow-y-auto max-h-[360px]">
                    {agents.map((a) => (
                        <div key={a.name} className="bg-red-500/5 border border-red-500/10 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                                <button
                                    onClick={() => onAgentClick?.(a.name)}
                                    className="text-white/90 text-xs font-medium truncate text-left cursor-pointer hover:text-cyan-400 transition-colors"
                                >
                                    {a.name}
                                </button>
                                <span className="text-red-400 text-xs font-mono font-bold tabular-nums">{a.sla_hr.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                {a.flags.map((f) => (
                                    <span
                                        key={f.type}
                                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[f.severity]}`}
                                    >
                                        {f.label}
                                    </span>
                                ))}
                            </div>
                            <div className="flex items-center justify-between mt-1">
                                <span className="text-white/40 text-[10px]">{a.transfers} SLAs in {a.hours_worked.toFixed(1)}h</span>
                                <span className="text-red-400/70 text-[10px] font-mono">{(a.sla_hr - a.be).toFixed(2)} vs B/E</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

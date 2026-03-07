import { useRef, useCallback } from "react";
import type { IntradayAgentRow } from "@/types/dialedin-types";
import { prefetchAgent } from "@/hooks/useAgentScoutingData";

export interface AnnotatedAgent extends IntradayAgentRow {
    be: number;
    aboveBE: boolean;
}

interface AgentYesterday {
    sla_hr: number;
    transfers: number;
}

interface TeamAgentTableProps {
    agents: AnnotatedAgent[];
    loading: boolean;
    agentYesterday?: Record<string, AgentYesterday>;
    onAgentClick?: (name: string) => void;
    hiddenGems?: Set<string>;
}

export default function TeamAgentTable({ agents, loading, agentYesterday, onAgentClick, hiddenGems }: TeamAgentTableProps) {
    const hasYesterday = agentYesterday && Object.keys(agentYesterday).length > 0;
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleHover = useCallback((name: string) => {
        hoverTimerRef.current = setTimeout(() => prefetchAgent(name), 200);
    }, []);

    const cancelHover = useCallback(() => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    }, []);

    return (
        <div className="lg:col-span-2 glass-card p-6 rounded-2xl border-white/5">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-widest">Team Agents</h3>
                <span className="text-[10px] text-white/40 font-mono">{agents.length} agents</span>
            </div>
            {loading ? (
                <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-10 bg-white/5 rounded animate-pulse" />
                    ))}
                </div>
            ) : agents.length === 0 ? (
                <p className="text-white/40 text-sm italic">No agents found for your team today.</p>
            ) : (
                <div className="overflow-y-auto max-h-[400px]">
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[#0d1117]">
                            <tr className="text-white/50 uppercase tracking-wider">
                                <th className="text-left py-2 pr-3">#</th>
                                <th className="text-left py-2 pr-3">Agent</th>
                                <th className="text-right py-2 pr-3">SLA/hr</th>
                                {hasYesterday && <th className="text-right py-2 pr-3">Yest</th>}
                                <th className="text-right py-2 pr-3">SLAs</th>
                                <th className="text-right py-2 pr-3">Hours</th>
                                <th className="text-right py-2">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {agents.map((a) => {
                                const yd = agentYesterday?.[a.name];
                                const ydDelta = yd ? a.sla_hr - yd.sla_hr : null;
                                return (
                                    <tr key={a.name} className="hover:bg-white/5 transition-colors">
                                        <td className="py-2 pr-3 tabular-nums">
                                            <span className="flex items-center gap-1">
                                                {a.rank === 1 && <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" title="1st" />}
                                                {a.rank === 2 && <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" title="2nd" />}
                                                {a.rank === 3 && <span className="w-2 h-2 rounded-full bg-amber-600 inline-block" title="3rd" />}
                                                <span className="text-white/40">{a.rank ?? "—"}</span>
                                            </span>
                                        </td>
                                        <td className="py-2 pr-3">
                                            <button
                                                onClick={() => onAgentClick?.(a.name)}
                                                onMouseEnter={() => handleHover(a.name)}
                                                onMouseLeave={cancelHover}
                                                className="text-white/90 font-medium text-left cursor-pointer hover:text-cyan-400 transition-colors"
                                            >
                                                {a.name}
                                            </button>
                                            {a.is_new_hire && (
                                                <span className="ml-1.5 text-[9px] font-bold bg-blue-500/20 text-blue-400 px-1 py-0.5 rounded">NEW</span>
                                            )}
                                            {hiddenGems?.has(a.name) && (
                                                <span className="ml-1 text-cyan-400 text-[10px]" title="High conversion — may benefit from more call volume">&#x25C6;</span>
                                            )}
                                        </td>
                                        <td className={`py-2 pr-3 text-right font-mono font-bold tabular-nums ${a.aboveBE ? "text-emerald-400" : "text-red-400"}`}>
                                            {a.sla_hr.toFixed(2)}
                                            {a.momentum === "up" && <span className="ml-0.5 text-emerald-400" title={`2h ago: ${a.sla_hr_2h_ago?.toFixed(2)}`}>↗</span>}
                                            {a.momentum === "down" && <span className="ml-0.5 text-red-400" title={`2h ago: ${a.sla_hr_2h_ago?.toFixed(2)}`}>↘</span>}
                                            {a.momentum === "steady" && <span className="ml-0.5 text-white/20">→</span>}
                                        </td>
                                        {hasYesterday && (
                                            <td className="py-2 pr-3 text-right font-mono tabular-nums">
                                                {yd ? (
                                                    <span className="text-white/50">
                                                        {yd.sla_hr.toFixed(2)}
                                                        {ydDelta !== null && (
                                                            <span className={`ml-1 text-[9px] ${ydDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                                                {ydDelta >= 0 ? "+" : ""}{ydDelta.toFixed(1)}
                                                            </span>
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span className="text-white/20">—</span>
                                                )}
                                            </td>
                                        )}
                                        <td className="py-2 pr-3 text-right text-white/70 tabular-nums">{a.transfers}</td>
                                        <td className="py-2 pr-3 text-right text-white/50 tabular-nums">{a.hours_worked.toFixed(1)}</td>
                                        <td className="py-2 text-right">
                                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${a.aboveBE ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                                                {a.aboveBE ? "OK" : "BELOW"}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

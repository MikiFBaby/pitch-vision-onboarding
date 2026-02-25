"use client";

import { useState, useMemo } from "react";
import type { RosterAgent, AgentTier } from "@/types/dialedin-types";

const TIER_BADGE: Record<AgentTier, { color: string; bg: string }> = {
  S: { color: "text-amber-400", bg: "bg-amber-500/15" },
  A: { color: "text-emerald-400", bg: "bg-emerald-500/15" },
  B: { color: "text-blue-400", bg: "bg-blue-500/15" },
  C: { color: "text-yellow-400", bg: "bg-yellow-500/15" },
  D: { color: "text-red-400", bg: "bg-red-500/15" },
};

type SortKey = "pnl_per_hour" | "pnl" | "est_revenue" | "avg_tph" | "total_transfers" | "total_hours" | "avg_conversion" | "roi_pct" | "qa_score";

const COLUMNS: { key: SortKey; label: string; fmt: (v: number | null) => string; align?: string }[] = [
  { key: "avg_tph", label: "TPH", fmt: (v) => (v ?? 0).toFixed(2) },
  { key: "total_transfers", label: "XFERS", fmt: (v) => (v ?? 0).toLocaleString() },
  { key: "total_hours", label: "HRS", fmt: (v) => (v ?? 0).toFixed(1) },
  { key: "est_revenue", label: "REVENUE", fmt: (v) => `$${((v ?? 0) / 1000).toFixed(1)}K` },
  { key: "pnl", label: "P&L", fmt: (v) => `${(v ?? 0) >= 0 ? "+" : ""}$${((v ?? 0) / 1000).toFixed(1)}K` },
  { key: "pnl_per_hour", label: "$/HR", fmt: (v) => `${(v ?? 0) >= 0 ? "+" : ""}$${(v ?? 0).toFixed(2)}` },
  { key: "roi_pct", label: "ROI%", fmt: (v) => `${(v ?? 0).toFixed(1)}%` },
  { key: "avg_conversion", label: "CONV%", fmt: (v) => `${(v ?? 0).toFixed(1)}%` },
  { key: "qa_score", label: "QA", fmt: (v) => v != null ? `${v}` : "—" },
];

function MiniSparkline({ data, trend }: { data: number[]; trend: string }) {
  if (data.length < 2) return <span className="text-white/20">—</span>;
  const max = Math.max(...data, 0.1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 48;
  const h = 14;
  const color = trend === "up" ? "#34d399" : trend === "down" ? "#f87171" : "#6b7280";
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg width={w} height={h}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

export function RosterLeaderboard({
  agents,
  loading,
  onAgentClick,
}: {
  agents: RosterAgent[];
  loading: boolean;
  onAgentClick?: (agent: RosterAgent) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("pnl_per_hour");
  const [sortAsc, setSortAsc] = useState(false);
  const [profitFilter, setProfitFilter] = useState<"all" | "profitable" | "unprofitable">("all");

  const filtered = useMemo(() => {
    let list = [...agents];
    if (profitFilter === "profitable") list = list.filter((a) => a.pnl > 0);
    if (profitFilter === "unprofitable") list = list.filter((a) => a.pnl <= 0);
    list.sort((a, b) => {
      const av = (a as any)[sortKey] ?? -Infinity;
      const bv = (b as any)[sortKey] ?? -Infinity;
      return sortAsc ? av - bv : bv - av;
    });
    return list;
  }, [agents, sortKey, sortAsc, profitFilter]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="bg-[#0c1018] border border-[#1a2332] rounded-lg p-4 animate-pulse">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-8 bg-white/5 rounded mb-1" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Filter Bar */}
      <div className="flex items-center gap-2 mb-3 text-[11px] font-mono">
        <span className="text-white/40 tracking-wider">FILTER</span>
        {(["all", "profitable", "unprofitable"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setProfitFilter(f)}
            className={`px-2.5 py-1 rounded transition-colors ${
              profitFilter === f
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "text-white/40 hover:text-white/70 hover:bg-white/5"
            }`}
          >
            {f.toUpperCase()}
          </button>
        ))}
        <span className="ml-auto text-white/30">{filtered.length} agents</span>
      </div>

      {/* Table */}
      <div className="bg-[#0c1018] border border-[#1a2332] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="border-b border-[#1a2332] text-white/40">
                <th className="text-left px-3 py-2 w-8">#</th>
                <th className="text-left px-2 py-2 w-8">TIER</th>
                <th className="text-left px-3 py-2 min-w-[160px]">AGENT</th>
                <th className="text-left px-2 py-2">TEAM</th>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="text-right px-2 py-2 cursor-pointer hover:text-white/70 select-none whitespace-nowrap"
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className="ml-0.5 text-amber-400">{sortAsc ? "▲" : "▼"}</span>
                    )}
                  </th>
                ))}
                <th className="px-2 py-2 w-12">TREND</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((agent, idx) => {
                const tb = TIER_BADGE[agent.tier];
                const pnlColor = agent.pnl >= 0 ? "text-emerald-400" : "text-red-400";
                return (
                  <tr
                    key={agent.agent_name}
                    className="border-b border-[#1a2332]/50 hover:bg-white/[0.02] cursor-pointer transition-colors"
                    onClick={() => onAgentClick?.(agent)}
                  >
                    <td className="px-3 py-2 text-white/30">{idx + 1}</td>
                    <td className="px-2 py-2">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${tb.color} ${tb.bg}`}>
                        {agent.tier}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-white font-semibold truncate max-w-[160px]">
                      {agent.agent_name}
                    </td>
                    <td className="px-2 py-2 text-white/50 truncate max-w-[120px]">
                      {agent.team || "—"}
                    </td>
                    {COLUMNS.map((col) => {
                      const val = (agent as any)[col.key];
                      const isPnl = col.key === "pnl" || col.key === "pnl_per_hour" || col.key === "roi_pct";
                      return (
                        <td
                          key={col.key}
                          className={`text-right px-2 py-2 tabular-nums whitespace-nowrap ${
                            isPnl ? pnlColor : "text-white/70"
                          }`}
                        >
                          {col.fmt(val)}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2">
                      <MiniSparkline data={agent.sparkline} trend={agent.trend} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

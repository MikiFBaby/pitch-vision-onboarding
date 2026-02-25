"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown } from "lucide-react";
import type { AgentTrend } from "@/types/dialedin-types";

interface ConsistencyPanelProps {
  trends: Record<string, AgentTrend>;
}

type SortKey = "score" | "avg" | "stddev" | "days";

export default function ConsistencyPanel({ trends }: ConsistencyPanelProps) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(false);

  const agents = useMemo(() => {
    const list = Object.entries(trends)
      .filter(([, t]) => t.days_worked >= 3)
      .map(([name, t]) => ({
        name,
        score: t.consistency_score,
        avg: t.avg_tph,
        stddev: t.stddev_tph,
        min: t.min_tph,
        max: t.max_tph,
        days: t.days_worked,
        trend: t.trend,
      }));

    return list.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [trends, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 50) return "text-amber-400";
    return "text-red-400";
  };

  const scoreBarWidth = (score: number) => `${Math.min(100, Math.max(0, score))}%`;

  const scoreBarColor = (score: number) => {
    if (score >= 80) return "bg-emerald-500/40";
    if (score >= 50) return "bg-amber-500/40";
    return "bg-red-500/40";
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="py-1 px-1 cursor-pointer select-none hover:text-white/40 text-right"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-0.5 justify-end">
        {label}
        <ArrowUpDown size={8} className={sortKey === field ? "text-amber-400" : "text-white/15"} />
      </span>
    </th>
  );

  return (
    <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a2332]">
        <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">Consistency Scores</span>
        <span className="text-[9px] text-white/20 font-mono">{agents.length} agents</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-[#0c1018] z-10">
            <tr className="text-[9px] uppercase tracking-wider text-white/25 font-mono border-b border-[#1a2332]">
              <th className="text-left py-1 px-2">Agent</th>
              <SortHeader label="Score" field="score" />
              <th className="text-center py-1 px-1 w-[80px]"></th>
              <SortHeader label="Avg" field="avg" />
              <SortHeader label="StdDev" field="stddev" />
              <th className="text-right py-1 px-1">Min</th>
              <th className="text-right py-1 px-1">Max</th>
              <SortHeader label="Days" field="days" />
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.name} className="border-b border-[#1a2332]/30 hover:bg-white/[0.03]">
                <td className="py-0.5 px-2 font-mono text-white/90 truncate max-w-[130px]">{a.name}</td>
                <td className={`py-0.5 px-1 text-right font-mono font-bold ${scoreColor(a.score)}`}>{a.score}</td>
                <td className="py-0.5 px-1">
                  <div className="h-1.5 w-full bg-white/5 overflow-hidden">
                    <div className={`h-full ${scoreBarColor(a.score)}`} style={{ width: scoreBarWidth(a.score) }} />
                  </div>
                </td>
                <td className="py-0.5 px-1 text-right font-mono text-white/70">{a.avg.toFixed(2)}</td>
                <td className="py-0.5 px-1 text-right font-mono text-white/40">{a.stddev.toFixed(2)}</td>
                <td className="py-0.5 px-1 text-right font-mono text-white/30">{a.min.toFixed(2)}</td>
                <td className="py-0.5 px-1 text-right font-mono text-white/30">{a.max.toFixed(2)}</td>
                <td className="py-0.5 px-1 text-right font-mono text-white/30">{a.days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import type { DowHeatmapEntry } from "@/types/dialedin-types";

export default function DowHeatmapPanel() {
  const [data, setData] = useState<DowHeatmapEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dialedin/dow-heatmap?days=60")
      .then((r) => r.json())
      .then((json) => setData(json.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
        <div className="px-3 py-1.5 border-b border-[#1a2332]">
          <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">Day-of-Week Heatmap</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="h-[100px] w-full animate-pulse bg-white/[0.02]" />
        </div>
      </div>
    );
  }

  // Reorder: Mon-Fri-Sat-Sun
  const ordered = [1, 2, 3, 4, 5, 6, 0].map((dow) => data.find((d) => d.dow === dow)).filter(Boolean) as DowHeatmapEntry[];

  const maxTph = Math.max(...ordered.map((d) => d.avg_tph), 0.01);
  const minTph = Math.min(...ordered.filter((d) => d.count > 0).map((d) => d.avg_tph), 0);

  const heatColor = (val: number) => {
    if (val === 0) return "bg-white/5";
    const ratio = (val - minTph) / (maxTph - minTph || 1);
    if (ratio >= 0.75) return "bg-emerald-500/40";
    if (ratio >= 0.5) return "bg-emerald-500/25";
    if (ratio >= 0.25) return "bg-amber-500/25";
    return "bg-red-500/25";
  };

  return (
    <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
      <div className="px-3 py-1.5 border-b border-[#1a2332]">
        <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">Day-of-Week Performance</span>
      </div>
      <div className="flex-1 px-3 py-2">
        {/* SLA/hr Row */}
        <div className="flex items-center gap-0.5 mb-1">
          <span className="text-[8px] text-white/20 font-mono w-12 shrink-0">SLA/hr</span>
          {ordered.map((d) => (
            <div
              key={d.dow}
              className={`flex-1 flex flex-col items-center justify-center py-2 ${heatColor(d.avg_tph)} ${d.dow === 0 || d.dow === 6 ? "opacity-50" : ""}`}
            >
              <span className="text-[9px] text-white/40 font-mono">{d.label}</span>
              <span className="text-sm font-mono font-bold text-white/90">{d.avg_tph.toFixed(2)}</span>
            </div>
          ))}
        </div>
        {/* SLA Row */}
        <div className="flex items-center gap-0.5 mb-1">
          <span className="text-[8px] text-white/20 font-mono w-12 shrink-0">Avg SLA</span>
          {ordered.map((d) => (
            <div key={d.dow} className={`flex-1 text-center py-1 ${d.dow === 0 || d.dow === 6 ? "opacity-50" : ""}`}>
              <span className="text-[10px] font-mono text-white/50">{Math.round(d.avg_transfers)}</span>
            </div>
          ))}
        </div>
        {/* Conv% Row */}
        <div className="flex items-center gap-0.5 mb-1">
          <span className="text-[8px] text-white/20 font-mono w-12 shrink-0">Conv%</span>
          {ordered.map((d) => (
            <div key={d.dow} className={`flex-1 text-center py-1 ${d.dow === 0 || d.dow === 6 ? "opacity-50" : ""}`}>
              <span className="text-[10px] font-mono text-white/40">{d.avg_conversion_rate.toFixed(1)}%</span>
            </div>
          ))}
        </div>
        {/* Sample size */}
        <div className="flex items-center gap-0.5">
          <span className="text-[8px] text-white/20 font-mono w-12 shrink-0">Days</span>
          {ordered.map((d) => (
            <div key={d.dow} className={`flex-1 text-center ${d.dow === 0 || d.dow === 6 ? "opacity-50" : ""}`}>
              <span className="text-[9px] font-mono text-white/20">{d.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

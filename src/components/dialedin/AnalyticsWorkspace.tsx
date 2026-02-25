"use client";

import { useState, useEffect } from "react";
import DowHeatmapPanel from "./DowHeatmapPanel";
import CampaignTrendsPanel from "./CampaignTrendsPanel";
import ForecastPanel from "./ForecastPanel";
import type { WoWComparison } from "@/types/dialedin-types";

interface AnalyticsWorkspaceProps {
  wow: WoWComparison | null;
}

function WoWDetailPanel({ wow }: { wow: WoWComparison | null }) {
  if (!wow) {
    return (
      <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
        <div className="px-3 py-1.5 border-b border-[#1a2332]">
          <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">Week-over-Week</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[10px] text-white/20 font-mono">Not enough data for comparison</span>
        </div>
      </div>
    );
  }

  const { current_week: cw, prev_week: pw, deltas } = wow;

  const metrics = [
    { label: "SLA", current: cw.transfers, prev: pw.transfers, delta: deltas.transfers },
    { label: "SLA/hr", current: cw.tph, prev: pw.tph, delta: deltas.tph, fmt: (v: number) => v.toFixed(2) },
    { label: "Conv%", current: cw.conversion_rate, prev: pw.conversion_rate, delta: deltas.conversion_rate, fmt: (v: number) => `${v.toFixed(1)}%` },
    { label: "Conn%", current: cw.connect_rate, prev: pw.connect_rate, delta: deltas.connect_rate, fmt: (v: number) => `${v.toFixed(1)}%` },
    { label: "Dials", current: cw.dials, prev: pw.dials, delta: deltas.dials },
    { label: "Hours", current: cw.hours, prev: pw.hours, delta: deltas.hours, fmt: (v: number) => v.toFixed(0) },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a2332]">
        <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">Week-over-Week</span>
        <span className="text-[9px] text-white/20 font-mono">
          {cw.start} — {cw.end} vs {pw.start} — {pw.end}
        </span>
      </div>
      <div className="flex-1 px-3 py-2">
        <div className="grid grid-cols-3 gap-2">
          {metrics.map((m) => {
            const fmt = m.fmt || ((v: number) => v.toLocaleString());
            return (
              <div key={m.label} className="bg-[#050a12] border border-[#1a2332] p-2">
                <div className="text-[8px] uppercase tracking-wider text-white/25 font-mono">{m.label}</div>
                <div className="flex items-end justify-between mt-1">
                  <div>
                    <div className="text-[8px] text-white/20 font-mono">Prev</div>
                    <div className="text-[11px] font-mono text-white/40">{fmt(m.prev)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[8px] text-white/20 font-mono">Current</div>
                    <div className="text-sm font-mono text-white/90 font-bold">{fmt(m.current)}</div>
                  </div>
                </div>
                <div className={`text-[10px] font-mono font-bold mt-0.5 text-right ${
                  m.delta.pct > 0 ? "text-emerald-400" : m.delta.pct < 0 ? "text-red-400" : "text-white/30"
                }`}>
                  {m.delta.pct > 0 ? "+" : ""}{m.delta.pct.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsWorkspace({ wow }: AnalyticsWorkspaceProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      {/* WoW + DOW Heatmap */}
      <div className="grid grid-cols-2 h-[220px] shrink-0">
        <WoWDetailPanel wow={wow} />
        <DowHeatmapPanel />
      </div>

      {/* Campaign Trends */}
      <div className="h-[250px] shrink-0">
        <CampaignTrendsPanel />
      </div>

      {/* Revenue Forecast */}
      <div className="h-[200px] shrink-0">
        <ForecastPanel />
      </div>
    </div>
  );
}

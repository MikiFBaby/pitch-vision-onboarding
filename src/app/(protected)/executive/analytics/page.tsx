"use client";

import { useState, useEffect, useCallback } from "react";
import { useExecutiveFilters } from "@/context/ExecutiveFilterContext";
import { PeriodLabel } from "../layout";
import DowHeatmapPanel from "@/components/dialedin/DowHeatmapPanel";
import CampaignTrendsPanel from "@/components/dialedin/CampaignTrendsPanel";
import ForecastPanel from "@/components/dialedin/ForecastPanel";
import type { WoWComparison } from "@/types/dialedin-types";

export default function AnalyticsPage() {
  const { startDate, endDate, dateRange } = useExecutiveFilters();
  const [wow, setWow] = useState<WoWComparison | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const period = dateRange === "custom" ? `${startDate},${endDate}` : dateRange;
      const res = await fetch(`/api/dialedin/wow?period=${period}`);
      if (res.ok) {
        const d = await res.json();
        setWow(d.data || d);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="font-mono">
      <PeriodLabel title="ANALYTICS" />
      <div className="p-4 space-y-4">
      {/* WoW Comparison */}
      <WoWPanel wow={wow} loading={loading} />

      {/* Analytics Panels Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#0c1018] border border-[#1a2332] rounded-lg overflow-hidden">
          <DowHeatmapPanel />
        </div>
        <div className="bg-[#0c1018] border border-[#1a2332] rounded-lg overflow-hidden">
          <CampaignTrendsPanel />
        </div>
      </div>

      <div className="bg-[#0c1018] border border-[#1a2332] rounded-lg overflow-hidden">
        <ForecastPanel />
      </div>
      </div>
    </div>
  );
}

function WoWPanel({ wow, loading }: { wow: WoWComparison | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="bg-[#0c1018] border border-[#1a2332] rounded-lg p-4">
        <div className="text-[10px] text-white/40 tracking-widest mb-3">WEEK-OVER-WEEK</div>
        <div className="text-white/20 text-xs text-center py-4">Loading...</div>
      </div>
    );
  }

  if (!wow || !wow.current_week || !wow.prev_week || !wow.deltas) {
    return (
      <div className="bg-[#0c1018] border border-[#1a2332] rounded-lg p-4">
        <div className="text-[10px] text-white/40 tracking-widest mb-3">WEEK-OVER-WEEK</div>
        <div className="text-white/20 text-xs text-center py-4">Not enough data for comparison</div>
      </div>
    );
  }

  const { current_week: cw, prev_week: pw, deltas } = wow;

  const metrics = [
    { label: "SLA", current: cw.transfers, prev: pw.transfers, delta: deltas.transfers?.pct ?? 0 },
    { label: "SLA/hr", current: cw.tph, prev: pw.tph, delta: deltas.tph?.pct ?? 0, format: (v: number) => v.toFixed(2) },
    { label: "Conv%", current: cw.conversion_rate, prev: pw.conversion_rate, delta: deltas.conversion_rate?.pct ?? 0, format: (v: number) => `${v.toFixed(1)}%` },
    { label: "Conn%", current: cw.connect_rate, prev: pw.connect_rate, delta: deltas.connect_rate?.pct ?? 0, format: (v: number) => `${v.toFixed(1)}%` },
    { label: "Dials", current: cw.dials, prev: pw.dials, delta: deltas.dials?.pct ?? 0 },
    { label: "Hours", current: cw.hours, prev: pw.hours, delta: deltas.hours?.pct ?? 0, format: (v: number) => v.toFixed(0) },
  ];

  return (
    <div className="bg-[#0c1018] border border-[#1a2332] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] text-white/40 tracking-widest">WEEK-OVER-WEEK</div>
        <div className="text-[10px] text-white/20">
          {cw.start} — {cw.end} vs {pw.start} — {pw.end}
        </div>
      </div>

      <div className="grid grid-cols-6 gap-3">
        {metrics.map((m) => {
          const f = m.format || ((v: number) => v.toLocaleString());
          const isPositive = m.delta > 0;
          return (
            <div key={m.label} className="bg-[#050a12] border border-[#1a2332] rounded p-3">
              <div className="text-[9px] text-white/30 tracking-widest mb-1">{m.label}</div>
              <div className="text-sm font-bold text-white tabular-nums">{f(m.current)}</div>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[10px] text-white/30 tabular-nums">{f(m.prev)}</span>
                <span
                  className={`text-[10px] tabular-nums ${
                    isPositive ? "text-emerald-400" : m.delta < 0 ? "text-red-400" : "text-white/30"
                  }`}
                >
                  {isPositive ? "+" : ""}{m.delta.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

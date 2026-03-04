"use client";

import { ArrowUp, ArrowDown } from "lucide-react";
import type { DailyKPIs, WoWComparison, LiveMetrics } from "@/types/dialedin-types";

interface KPITickerProps {
  kpis: DailyKPIs | null;
  loading: boolean;
  wow?: WoWComparison | null;
  liveMetrics?: LiveMetrics | null;
}

interface TickerItem {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  wowPct?: number | null;
  live?: boolean;
}

export default function KPITicker({ kpis, loading, wow, liveMetrics }: KPITickerProps) {
  if (loading || !kpis) {
    return (
      <div className="flex items-center h-14 px-3 border-b border-[#1a2332] bg-[#0c1018]">
        <div className="flex-1 h-6 bg-white/[0.03] animate-pulse" />
      </div>
    );
  }

  const items: TickerItem[] = [
    { label: "AGENTS", value: kpis.total_agents.toLocaleString() },
    {
      label: "DIALS",
      value: kpis.total_dials.toLocaleString(),
      wowPct: wow?.deltas.dials.pct ?? null,
    },
    {
      label: "CONNECTS",
      value: kpis.total_connects.toLocaleString(),
    },
    {
      label: "SLA",
      value: kpis.total_transfers.toLocaleString(),
      delta: kpis.delta_transfers,
      deltaLabel: "SLA",
      wowPct: wow?.deltas.transfers.pct ?? null,
    },
    {
      label: "SLA/HR",
      value: kpis.transfers_per_hour.toFixed(2),
      delta: kpis.delta_tph,
      wowPct: wow?.deltas.tph.pct ?? null,
    },
    {
      label: "CONV %",
      value: `${kpis.conversion_rate}%`,
      wowPct: wow?.deltas.conversion_rate.pct ?? null,
    },
    { label: "MAN HRS", value: kpis.total_man_hours.toFixed(1),
      wowPct: wow?.deltas.hours.pct ?? null,
    },
    { label: "PAID HRS", value: (kpis.total_paid_hours ?? kpis.total_man_hours).toFixed(1) },
    {
      label: "CONN %",
      value: `${kpis.connect_rate}%`,
      wowPct: wow?.deltas.connect_rate.pct ?? null,
    },
  ];

  // Append live metrics when available
  if (liveMetrics?.last_event_at) {
    items.push(
      { label: "LIVE SLA", value: (liveMetrics.total_transfers || 0).toLocaleString(), live: true },
      { label: "ACTIVE", value: (liveMetrics.agents_active || 0).toLocaleString(), live: true },
      { label: "ON BREAK", value: (liveMetrics.agents_on_break || 0).toLocaleString(), live: true },
    );
  }

  return (
    <div className="flex items-center h-14 px-1 border-b border-[#1a2332] bg-[#0c1018]">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={`flex-1 flex flex-col items-center justify-center px-2 ${
            i < items.length - 1 ? "border-r border-[#1a2332]" : ""
          } ${item.live ? "border-l border-emerald-500/20" : ""}`}
        >
          <span className="text-[9px] uppercase tracking-wider font-mono flex items-center gap-1">
            {item.live && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
            <span className={item.live ? "text-emerald-400/60" : "text-white/30"}>
              {item.label}
            </span>
          </span>
          <div className="flex items-center gap-1">
            <span className={`text-sm font-mono font-bold ${item.live ? "text-emerald-400/90" : "text-white/90"}`}>
              {item.value}
            </span>
            {item.delta != null && item.delta !== 0 && (
              <span
                className={`flex items-center text-[10px] font-mono ${
                  item.delta > 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {item.delta > 0 ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
                {Math.abs(item.delta).toFixed(item.deltaLabel ? 0 : 2)}
              </span>
            )}
          </div>
          {item.wowPct != null && item.wowPct !== 0 && (
            <span
              className={`text-[8px] font-mono ${
                item.wowPct > 0 ? "text-emerald-400/60" : "text-red-400/60"
              }`}
            >
              WoW {item.wowPct > 0 ? "+" : ""}{item.wowPct.toFixed(1)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

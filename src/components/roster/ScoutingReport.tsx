"use client";

import { useMemo } from "react";
import type { RosterAgent } from "@/types/dialedin-types";

function fmt(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

interface RampBucket {
  label: string;
  min: number;
  max: number;
  agents: RosterAgent[];
}

export function ScoutingReport({
  agents,
  loading,
  onAgentClick,
}: {
  agents: RosterAgent[];
  loading: boolean;
  onAgentClick?: (agent: RosterAgent) => void;
}) {
  const { buckets, avgRamp } = useMemo(() => {
    // Only agents with a hire date
    const withHire = agents.filter((a) => a.hire_date && a.days_active > 0);

    const bucketDefs: { label: string; min: number; max: number }[] = [
      { label: "0-30 Days", min: 0, max: 30 },
      { label: "31-60 Days", min: 31, max: 60 },
      { label: "61-90 Days", min: 61, max: 90 },
      { label: "90+ Days", min: 91, max: Infinity },
    ];

    const buckets: RampBucket[] = bucketDefs.map((d) => ({
      ...d,
      agents: withHire
        .filter((a) => a.days_active >= d.min && a.days_active <= d.max)
        .sort((a, b) => b.avg_tph - a.avg_tph),
    }));

    // Avg ramp curve by 10-day buckets
    const rampMap = new Map<number, { tphSum: number; count: number }>();
    for (const a of withHire) {
      const bucket10 = Math.floor(a.days_active / 10) * 10;
      const existing = rampMap.get(bucket10) || { tphSum: 0, count: 0 };
      existing.tphSum += a.avg_tph;
      existing.count++;
      rampMap.set(bucket10, existing);
    }

    const avgRamp = Array.from(rampMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([day, { tphSum, count }]) => ({
        day,
        avgTph: tphSum / count,
        count,
      }));

    return { buckets, avgRamp };
  }, [agents]);

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 bg-white/5 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 font-mono">
      {/* Ramp Curve Visualization */}
      {avgRamp.length > 0 && (
        <div className="bg-[#0c1018] border border-[#1a2332] rounded-lg p-4">
          <div className="text-[11px] text-white/40 tracking-widest mb-3">AVERAGE RAMP CURVE (SLA/hr BY TENURE)</div>
          <div className="flex items-end gap-1 h-24">
            {avgRamp.map((point) => {
              const maxTph = Math.max(...avgRamp.map((p) => p.avgTph), 1);
              const height = (point.avgTph / maxTph) * 100;
              const isGood = point.avgTph >= 3.0;
              return (
                <div key={point.day} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[8px] text-white/50">{point.avgTph.toFixed(1)}</span>
                  <div
                    className={`w-full rounded-t ${isGood ? "bg-emerald-500/40" : "bg-amber-500/40"}`}
                    style={{ height: `${height}%`, minHeight: "4px" }}
                  />
                  <span className="text-[8px] text-white/30">{point.day}d</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tenure Buckets */}
      {buckets.map((bucket) => {
        if (bucket.agents.length === 0) return null;
        const avgTph = bucket.agents.reduce((s, a) => s + a.avg_tph, 0) / bucket.agents.length;
        const totalPnl = bucket.agents.reduce((s, a) => s + a.pnl, 0);
        const pnlColor = totalPnl >= 0 ? "text-emerald-400" : "text-red-400";

        return (
          <div key={bucket.label} className="bg-[#0c1018] border border-[#1a2332] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-white/40 tracking-widest">{bucket.label.toUpperCase()}</span>
                <span className="text-[10px] text-white/30">{bucket.agents.length} agents</span>
              </div>
              <div className="flex items-center gap-4 text-[10px]">
                <span className="text-white/40">Avg SLA/hr: <span className="text-white">{avgTph.toFixed(2)}</span></span>
                <span className="text-white/40">
                  Net P&L: <span className={pnlColor}>{totalPnl >= 0 ? "+" : ""}{fmt(totalPnl)}</span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {bucket.agents.slice(0, 12).map((agent) => {
                const aPnl = agent.pnl >= 0 ? "text-emerald-400" : "text-red-400";
                const rampStatus =
                  agent.avg_tph >= 4.0 ? { label: "FAST", color: "text-emerald-400 bg-emerald-500/10" }
                  : agent.avg_tph >= 2.5 ? { label: "ON TRACK", color: "text-blue-400 bg-blue-500/10" }
                  : agent.avg_tph >= 1.5 ? { label: "SLOW", color: "text-amber-400 bg-amber-500/10" }
                  : { label: "AT RISK", color: "text-red-400 bg-red-500/10" };

                return (
                  <div
                    key={agent.agent_name}
                    onClick={() => onAgentClick?.(agent)}
                    className="bg-white/[0.02] border border-white/5 rounded p-2 text-[10px] cursor-pointer hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white font-semibold truncate">{agent.agent_name}</span>
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${rampStatus.color}`}>
                        {rampStatus.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-white/50">
                      <span>{agent.days_active}d tenure</span>
                      <span>SLA/hr: <span className="text-white">{agent.avg_tph.toFixed(2)}</span></span>
                      <span>P&L: <span className={aPnl}>{agent.pnl >= 0 ? "+" : ""}{fmt(agent.pnl)}</span></span>
                    </div>
                  </div>
                );
              })}
            </div>

            {bucket.agents.length > 12 && (
              <div className="text-[10px] text-white/30 mt-2 text-center">
                +{bucket.agents.length - 12} more agents
              </div>
            )}
          </div>
        );
      })}

      {buckets.every((b) => b.agents.length === 0) && (
        <div className="bg-[#0c1018] border border-[#1a2332] rounded-lg p-8 text-center">
          <div className="text-white/30 text-[12px]">No hire date data available for scouting report.</div>
          <div className="text-white/20 text-[10px] mt-1">Populate `hired_at` in employee_directory to enable ramp analysis.</div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, TrendingDown } from "lucide-react";
import type { DeclineAlert } from "@/types/dialedin-types";

interface DeclineAlertsPanelProps {
  onSelectAgent?: (name: string) => void;
}

function MiniSparkline({ data, className }: { data: number[]; className?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 0.01);
  const min = Math.min(...data);
  const h = 20;
  const w = 50;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / (max - min || 1)) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className={className}>
      <polyline points={points} fill="none" stroke="#ef4444" strokeWidth="1.5" />
    </svg>
  );
}

export default function DeclineAlertsPanel({ onSelectAgent }: DeclineAlertsPanelProps) {
  const [alerts, setAlerts] = useState<DeclineAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dialedin/decline-alerts?days=7&min_consecutive=3")
      .then((r) => r.json())
      .then((json) => setAlerts(json.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
        <div className="px-3 py-1.5 border-b border-[#1a2332]">
          <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">Decline Detection</span>
        </div>
        <div className="flex-1 animate-pulse bg-white/[0.02]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a2332]">
        <div className="flex items-center gap-1.5">
          <TrendingDown size={11} className="text-red-400" />
          <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">Decline Detection</span>
        </div>
        <span className="text-[9px] text-white/20 font-mono">{alerts.length} flagged</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[10px] text-white/20 font-mono">No declining agents detected</span>
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-[#0c1018] z-10">
              <tr className="text-[9px] uppercase tracking-wider text-white/25 font-mono border-b border-[#1a2332]">
                <th className="text-left py-1 px-2"></th>
                <th className="text-left py-1 px-1">Agent</th>
                <th className="text-right py-1 px-1">Days</th>
                <th className="text-right py-1 px-1">Start</th>
                <th className="text-right py-1 px-1">End</th>
                <th className="text-right py-1 px-1">Drop%</th>
                <th className="text-center py-1 px-2">Trend</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr
                  key={a.agent_name}
                  onClick={() => onSelectAgent?.(a.agent_name)}
                  className="border-b border-[#1a2332]/30 hover:bg-white/[0.03] cursor-pointer"
                >
                  <td className="py-0.5 px-2">
                    <AlertTriangle
                      size={10}
                      className={a.severity === "critical" ? "text-red-400" : "text-amber-400"}
                    />
                  </td>
                  <td className="py-0.5 px-1 font-mono text-white/90 truncate max-w-[130px]">{a.agent_name}</td>
                  <td className="py-0.5 px-1 text-right font-mono font-bold text-red-400">{a.consecutive_decline_days}</td>
                  <td className="py-0.5 px-1 text-right font-mono text-white/50">{a.tph_start.toFixed(2)}</td>
                  <td className="py-0.5 px-1 text-right font-mono text-white/50">{a.tph_end.toFixed(2)}</td>
                  <td className="py-0.5 px-1 text-right font-mono text-red-400">-{a.drop_pct.toFixed(0)}%</td>
                  <td className="py-0.5 px-2 flex justify-center">
                    <MiniSparkline data={a.sparkline} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

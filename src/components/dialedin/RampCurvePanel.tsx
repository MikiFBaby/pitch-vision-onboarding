"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { RampCurveData } from "@/types/dialedin-types";

export default function RampCurvePanel() {
  const [data, setData] = useState<RampCurveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dialedin/ramp-curve?days_since_hire=90")
      .then((r) => r.json())
      .then((json) => setData(json.data || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(() => {
    if (!data) return [];
    // Build chart from avg_ramp
    return data.avg_ramp.map((p) => ({
      day: p.day,
      avg: p.avg_tph,
      count: p.agent_count,
    }));
  }, [data]);

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
        <div className="px-3 py-1.5 border-b border-[#1a2332]">
          <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">New Hire Ramp</span>
        </div>
        <div className="flex-1 animate-pulse bg-white/[0.02]" />
      </div>
    );
  }

  if (!data || data.agents.length === 0) {
    return (
      <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
        <div className="px-3 py-1.5 border-b border-[#1a2332]">
          <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">New Hire Ramp</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[10px] text-white/20 font-mono">No new hires with performance data</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a2332]">
        <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">New Hire Ramp Curve</span>
        <span className="text-[9px] text-white/20 font-mono">{data.agents.length} new hires</span>
      </div>
      <div className="flex flex-1 min-h-0">
        {/* Chart */}
        <div className="flex-1 px-1 py-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="day"
                tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9, fontFamily: "monospace" }}
                axisLine={{ stroke: "#1a2332" }}
                tickLine={false}
                label={{ value: "Days Since Hire", position: "bottom", fill: "rgba(255,255,255,0.15)", fontSize: 8, fontFamily: "monospace" }}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9, fontFamily: "monospace" }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0c1018",
                  border: "1px solid #1a2332",
                  color: "white",
                  fontSize: 11,
                  fontFamily: "monospace",
                }}
                formatter={(value: number) => [value.toFixed(2), "Avg SLA/hr"]}
                labelFormatter={(day) => `Day ${day}`}
              />
              <ReferenceLine x={30} stroke="#1a2332" strokeDasharray="3 3" label={{ value: "30d", fill: "#ffffff20", fontSize: 8 }} />
              <ReferenceLine x={60} stroke="#1a2332" strokeDasharray="3 3" label={{ value: "60d", fill: "#ffffff20", fontSize: 8 }} />
              <ReferenceLine x={90} stroke="#1a2332" strokeDasharray="3 3" label={{ value: "90d", fill: "#ffffff20", fontSize: 8 }} />
              <Line type="monotone" dataKey="avg" stroke="#f59e0b" strokeWidth={2.5} dot={false} name="Avg SLA/hr" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {/* Agent list sidebar */}
        <div className="w-[140px] border-l border-[#1a2332] overflow-y-auto">
          <div className="px-2 py-1 border-b border-[#1a2332]">
            <span className="text-[8px] uppercase text-white/20 font-mono">New Hires</span>
          </div>
          {data.agents.map((a) => (
            <div
              key={a.name}
              className="px-2 py-0.5 border-b border-[#1a2332]/30 hover:bg-white/[0.03] cursor-default"
              onMouseEnter={() => setHoveredAgent(a.name)}
              onMouseLeave={() => setHoveredAgent(null)}
            >
              <div className="text-[10px] font-mono text-white/70 truncate">{a.name}</div>
              <div className="flex justify-between">
                <span className="text-[8px] font-mono text-white/25">Day {a.days_since_hire}</span>
                <span className="text-[9px] font-mono text-amber-400">{a.current_tph.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

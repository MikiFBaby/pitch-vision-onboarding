"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
} from "recharts";
import type { AgentPerformance, TPHDistribution } from "@/types/dialedin-types";

interface TPHDistributionPanelProps {
  agents: AgentPerformance[];
  distribution: TPHDistribution | null;
}

const BUCKETS = [
  { label: "0-0.5", min: 0, max: 0.5 },
  { label: "0.5-1", min: 0.5, max: 1 },
  { label: "1-1.5", min: 1, max: 1.5 },
  { label: "1.5-2", min: 1.5, max: 2 },
  { label: "2-2.5", min: 2, max: 2.5 },
  { label: "2.5-3", min: 2.5, max: 3 },
  { label: "3-3.5", min: 3, max: 3.5 },
  { label: "3.5-4", min: 3.5, max: 4 },
  { label: "4-4.5", min: 4, max: 4.5 },
  { label: "4.5+", min: 4.5, max: Infinity },
];

export default function TPHDistributionPanel({
  agents,
  distribution,
}: TPHDistributionPanelProps) {
  const chartData = useMemo(() => {
    const counts = new Array(BUCKETS.length).fill(0);
    for (const a of agents) {
      if (a.hours_worked < 2) continue; // skip short-shift agents
      for (let i = 0; i < BUCKETS.length; i++) {
        if (a.tph >= BUCKETS[i].min && a.tph < BUCKETS[i].max) {
          counts[i]++;
          break;
        }
        if (i === BUCKETS.length - 1 && a.tph >= BUCKETS[i].min) {
          counts[i]++;
        }
      }
    }
    return BUCKETS.map((b, i) => ({
      bucket: b.label,
      count: counts[i],
    }));
  }, [agents]);

  return (
    <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a2332]">
        <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">
          SLA/hr Distribution
        </span>
        {distribution && (
          <span className="text-[9px] text-white/25 font-mono">
            P50: {distribution.p50.toFixed(2)} | AVG: {distribution.mean.toFixed(2)}
          </span>
        )}
      </div>
      <div className="flex-1 px-1 py-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="bucket"
              tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9, fontFamily: "monospace" }}
              axisLine={{ stroke: "#1a2332" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9, fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
              width={25}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0c1018",
                border: "1px solid #1a2332",
                color: "white",
                fontSize: 11,
                fontFamily: "monospace",
              }}
              formatter={(value: number) => [`${value} agents`, "Count"]}
            />
            {distribution && (
              <>
                <ReferenceLine
                  x="1-1.5"
                  stroke="#f59e0b"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  label={{ value: "P50", fill: "#f59e0b", fontSize: 8, position: "top" }}
                />
              </>
            )}
            <Bar
              dataKey="count"
              fill="#f59e0b"
              fillOpacity={0.6}
              radius={[1, 1, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

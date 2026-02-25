"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import type { TimeSeriesBucket, TimeGranularity } from "@/types/dialedin-types";

interface TimeSeriesViewProps {
  data: TimeSeriesBucket[];
  granularity: TimeGranularity;
  onGranularityChange: (g: TimeGranularity) => void;
}

const GRANULARITIES: { key: TimeGranularity; label: string }[] = [
  { key: "daily", label: "DAILY" },
  { key: "weekly", label: "WEEKLY" },
  { key: "monthly", label: "MONTHLY" },
];

export default function TimeSeriesView({ data, granularity, onGranularityChange }: TimeSeriesViewProps) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      label: d.bucket_label,
      sla: d.sla_transfers,
      billable: d.billable_calls,
      estimated: d.estimated_revenue,
      actual: d.actual_revenue > 0 ? d.actual_revenue : null,
      cost: d.cost,
      profit: d.profit,
      rev_hr: d.rev_per_hour,
    }));
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-[10px] text-white/20 font-mono">No time series data available</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      {/* Granularity Toggle */}
      <div className="shrink-0 px-3 py-1.5 border-b border-[#1a2332] bg-[#0c1018] flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">
          Time Series
        </span>
        <div className="flex border border-[#1a2332] overflow-hidden">
          {GRANULARITIES.map((g) => (
            <button
              key={g.key}
              onClick={() => onGranularityChange(g.key)}
              className={`px-2 py-0.5 text-[9px] font-mono uppercase transition-colors ${
                granularity === g.key
                  ? "bg-amber-400/15 text-amber-400"
                  : "text-white/30 hover:text-white/50 bg-[#050a12]"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-[260px] shrink-0 bg-[#0c1018] border-b border-[#1a2332] px-1 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9, fontFamily: "monospace" }}
              axisLine={{ stroke: "#1a2332" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9, fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: "rgba(255,255,255,0.15)", fontSize: 9, fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
              width={50}
              tickFormatter={(v: number) => `$${v}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0c1018",
                border: "1px solid #1a2332",
                color: "white",
                fontSize: 11,
                fontFamily: "monospace",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 9, fontFamily: "monospace" }}
              iconSize={8}
            />
            <Bar yAxisId="left" dataKey="sla" fill="#3b82f6" opacity={0.6} name="SLA Transfers" />
            <Bar yAxisId="left" dataKey="billable" fill="#10b981" opacity={0.6} name="Billable Calls" />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="estimated"
              stroke="#10b981"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={false}
              name="Est. Revenue"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="actual"
              stroke="#34d399"
              strokeWidth={2}
              dot={false}
              name="Act. Revenue"
              connectNulls={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cost"
              stroke="#ef4444"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={false}
              name="Cost"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 bg-[#0c1018]">
        <div className="overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-[#0c1018] z-10">
              <tr className="text-[9px] uppercase tracking-wider text-white/25 font-mono border-b border-[#1a2332]">
                <th className="text-left py-1 px-2">Period</th>
                <th className="text-right py-1 px-1">SLA</th>
                <th className="text-right py-1 px-1">Billable</th>
                <th className="text-right py-1 px-1">Est. Rev</th>
                <th className="text-right py-1 px-1">Act. Rev</th>
                <th className="text-right py-1 px-1">Cost</th>
                <th className="text-right py-1 px-1">P&L</th>
                <th className="text-right py-1 px-1">Hours</th>
                <th className="text-right py-1 px-2">Rev/Hr</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => {
                const profit = d.profit;
                return (
                  <tr key={d.bucket_start} className="border-b border-[#1a2332]/30 hover:bg-white/[0.03]">
                    <td className="py-0.5 px-2 font-mono text-white/90">{d.bucket_label}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-blue-400">{d.sla_transfers.toLocaleString()}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-emerald-400">{d.billable_calls.toLocaleString()}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-white/50">${d.estimated_revenue.toLocaleString()}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-emerald-400">
                      {d.actual_revenue > 0 ? `$${d.actual_revenue.toLocaleString()}` : "—"}
                    </td>
                    <td className="py-0.5 px-1 text-right font-mono text-white/40">${d.cost.toLocaleString()}</td>
                    <td className={`py-0.5 px-1 text-right font-mono font-bold ${profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      ${profit.toLocaleString()}
                    </td>
                    <td className="py-0.5 px-1 text-right font-mono text-white/40">{d.hours}</td>
                    <td className={`py-0.5 px-2 text-right font-mono ${d.rev_per_hour >= 10 ? "text-emerald-400" : "text-white/50"}`}>
                      ${d.rev_per_hour.toFixed(1)}
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

"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { DailyKPIs } from "@/types/dialedin-types";

interface TrendLineChartProps {
  data: DailyKPIs[];
  loading?: boolean;
}

export default function TrendLineChart({ data, loading }: TrendLineChartProps) {
  const chartData = [...data]
    .sort((a, b) => a.report_date.localeCompare(b.report_date))
    .map((d) => ({
      date: d.report_date.slice(5),
      tph: d.transfers_per_hour,
      transfers: d.total_transfers,
      convRate: d.conversion_rate,
    }));

  if (loading) {
    return (
      <div className="h-[160px] bg-[#0c1018] border border-[#1a2332] animate-pulse" />
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="h-[160px] bg-[#0c1018] border border-[#1a2332] flex items-center justify-center">
        <span className="text-[10px] text-white/20 font-mono">NO TREND DATA</span>
      </div>
    );
  }

  return (
    <div className="bg-[#0c1018] border border-[#1a2332]">
      <div className="flex items-center justify-between px-3 py-1 border-b border-[#1a2332]">
        <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">
          Trend
        </span>
        <div className="flex gap-3">
          <span className="flex items-center gap-1 text-[8px] text-white/30 font-mono">
            <span className="w-2 h-0.5 bg-amber-400 inline-block" /> SLA/hr
          </span>
          <span className="flex items-center gap-1 text-[8px] text-white/30 font-mono">
            <span className="w-2 h-0.5 bg-cyan-400 inline-block" /> SLA
          </span>
          <span className="flex items-center gap-1 text-[8px] text-white/30 font-mono">
            <span className="w-2 h-0.5 bg-fuchsia-400 inline-block" /> Conv%
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
          <XAxis
            dataKey="date"
            tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9, fontFamily: "monospace" }}
            axisLine={{ stroke: "#1a2332" }}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9, fontFamily: "monospace" }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9, fontFamily: "monospace" }}
            axisLine={false}
            tickLine={false}
            width={35}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0c1018",
              border: "1px solid #1a2332",
              color: "white",
              fontSize: 10,
              fontFamily: "monospace",
            }}
          />
          <Line yAxisId="left" type="monotone" dataKey="tph" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="SLA/hr" />
          <Line yAxisId="right" type="monotone" dataKey="transfers" stroke="#22d3ee" strokeWidth={1.5} dot={false} name="SLA" />
          <Line yAxisId="left" type="monotone" dataKey="convRate" stroke="#d946ef" strokeWidth={1} dot={false} name="Conv%" strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

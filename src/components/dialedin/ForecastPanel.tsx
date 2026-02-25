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
import type { ForecastResult } from "@/types/dialedin-types";

export default function ForecastPanel() {
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dialedin/forecast?days=30&forecast_days=30")
      .then((r) => r.json())
      .then((json) => setForecast(json.data || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(() => {
    if (!forecast) return [];
    const historical = forecast.historical.map((h) => ({
      date: h.date.slice(5),
      actual: h.revenue,
      predicted: null as number | null,
    }));
    const projected = forecast.forecast.map((f) => ({
      date: f.date.slice(5),
      actual: null as number | null,
      predicted: f.predicted_revenue,
    }));
    return [...historical, ...projected];
  }, [forecast]);

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
        <div className="px-3 py-1.5 border-b border-[#1a2332]">
          <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">Revenue Forecast</span>
        </div>
        <div className="flex-1 animate-pulse bg-white/[0.02]" />
      </div>
    );
  }

  if (!forecast) {
    return (
      <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
        <div className="px-3 py-1.5 border-b border-[#1a2332]">
          <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">Revenue Forecast</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[10px] text-white/20 font-mono">Not enough data for forecast</span>
        </div>
      </div>
    );
  }

  const { model } = forecast;
  const trendColor = model.trend === "growing" ? "text-emerald-400" : model.trend === "declining" ? "text-red-400" : "text-white/50";

  return (
    <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a2332]">
        <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">Revenue Forecast</span>
        <div className="flex items-center gap-3">
          <span className="text-[9px] text-white/25 font-mono">
            Avg: ${model.daily_avg.toFixed(0)}/day
          </span>
          <span className={`text-[9px] font-mono font-bold ${trendColor}`}>
            {model.trend.toUpperCase()} (R²={model.r_squared.toFixed(2)})
          </span>
          <span className="text-[9px] text-white/25 font-mono">
            Proj: ${model.projected_monthly.toLocaleString()}/mo
          </span>
        </div>
      </div>
      <div className="flex-1 px-1 py-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 9, fontFamily: "monospace" }}
              axisLine={{ stroke: "#1a2332" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9, fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
              width={40}
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
              formatter={(value: number, name: string) => [`$${value?.toFixed(0) || 0}`, name === "actual" ? "Actual" : "Forecast"]}
            />
            <Line type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={2} dot={false} name="Actual" />
            <Line type="monotone" dataKey="predicted" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Forecast" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

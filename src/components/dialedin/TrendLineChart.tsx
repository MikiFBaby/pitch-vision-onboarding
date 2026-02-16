"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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
      date: d.report_date.slice(5), // MM-DD
      tph: d.transfers_per_hour,
      connectRate: d.connect_rate,
      convRate: d.conversion_rate,
      transfers: d.total_transfers,
    }));

  if (loading) {
    return (
      <Card className="bg-white/[0.03] border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-lg">Performance Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] animate-pulse rounded-lg bg-white/[0.02]" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/[0.03] border-white/10">
      <CardHeader>
        <CardTitle className="text-white text-lg">Performance Trend</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-white/30 text-sm">
            No trend data yet — upload reports from multiple days
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradTph" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradTransfers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
                axisLine={{ stroke: "rgba(255,255,255,0.05)" }}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(0,0,0,0.9)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "white",
                  fontSize: 12,
                }}
              />
              <Legend
                wrapperStyle={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="tph"
                name="TPH"
                stroke="#6366f1"
                fill="url(#gradTph)"
                strokeWidth={2}
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="transfers"
                name="Transfers"
                stroke="#10b981"
                fill="url(#gradTransfers)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

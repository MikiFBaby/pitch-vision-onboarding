"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { SkillSummary } from "@/types/dialedin-types";

interface SkillBreakdownChartProps {
  skills: SkillSummary[];
  loading?: boolean;
}

export default function SkillBreakdownChart({ skills, loading }: SkillBreakdownChartProps) {
  const data = skills.slice(0, 10).map((s) => ({
    name: s.skill.length > 20 ? s.skill.slice(0, 18) + "..." : s.skill,
    fullName: s.skill,
    transfers: s.total_transfers,
    tph: s.avg_tph,
    agents: s.agent_count,
    hours: s.total_man_hours,
  }));

  if (loading) {
    return (
      <Card className="bg-white/[0.03] border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-lg">Skill Breakdown</CardTitle>
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
        <CardTitle className="text-white text-lg">Skill Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-white/30 text-sm">
            No skill data — upload a ProductionReport
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="name"
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                axisLine={{ stroke: "rgba(255,255,255,0.05)" }}
                tickLine={false}
                angle={-20}
                textAnchor="end"
                height={60}
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
                labelFormatter={(_, payload) => {
                  if (payload && payload.length > 0) {
                    return payload[0]?.payload?.fullName || "";
                  }
                  return "";
                }}
              />
              <Legend
                wrapperStyle={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}
              />
              <Bar
                yAxisId="left"
                dataKey="transfers"
                name="Transfers"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="right"
                dataKey="tph"
                name="TPH"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

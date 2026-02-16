"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";

interface DispositionChartProps {
  dispositions: Record<string, number>;
  loading?: boolean;
}

const COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
  "#a855f7", "#e11d48", "#0ea5e9", "#22c55e", "#eab308",
  "#d946ef", "#64748b",
];

const DISPLAY_NAMES: Record<string, string> = {
  transfer: "Transfer",
  not_interested: "Not Interested",
  dead_air: "Dead Air",
  dnc: "DNC",
  wrong_number: "Wrong Number",
  ans_machine: "Voicemail",
  hung_up_transfer: "Hung Up",
  call_back: "Callback",
  dq___dissqualified: "DQ",
  no_english: "No English",
  robo: "Robo",
  fishing: "Fishing",
  booking: "Booking",
  dq_medicare: "DQ/Medicare",
  no_agent: "No Agent",
  conference_ending: "Conf. End",
  purity_inbound: "Inbound",
};

export default function DispositionChart({ dispositions, loading }: DispositionChartProps) {
  const data = Object.entries(dispositions)
    .filter(([, val]) => val > 0)
    .map(([key, val]) => ({
      name: DISPLAY_NAMES[key] || key.replace(/_/g, " "),
      value: val,
    }))
    .sort((a, b) => b.value - a.value);

  if (loading) {
    return (
      <Card className="bg-white/[0.03] border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-lg">Dispositions</CardTitle>
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
        <CardTitle className="text-white text-lg">Dispositions</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-white/30 text-sm">
            No disposition data — upload a ProductionReport
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(0,0,0,0.9)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "white",
                  fontSize: 12,
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => [`${Number(value).toLocaleString()}`, "Count"]}
              />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

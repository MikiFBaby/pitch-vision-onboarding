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
import type { VarianceSummary } from "@/types/dialedin-types";

interface VarianceViewProps {
  data: VarianceSummary | undefined;
}

function convColor(rate: number): string {
  if (rate >= 90) return "text-emerald-400";
  if (rate >= 70) return "text-white/70";
  if (rate >= 50) return "text-amber-400";
  return "text-red-400";
}

export default function VarianceView({ data }: VarianceViewProps) {
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.by_date.map((d) => ({
      date: d.date.slice(5), // MM-DD
      sla: d.sla_transfers,
      billable: d.billable_calls,
      conv: d.conversion_rate,
    }));
  }, [data]);

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-[10px] text-white/20 font-mono">
          No variance data — enable with variance=true
        </span>
      </div>
    );
  }

  const { totals, by_date, by_campaign, by_agent } = data;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      {/* Summary Cards */}
      <div className="shrink-0 px-3 py-2 border-b border-[#1a2332] bg-[#0c1018]">
        <div className="mb-1.5">
          <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">
            SLA vs Billable Variance
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <VCard label="SLA Transfers" value={totals.sla_transfers.toLocaleString()} color="text-blue-400" />
          <VCard label="Billable Calls" value={totals.billable_calls.toLocaleString()} color="text-emerald-400" />
          <VCard
            label="Gap"
            value={totals.gap.toLocaleString()}
            color={totals.gap > 0 ? "text-amber-400" : "text-emerald-400"}
            sub={totals.gap > 0 ? "SLA > Billable" : "Billable ≥ SLA"}
          />
          <VCard
            label="Conversion Rate"
            value={`${totals.conversion_rate.toFixed(1)}%`}
            color={convColor(totals.conversion_rate)}
            sub={`$${totals.revenue_variance.toLocaleString()} rev. variance`}
          />
        </div>
      </div>

      {/* Variance Trend Chart */}
      {by_date.length > 0 && (
        <div className="h-[220px] shrink-0 bg-[#0c1018] border-b border-[#1a2332] px-1 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="date"
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
                width={40}
                tickFormatter={(v: number) => `${v}%`}
                domain={[0, 100]}
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
              <Legend wrapperStyle={{ fontSize: 9, fontFamily: "monospace" }} iconSize={8} />
              <Bar yAxisId="left" dataKey="sla" fill="#3b82f6" opacity={0.6} name="SLA" />
              <Bar yAxisId="left" dataKey="billable" fill="#10b981" opacity={0.6} name="Billable" />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="conv"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                name="Conv%"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Campaign Variance Table */}
      {by_campaign.length > 0 && (
        <div className="shrink-0 bg-[#0c1018] border-b border-[#1a2332]">
          <div className="px-3 py-1.5 border-b border-[#1a2332]">
            <span className="text-[9px] uppercase tracking-wider text-blue-400 font-mono font-bold">
              Campaign Variance
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider text-white/25 font-mono border-b border-[#1a2332]">
                  <th className="text-left py-1 px-2">Campaign</th>
                  <th className="text-right py-1 px-1">SLA</th>
                  <th className="text-right py-1 px-1">Billable</th>
                  <th className="text-right py-1 px-1">Gap</th>
                  <th className="text-right py-1 px-1">Conv%</th>
                  <th className="text-right py-1 px-1">Est. Rev</th>
                  <th className="text-right py-1 px-2">Act. Rev</th>
                </tr>
              </thead>
              <tbody>
                {by_campaign.map((c) => (
                  <tr key={c.campaign} className="border-b border-[#1a2332]/30 hover:bg-white/[0.03]">
                    <td className="py-0.5 px-2 font-mono text-white/90 truncate max-w-[160px]">{c.campaign}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-blue-400">{c.sla_transfers.toLocaleString()}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-emerald-400">{c.billable_calls.toLocaleString()}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-amber-400">{c.gap}</td>
                    <td className={`py-0.5 px-1 text-right font-mono ${convColor(c.conversion_rate)}`}>
                      {c.conversion_rate > 0 ? `${c.conversion_rate.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-0.5 px-1 text-right font-mono text-white/40">
                      {c.estimated_revenue > 0 ? `$${c.estimated_revenue.toLocaleString()}` : "—"}
                    </td>
                    <td className="py-0.5 px-2 text-right font-mono text-emerald-400">
                      ${c.actual_revenue.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Agent Variance Table */}
      {by_agent.length > 0 && (
        <div className="flex-1 min-h-0 bg-[#0c1018]">
          <div className="px-3 py-1.5 border-b border-[#1a2332]">
            <span className="text-[9px] uppercase tracking-wider text-blue-400 font-mono font-bold">
              Agent Variance (Top 25)
            </span>
          </div>
          <div className="overflow-y-auto max-h-[300px]">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#0c1018] z-10">
                <tr className="text-[9px] uppercase tracking-wider text-white/25 font-mono border-b border-[#1a2332]">
                  <th className="text-left py-1 px-2">Agent</th>
                  <th className="text-left py-1 px-1">Team</th>
                  <th className="text-right py-1 px-1">SLA</th>
                  <th className="text-right py-1 px-1">Billable</th>
                  <th className="text-right py-1 px-1">Gap</th>
                  <th className="text-right py-1 px-1">Conv%</th>
                  <th className="text-right py-1 px-1">Est. Rev</th>
                  <th className="text-right py-1 px-2">Act. Rev</th>
                </tr>
              </thead>
              <tbody>
                {by_agent.slice(0, 25).map((a) => (
                  <tr key={a.agent_name} className="border-b border-[#1a2332]/30 hover:bg-white/[0.03]">
                    <td className="py-0.5 px-2 font-mono text-white/90 truncate max-w-[120px]">{a.agent_name}</td>
                    <td className="py-0.5 px-1 font-mono text-white/30 text-[10px] truncate max-w-[100px]">{a.team || "—"}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-blue-400">{a.sla_transfers.toLocaleString()}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-emerald-400">{a.billable_calls.toLocaleString()}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-amber-400">{a.gap}</td>
                    <td className={`py-0.5 px-1 text-right font-mono ${convColor(a.conversion_rate)}`}>
                      {a.conversion_rate > 0 ? `${a.conversion_rate.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-0.5 px-1 text-right font-mono text-white/40">${a.estimated_revenue.toLocaleString()}</td>
                    <td className="py-0.5 px-2 text-right font-mono text-emerald-400">
                      {a.actual_revenue > 0 ? `$${a.actual_revenue.toLocaleString()}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty states for missing data */}
      {by_date.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[10px] text-white/20 font-mono">
            No overlapping SLA + Billable data found for variance analysis
          </span>
        </div>
      )}
    </div>
  );
}

function VCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-[#050a12] border border-[#1a2332] px-2 py-1.5">
      <div className="text-[8px] uppercase tracking-wider text-white/25 font-mono mb-0.5">{label}</div>
      <div className={`text-lg font-mono font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[8px] font-mono mt-0.5 text-white/20">{sub}</div>}
    </div>
  );
}

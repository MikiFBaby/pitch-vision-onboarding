"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import type { RetreaverRevenueSummary } from "@/types/dialedin-types";

interface BillablesViewProps {
  data: RetreaverRevenueSummary | undefined;
}

const CAMPAIGN_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899",
  "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6",
];

export default function BillablesView({ data }: BillablesViewProps) {
  const dailyChart = useMemo(() => {
    if (!data?.daily_trend) return [];
    return data.daily_trend.map((d) => ({
      date: d.date.slice(5), // MM-DD
      revenue: d.revenue,
      calls: d.calls,
      payout: d.payout,
    }));
  }, [data]);

  const campaignChart = useMemo(() => {
    if (!data?.by_campaign) return [];
    return data.by_campaign.map((c) => ({
      name: c.campaign.length > 20 ? c.campaign.slice(0, 18) + "…" : c.campaign,
      fullName: c.campaign,
      revenue: c.revenue,
      calls: c.calls,
    }));
  }, [data]);

  if (!data || data.totals.calls === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-[10px] text-white/20 font-mono">
          No billable data — Retreaver pings and CSVs will appear here
        </span>
      </div>
    );
  }

  const { totals, by_campaign, by_agent, daily_trend } = data;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      {/* Summary Stats */}
      <div className="shrink-0 px-3 py-2 border-b border-[#1a2332] bg-[#0c1018]">
        <div className="mb-1.5">
          <span className="text-[9px] uppercase tracking-wider text-emerald-400 font-mono font-bold">
            Billable Revenue (Retreaver)
          </span>
          <span className="text-[8px] text-white/15 font-mono ml-2">
            {data.period.start} — {data.period.end}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          <StatCard label="Total Revenue" value={`$${totals.revenue.toLocaleString()}`} color="text-emerald-400" />
          <StatCard label="Total Calls" value={totals.calls.toLocaleString()} color="text-blue-400" />
          <StatCard label="Avg/Converted" value={`$${totals.avg_per_call.toFixed(2)}`} color="text-white/70" sub={`$${totals.avg_per_call_diluted.toFixed(2)} diluted`} />
          <StatCard label="Converted" value={totals.converted.toLocaleString()} color="text-emerald-400" sub={`${totals.calls > 0 ? Math.round((totals.converted / totals.calls) * 100) : 0}%`} />
          <StatCard label="Payout" value={`$${totals.payout.toLocaleString()}`} color="text-amber-400" />
        </div>
      </div>

      {/* Daily Revenue Chart */}
      {daily_trend.length > 0 && (
        <div className="h-[200px] shrink-0 bg-[#0c1018] border-b border-[#1a2332] px-1 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyChart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
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
                formatter={(value: number, name: string) => {
                  if (name === "Revenue") return [`$${value.toLocaleString()}`, name];
                  return [value.toLocaleString(), name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 9, fontFamily: "monospace" }} iconSize={8} />
              <Bar dataKey="revenue" fill="#10b981" opacity={0.8} name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Campaign Revenue Chart */}
      {by_campaign.length > 0 && (
        <div className="shrink-0 bg-[#0c1018] border-b border-[#1a2332]">
          <div className="px-3 py-1.5 border-b border-[#1a2332]">
            <span className="text-[9px] uppercase tracking-wider text-emerald-400 font-mono font-bold">
              Campaign Breakdown
            </span>
          </div>
          {by_campaign.length > 1 && (
            <div className="h-[160px] px-1 pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={campaignChart} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <XAxis
                    type="number"
                    tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `$${v}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0c1018",
                      border: "1px solid #1a2332",
                      color: "white",
                      fontSize: 11,
                      fontFamily: "monospace",
                    }}
                    formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]}
                    labelFormatter={(label: string, payload: Array<{ payload?: { fullName?: string } }>) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Bar dataKey="revenue">
                    {campaignChart.map((_, i) => (
                      <Cell key={i} fill={CAMPAIGN_COLORS[i % CAMPAIGN_COLORS.length]} opacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider text-white/25 font-mono border-b border-[#1a2332]">
                  <th className="text-left py-1 px-2">Campaign</th>
                  <th className="text-right py-1 px-1">Calls</th>
                  <th className="text-right py-1 px-1">Revenue</th>
                  <th className="text-right py-1 px-1">Payout</th>
                  <th className="text-right py-1 px-1">Avg/Call</th>
                  <th className="text-right py-1 px-1">Converted</th>
                  <th className="text-right py-1 px-2">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {by_campaign.map((c) => (
                  <tr key={c.campaign} className="border-b border-[#1a2332]/30 hover:bg-white/[0.03]">
                    <td className="py-0.5 px-2 font-mono text-white/90 truncate max-w-[180px]">{c.campaign}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-blue-400">{c.calls.toLocaleString()}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-emerald-400">${c.revenue.toLocaleString()}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-white/40">${c.payout.toLocaleString()}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-white/70">${c.avg_per_call.toFixed(2)}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-white/40">{c.converted}</td>
                    <td className="py-0.5 px-2 text-right font-mono text-white/30">
                      {totals.revenue > 0 ? `${((c.revenue / totals.revenue) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Agent Revenue Table */}
      {by_agent.length > 0 && (
        <div className="flex-1 min-h-0 bg-[#0c1018]">
          <div className="px-3 py-1.5 border-b border-[#1a2332]">
            <span className="text-[9px] uppercase tracking-wider text-emerald-400 font-mono font-bold">
              Agent Breakdown ({by_agent.length} agents)
            </span>
          </div>
          <div className="overflow-y-auto max-h-[400px]">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#0c1018] z-10">
                <tr className="text-[9px] uppercase tracking-wider text-white/25 font-mono border-b border-[#1a2332]">
                  <th className="text-left py-1 px-2">#</th>
                  <th className="text-left py-1 px-1">Agent</th>
                  <th className="text-right py-1 px-1">Revenue</th>
                  <th className="text-right py-1 px-1">Calls</th>
                  <th className="text-right py-1 px-1">Avg/Call</th>
                  <th className="text-right py-1 px-1">% of Total</th>
                  <th className="text-left py-1 px-2">Campaigns</th>
                </tr>
              </thead>
              <tbody>
                {by_agent.slice(0, 50).map((a, i) => (
                  <tr key={a.agent} className="border-b border-[#1a2332]/30 hover:bg-white/[0.03]">
                    <td className="py-0.5 px-2 font-mono text-white/20 text-[9px]">{i + 1}</td>
                    <td className="py-0.5 px-1 font-mono text-white/90 truncate max-w-[140px]">{a.agent}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-emerald-400">${a.revenue.toLocaleString()}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-blue-400">{a.calls.toLocaleString()}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-white/70">${a.avg_per_call.toFixed(2)}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-white/30">
                      {totals.revenue > 0 ? `${((a.revenue / totals.revenue) * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-0.5 px-2 font-mono text-white/25 text-[10px] truncate max-w-[150px]">
                      {a.campaigns.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daily Breakdown Table */}
      {daily_trend.length > 0 && (
        <div className="shrink-0 bg-[#0c1018] border-t border-[#1a2332]">
          <div className="px-3 py-1.5 border-b border-[#1a2332]">
            <span className="text-[9px] uppercase tracking-wider text-blue-400 font-mono font-bold">
              Daily Breakdown
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider text-white/25 font-mono border-b border-[#1a2332]">
                  <th className="text-left py-1 px-2">Date</th>
                  <th className="text-right py-1 px-1">Revenue</th>
                  <th className="text-right py-1 px-1">Payout</th>
                  <th className="text-right py-1 px-1">Calls</th>
                  <th className="text-right py-1 px-2">Avg/Call</th>
                </tr>
              </thead>
              <tbody>
                {daily_trend.map((d) => (
                  <tr key={d.date} className="border-b border-[#1a2332]/30 hover:bg-white/[0.03]">
                    <td className="py-0.5 px-2 font-mono text-white/90">{d.date}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-emerald-400">${d.revenue.toLocaleString()}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-white/40">${d.payout.toLocaleString()}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-blue-400">{d.calls.toLocaleString()}</td>
                    <td className="py-0.5 px-2 text-right font-mono text-white/70">
                      ${d.calls > 0 ? (d.revenue / d.calls).toFixed(2) : "0.00"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
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
      <div className={`text-base font-mono font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[8px] font-mono mt-0.5 text-white/20">{sub}</div>}
    </div>
  );
}

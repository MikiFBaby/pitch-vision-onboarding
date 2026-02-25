"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useExecutiveFilters } from "@/context/ExecutiveFilterContext";
import { PeriodLabel } from "../layout";
import { fmt, num } from "@/utils/format";
import type { RetreaverLive, RetreaverRevenueSummary } from "@/types/dialedin-types";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

type Tab = "overview" | "campaigns" | "agents" | "states" | "daily";

/** Format total seconds / call count as "Xm Ys" average duration */
function formatDuration(totalSecs: number, calls: number): string {
  if (!calls || !totalSecs) return "—";
  const avg = totalSecs / calls;
  const m = Math.floor(avg / 60);
  const s = Math.round(avg % 60);
  return `${m}m ${s}s`;
}

/** Format total seconds as hours+minutes */
function formatTotalTime(totalSecs: number): string {
  if (!totalSecs) return "0h";
  const h = Math.floor(totalSecs / 3600);
  const m = Math.round((totalSecs % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export default function RevenuePage() {
  const { startDate, endDate, dateRange } = useExecutiveFilters();
  const [retreaver, setRetreaver] = useState<RetreaverLive | null>(null);
  const [summary, setSummary] = useState<RetreaverRevenueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const period = dateRange === "custom" ? `${startDate},${endDate}` : dateRange;
      const [retreRes, revRes] = await Promise.all([
        fetch("/api/retreaver/live"),
        fetch(`/api/retreaver/revenue?period=${period}`),
      ]);

      if (retreRes.ok) setRetreaver(await retreRes.json());
      if (revRes.ok) {
        const d = await revRes.json();
        setSummary(d.data || d);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Retreaver live polling (10s)
  useEffect(() => {
    const id = setInterval(async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/retreaver/live");
        if (res.ok) setRetreaver(await res.json());
      } catch {
        // silent
      }
    }, 10000);
    return () => clearInterval(id);
  }, []);

  const totals = summary?.totals;
  const TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: "OVERVIEW" },
    { key: "campaigns", label: "BY CAMPAIGN" },
    { key: "agents", label: "BY AGENT" },
    { key: "states", label: "BY STATE" },
    { key: "daily", label: "DAILY" },
  ];

  return (
    <div className="font-mono">
      <PeriodLabel title="REVENUE" />
      <div className="p-4 space-y-4">
      {/* Live Revenue Ticker */}
      {retreaver && (
        <div className="flex items-center gap-6 px-4 py-2 bg-[#0f1923] border border-emerald-500/20 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] text-emerald-400 tracking-widest">LIVE TODAY</span>
          </div>
          <div className="text-emerald-400 font-bold tabular-nums">{fmt(retreaver.today_revenue)}</div>
          <div className="text-white/60 text-[11px]">{num(retreaver.today_calls)} calls</div>
          <div className="text-white/60 text-[11px]">{num(retreaver.converted ?? 0)} conv</div>
          <div className="text-white/60 text-[11px]">{fmt(retreaver.avg_per_call, 2)}/conv</div>
          {retreaver.avg_per_call_diluted != null && (
            <div className="text-white/35 text-[11px]">{fmt(retreaver.avg_per_call_diluted, 2)}/all</div>
          )}
          <div className="text-white/60 text-[11px]">{retreaver.calls_per_minute.toFixed(1)} calls/min</div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-6 gap-3">
        <SummaryCard label="BILLABLE REVENUE" value={loading ? "---" : fmt(totals?.revenue ?? 0)} accent="emerald" />
        <SummaryCard label="PAYOUT" value={loading ? "---" : fmt(totals?.payout ?? 0)} accent="amber" />
        <SummaryCard label="TOTAL CALLS" value={loading ? "---" : num(totals?.calls ?? 0)} accent="cyan" />
        <SummaryCard
          label="AVG / CONV"
          value={loading ? "---" : fmt(totals?.avg_per_call ?? 0, 2)}
          accent="cyan"
          sub={loading ? undefined : `${fmt(totals?.avg_per_call_diluted ?? 0, 2)}/all`}
        />
        <SummaryCard
          label="CONVERTED"
          value={loading ? "---" : num(totals?.converted ?? 0)}
          accent="amber"
          sub={loading ? undefined : `${totals && totals.calls > 0 ? ((totals.converted / totals.calls) * 100).toFixed(1) : "0"}%`}
        />
        <SummaryCard
          label="AVG CALL"
          value={loading ? "---" : formatDuration(totals?.connected_secs ?? 0, totals?.calls ?? 0)}
          accent="cyan"
          sub={loading ? undefined : `${formatTotalTime(totals?.connected_secs ?? 0)} total`}
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-0 border-b border-[#243044]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] tracking-widest transition-colors ${
              tab === t.key
                ? "text-amber-400 border-b-2 border-amber-500 bg-[#0f1a2d]"
                : "text-white/60 hover:text-white/75"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "overview" && (
        <div className="space-y-4">
          {/* Daily Revenue Chart */}
          <div className="bg-[#0f1923] border border-[#243044] rounded-lg p-4">
            <div className="text-[11px] text-white/60 tracking-widest mb-3">DAILY REVENUE TREND</div>
            {!summary?.daily_trend?.length ? (
              <div className="text-white/35 text-xs py-8 text-center">No data for selected period</div>
            ) : (
              <DailyRevenueChart data={summary.daily_trend} />
            )}
          </div>

          {/* Top 5 Campaigns + Top 5 Agents side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#0f1923] border border-[#243044] rounded-lg p-4">
              <div className="text-[11px] text-white/60 tracking-widest mb-3">TOP CAMPAIGNS</div>
              {(summary?.by_campaign ?? []).slice(0, 5).map((c) => (
                <div key={c.campaign} className="flex items-center gap-2 text-xs py-1.5 border-b border-[#243044] last:border-0">
                  <span className="text-white/85 flex-1 truncate">{c.campaign || "Unknown"}</span>
                  <span className="text-white/60 tabular-nums">{num(c.calls)}</span>
                  <span className="text-emerald-400 tabular-nums font-medium w-20 text-right">{fmt(c.revenue)}</span>
                </div>
              ))}
            </div>
            <div className="bg-[#0f1923] border border-[#243044] rounded-lg p-4">
              <div className="text-[11px] text-white/60 tracking-widest mb-3">TOP AGENTS</div>
              {(summary?.by_agent ?? []).slice(0, 5).map((a) => (
                <div key={a.agent} className="flex items-center gap-2 text-xs py-1.5 border-b border-[#243044] last:border-0">
                  <span className="text-white/85 flex-1 truncate">{a.agent || "Unknown"}</span>
                  <span className="text-white/60 tabular-nums">{num(a.calls)}</span>
                  <span className="text-emerald-400 tabular-nums font-medium w-20 text-right">{fmt(a.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "campaigns" && (
        <div className="bg-[#0f1923] border border-[#243044] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#243044] text-[11px] text-white/60 tracking-wider">
                <th className="px-4 py-2 text-left">CAMPAIGN</th>
                <th className="px-3 py-2 text-right">CALLS</th>
                <th className="px-3 py-2 text-right">REVENUE</th>
                <th className="px-3 py-2 text-right">PAYOUT</th>
                <th className="px-3 py-2 text-right">AVG/CALL</th>
                <th className="px-3 py-2 text-right">CONVERTED</th>
                <th className="px-3 py-2 text-right">% TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.by_campaign ?? [])
                .sort((a, b) => b.revenue - a.revenue)
                .map((c) => (
                <tr key={c.campaign} className="border-b border-[#243044]/50 hover:bg-white/[0.04]">
                  <td className="px-4 py-2 text-white/85">{c.campaign || "Unknown"}</td>
                  <td className="px-3 py-2 text-right text-white/70 tabular-nums">{num(c.calls)}</td>
                  <td className="px-3 py-2 text-right text-emerald-400 tabular-nums font-medium">{fmt(c.revenue)}</td>
                  <td className="px-3 py-2 text-right text-amber-400/80 tabular-nums">{fmt(c.payout)}</td>
                  <td className="px-3 py-2 text-right text-white/70 tabular-nums">{fmt(c.avg_per_call, 2)}</td>
                  <td className="px-3 py-2 text-right text-white/70 tabular-nums">{num(c.converted)}</td>
                  <td className="px-3 py-2 text-right text-white/50 tabular-nums">
                    {totals && totals.revenue > 0 ? `${((c.revenue / totals.revenue) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!summary?.by_campaign?.length && (
            <div className="py-8 text-center text-white/35 text-xs">No campaign data</div>
          )}
        </div>
      )}

      {tab === "agents" && (
        <div className="bg-[#0f1923] border border-[#243044] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#243044] text-[11px] text-white/60 tracking-wider">
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">AGENT</th>
                <th className="px-3 py-2 text-right">CALLS</th>
                <th className="px-3 py-2 text-right">REVENUE</th>
                <th className="px-3 py-2 text-right">AVG/CALL</th>
                <th className="px-3 py-2 text-left">CAMPAIGNS</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.by_agent ?? []).map((a, i) => (
                <tr key={a.agent} className="border-b border-[#243044]/50 hover:bg-white/[0.04]">
                  <td className="px-4 py-2 text-white/50 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2 text-white/85">{a.agent || "Unknown"}</td>
                  <td className="px-3 py-2 text-right text-white/70 tabular-nums">{num(a.calls)}</td>
                  <td className="px-3 py-2 text-right text-emerald-400 tabular-nums font-medium">{fmt(a.revenue)}</td>
                  <td className="px-3 py-2 text-right text-white/70 tabular-nums">{fmt(a.avg_per_call, 2)}</td>
                  <td className="px-3 py-2 text-white/60 text-[11px] truncate max-w-[200px]">
                    {a.campaigns?.join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!summary?.by_agent?.length && (
            <div className="py-8 text-center text-white/35 text-xs">No agent data</div>
          )}
        </div>
      )}

      {tab === "states" && (
        <div className="bg-[#0f1923] border border-[#243044] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#243044] text-[11px] text-white/60 tracking-wider">
                <th className="px-4 py-2 text-left">STATE</th>
                <th className="px-3 py-2 text-right">CALLS</th>
                <th className="px-3 py-2 text-right">REVENUE</th>
                <th className="px-3 py-2 text-right">AVG/CALL</th>
                <th className="px-3 py-2 text-right">CONVERTED</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.by_state ?? []).map((s) => (
                <tr key={s.state} className="border-b border-[#243044]/50 hover:bg-white/[0.04]">
                  <td className="px-4 py-2 text-white/85 font-medium">{s.state}</td>
                  <td className="px-3 py-2 text-right text-white/70 tabular-nums">{num(s.calls)}</td>
                  <td className="px-3 py-2 text-right text-emerald-400 tabular-nums font-medium">{fmt(s.revenue)}</td>
                  <td className="px-3 py-2 text-right text-white/70 tabular-nums">{fmt(s.avg_per_call, 2)}</td>
                  <td className="px-3 py-2 text-right text-white/70 tabular-nums">{num(s.converted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!summary?.by_state?.length && (
            <div className="py-8 text-center text-white/50 text-xs">
              No geographic data — enriched pings not yet active
            </div>
          )}
        </div>
      )}

      {tab === "daily" && (
        <div className="bg-[#0f1923] border border-[#243044] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#243044] text-[11px] text-white/60 tracking-wider">
                <th className="px-4 py-2 text-left">DATE</th>
                <th className="px-3 py-2 text-right">REVENUE</th>
                <th className="px-3 py-2 text-right">PAYOUT</th>
                <th className="px-3 py-2 text-right">CALLS</th>
                <th className="px-3 py-2 text-right">AVG/CALL</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.daily_trend ?? [])
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((d) => (
                  <tr key={d.date} className="border-b border-[#243044]/50 hover:bg-white/[0.04]">
                    <td className="px-4 py-2 text-white/85 tabular-nums">{d.date}</td>
                    <td className="px-3 py-2 text-right text-emerald-400 tabular-nums font-medium">{fmt(d.revenue)}</td>
                    <td className="px-3 py-2 text-right text-amber-400/80 tabular-nums">{fmt(d.payout)}</td>
                    <td className="px-3 py-2 text-right text-white/70 tabular-nums">{num(d.calls)}</td>
                    <td className="px-3 py-2 text-right text-white/70 tabular-nums">
                      {d.calls > 0 ? fmt(d.revenue / d.calls, 2) : "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!summary?.daily_trend?.length && (
            <div className="py-8 text-center text-white/35 text-xs">No daily data</div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent, sub }: { label: string; value: string; accent: string; sub?: string }) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-400 border-emerald-500/20",
    amber: "text-amber-400 border-amber-500/20",
    cyan: "text-cyan-400 border-cyan-500/20",
  };
  const c = colors[accent] || colors.cyan;
  const [textColor, borderColor] = c.split(" ");

  return (
    <div className={`bg-[#0f1923] border ${borderColor} rounded-lg p-3`}>
      <div className="text-[11px] text-white/60 tracking-widest uppercase mb-1">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${textColor}`}>{value}</div>
      {sub && <div className="text-[11px] text-white/35 mt-0.5">{sub}</div>}
    </div>
  );
}

function DailyRevenueChart({ data }: { data: Array<{ date: string; revenue: number; payout: number; calls: number }> }) {
  const chartData = useMemo(() =>
    data.map((d) => ({
      date: d.date.slice(5),
      revenue: d.revenue,
      payout: d.payout,
    })),
    [data]
  );

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10, fontFamily: "monospace" }}
            axisLine={{ stroke: "#243044" }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10, fontFamily: "monospace" }}
            axisLine={false}
            tickLine={false}
            width={50}
            tickFormatter={(v: number) => `$${v}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f1923",
              border: "1px solid #243044",
              color: "white",
              fontSize: 11,
              fontFamily: "monospace",
            }}
            formatter={(value: number | string | undefined, name?: string) => [
              `$${Number(value ?? 0).toLocaleString()}`,
              name === "revenue" ? "Revenue" : "Payout",
            ]}
          />
          <Bar dataKey="revenue" fill="#10b981" opacity={0.8} name="revenue" />
          <Bar dataKey="payout" fill="#f59e0b" opacity={0.4} name="payout" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

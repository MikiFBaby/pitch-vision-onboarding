"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { DollarSign, TrendingUp, TrendingDown, Users, Activity } from "lucide-react";
import TimeSeriesView from "@/components/dialedin/revenue/TimeSeriesView";
import VarianceView from "@/components/dialedin/revenue/VarianceView";
import BillablesView from "@/components/dialedin/revenue/BillablesView";
import type { RevenueSummary, RetreaverLive, TimeGranularity } from "@/types/dialedin-types";

type RevenueTab = "overview" | "billables" | "time" | "variance";

const TABS: { key: RevenueTab; label: string }[] = [
  { key: "overview", label: "OVERVIEW" },
  { key: "billables", label: "BILLABLES" },
  { key: "time", label: "TIME" },
  { key: "variance", label: "VARIANCE" },
];

const PERIODS = ["7d", "14d", "30d", "mtd", "ytd"];

export default function RevenueWorkspace() {
  const [data, setData] = useState<RevenueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("ytd");
  const [tab, setTab] = useState<RevenueTab>("overview");
  const [granularity, setGranularity] = useState<TimeGranularity>("daily");
  const [live, setLive] = useState<RetreaverLive | null>(null);

  // Determine whether to include variance & time series based on tab
  const needsVariance = tab === "variance";
  const needsTimeSeries = tab === "time" || tab === "variance";

  const fetchRevenue = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      const params = new URLSearchParams({ period });
      if (needsTimeSeries) params.set("granularity", granularity);
      if (needsVariance) params.set("variance", "true");

      fetch(`/api/dialedin/revenue?${params}`)
        .then((r) => r.json())
        .then((json) => setData(json.data || null))
        .catch(() => {})
        .finally(() => { if (!silent) setLoading(false); });
    },
    [period, granularity, needsTimeSeries, needsVariance],
  );

  // Initial fetch + auto-refresh every 60s
  const isFirstLoad = useRef(true);
  useEffect(() => {
    fetchRevenue(!isFirstLoad.current);
    isFirstLoad.current = false;
    const interval = setInterval(() => fetchRevenue(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchRevenue]);

  // Live revenue polling (every 10 seconds)
  const fetchLive = useCallback(() => {
    fetch("/api/retreaver/live")
      .then((r) => r.json())
      .then((json) => {
        if (!json.error) setLive(json);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchLive();
    const interval = setInterval(fetchLive, 10000);
    return () => clearInterval(interval);
  }, [fetchLive]);

  const chartData = useMemo(() => {
    if (!data) return [];
    const retMap = new Map<string, number>();
    if (data.retreaver?.daily_trend) {
      for (const d of data.retreaver.daily_trend) {
        retMap.set(d.date, d.revenue);
      }
    }
    return data.daily_revenue.map((d) => ({
      date: d.date.slice(5),
      estimated: d.revenue,
      cost: d.cost,
      profit: Math.round((d.revenue - d.cost) * 100) / 100,
      actual: retMap.get(d.date) ?? null,
    }));
  }, [data]);

  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
        <div className="h-[80px] shrink-0 animate-pulse bg-white/[0.02]" />
        <div className="h-[220px] shrink-0 animate-pulse bg-white/[0.02] mt-1" />
        <div className="flex-1 animate-pulse bg-white/[0.02] mt-1" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <span className="text-[10px] text-white/20 font-mono">No revenue data available</span>
      </div>
    );
  }

  const { totals, by_team, retreaver } = data;
  const hasRetreaver = !!retreaver && retreaver.totals.calls > 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      {/* Live Revenue Ticker */}
      {live && live.today_calls > 0 && (
        <div className="shrink-0 px-3 py-1.5 border-b border-emerald-500/20 bg-emerald-500/[0.03]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[9px] uppercase tracking-wider text-emerald-400/70 font-mono">Live Today</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-lg font-mono font-bold text-emerald-400">
                  ${live.today_revenue.toLocaleString()}
                </span>
                <span className="text-[9px] text-white/20 font-mono ml-1.5">
                  {live.today_calls} calls | {live.converted} conv
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-mono text-emerald-400/70">
                  ${live.avg_per_call.toFixed(2)}/conv
                </span>
                <span className="text-[9px] text-white/15 font-mono ml-1.5" title="Diluted avg (all calls incl. unconverted)">
                  ${live.avg_per_call_diluted.toFixed(2)}/all
                </span>
                {live.calls_per_minute > 0 && (
                  <span className="text-[9px] text-white/20 font-mono ml-1.5">
                    {live.calls_per_minute.toFixed(1)}/min
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Period Selector + Sub-tabs */}
      <div className="shrink-0 px-3 py-2 border-b border-[#1a2332] bg-[#0c1018]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <DollarSign size={11} className="text-emerald-400" />
            <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">Revenue</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Sub-tab navigation */}
            <div className="flex border border-[#1a2332] overflow-hidden">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-2 py-0.5 text-[9px] font-mono uppercase transition-colors ${
                    tab === t.key
                      ? "bg-blue-400/15 text-blue-400"
                      : "text-white/30 hover:text-white/50 bg-[#050a12]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {/* Period selector */}
            <div className="flex border border-[#1a2332] overflow-hidden">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2 py-0.5 text-[9px] font-mono uppercase transition-colors ${
                    period === p ? "bg-amber-400/15 text-amber-400" : "text-white/30 hover:text-white/50 bg-[#050a12]"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary Cards (shown on all tabs) */}
        <div className="grid grid-cols-4 gap-2">
          {hasRetreaver ? (
            <>
              <SummaryCard
                label="Billable Revenue"
                value={`$${retreaver!.totals.revenue.toLocaleString()}`}
                icon={<DollarSign size={11} />}
                color="text-emerald-400"
                sub={`$${retreaver!.totals.avg_per_call}/conv | $${retreaver!.totals.avg_per_call_diluted}/all`}
                subColor="text-emerald-400/50"
              />
              <SummaryCard
                label="Cost"
                value={`$${totals.cost.toLocaleString()}`}
                icon={<Users size={11} />}
                color="text-white/70"
                sub={`${totals.total_hours.toLocaleString()} hrs | ${totals.working_days}d`}
              />
              <SummaryCard
                label="Actual P&L"
                value={`$${Math.round((retreaver!.totals.revenue - totals.cost) * 100) / 100}`}
                icon={(retreaver!.totals.revenue - totals.cost) >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                color={(retreaver!.totals.revenue - totals.cost) >= 0 ? "text-emerald-400" : "text-red-400"}
                sub={totals.revenue > 0 ? `Est. P&L: $${totals.profit.toLocaleString()}` : undefined}
                subColor="text-white/20"
              />
              <SummaryCard
                label="Converted"
                value={`${retreaver!.totals.converted.toLocaleString()}`}
                icon={<Activity size={11} />}
                color="text-emerald-400"
                sub={`${retreaver!.totals.calls > 0 ? Math.round((retreaver!.totals.converted / retreaver!.totals.calls) * 100) : 0}% conv | ${totals.total_transfers.toLocaleString()} SLA`}
              />
            </>
          ) : (
            <>
              <SummaryCard
                label="Est. Revenue"
                value={`$${totals.revenue.toLocaleString()}`}
                icon={<DollarSign size={11} />}
                color="text-emerald-400"
              />
              <SummaryCard
                label="Cost"
                value={`$${totals.cost.toLocaleString()}`}
                icon={<Users size={11} />}
                color="text-white/70"
              />
              <SummaryCard
                label="Est. Profit"
                value={`$${totals.profit.toLocaleString()}`}
                icon={totals.profit >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                color={totals.profit >= 0 ? "text-emerald-400" : "text-red-400"}
              />
              <SummaryCard
                label="Margin"
                value={`${totals.margin_pct.toFixed(1)}%`}
                icon={<Activity size={11} />}
                color={totals.margin_pct >= 0 ? "text-emerald-400" : "text-red-400"}
                sub={`${totals.total_transfers.toLocaleString()} SLA | ${totals.working_days}d`}
              />
            </>
          )}
        </div>
      </div>

      {/* ── TAB CONTENT ── */}
      {tab === "overview" && (
        <OverviewContent
          chartData={chartData}
          hasRetreaver={hasRetreaver}
          retreaver={retreaver}
          byTeam={by_team}
        />
      )}

      {tab === "billables" && (
        <BillablesView data={data.retreaver} />
      )}

      {tab === "time" && (
        <TimeSeriesView
          data={data.time_series || []}
          granularity={granularity}
          onGranularityChange={setGranularity}
        />
      )}

      {tab === "variance" && (
        <VarianceView data={data.variance} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Overview Tab Content (existing)
// ═══════════════════════════════════════════════════════════

function OverviewContent({
  chartData,
  hasRetreaver,
  retreaver,
  byTeam,
}: {
  chartData: { date: string; estimated: number; cost: number; profit: number; actual: number | null }[];
  hasRetreaver: boolean;
  retreaver: RevenueSummary["retreaver"];
  byTeam: RevenueSummary["by_team"];
}) {
  return (
    <>
      {/* Revenue vs Cost Trend Chart */}
      <div className="h-[220px] shrink-0 bg-[#0c1018] border-b border-[#1a2332]">
        <div className="px-3 py-1.5">
          <span className="text-[9px] uppercase tracking-wider text-white/25 font-mono">
            Daily Revenue vs Cost
            {hasRetreaver && <span className="text-emerald-400/40 ml-2">+ Actual (Retreaver)</span>}
          </span>
        </div>
        <div className="h-[180px] px-1">
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
                width={45}
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
                formatter={(value: number, name: string) => [`$${value?.toFixed(0) ?? "—"}`, name]}
              />
              <Line type="monotone" dataKey="estimated" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Est. Revenue" />
              {hasRetreaver && (
                <Line type="monotone" dataKey="actual" stroke="#34d399" strokeWidth={2} dot={false} name="Actual Revenue" connectNulls={false} />
              )}
              <Line type="monotone" dataKey="cost" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Cost" />
              <Line type="monotone" dataKey="profit" stroke="#f59e0b" strokeWidth={1} dot={false} name="Est. Profit" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Campaign Breakdown (from Retreaver) */}
      {hasRetreaver && retreaver!.by_campaign.length > 0 && (
        <div className="shrink-0 bg-[#0c1018] border-b border-[#1a2332]">
          <div className="px-3 py-1.5 border-b border-[#1a2332]">
            <span className="text-[9px] uppercase tracking-wider text-emerald-400 font-mono font-bold">Campaign Revenue (Retreaver)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider text-white/25 font-mono border-b border-[#1a2332]">
                  <th className="text-left py-1 px-2">Campaign</th>
                  <th className="text-right py-1 px-1">Calls</th>
                  <th className="text-right py-1 px-1">Revenue</th>
                  <th className="text-right py-1 px-1">Payout</th>
                  <th className="text-right py-1 px-1">Avg/Call</th>
                  <th className="text-right py-1 px-2">Converted</th>
                </tr>
              </thead>
              <tbody>
                {retreaver!.by_campaign.map((c) => (
                  <tr key={c.campaign} className="border-b border-[#1a2332]/30 hover:bg-white/[0.03]">
                    <td className="py-0.5 px-2 font-mono text-white/90 truncate max-w-[160px]">{c.campaign}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-white/70">{c.calls.toLocaleString()}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-emerald-400">${c.revenue.toLocaleString()}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-white/40">${c.payout.toLocaleString()}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-white/70">${c.avg_per_call.toFixed(2)}</td>
                    <td className="py-0.5 px-2 text-right font-mono text-white/40">{c.converted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Agent Revenue Table (from Retreaver detailed CSVs) */}
      {hasRetreaver && retreaver!.by_agent.length > 0 && (
        <div className="shrink-0 bg-[#0c1018] border-b border-[#1a2332]">
          <div className="px-3 py-1.5 border-b border-[#1a2332]">
            <span className="text-[9px] uppercase tracking-wider text-emerald-400 font-mono font-bold">Agent Revenue (Retreaver)</span>
          </div>
          <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#0c1018] z-10">
                <tr className="text-[9px] uppercase tracking-wider text-white/25 font-mono border-b border-[#1a2332]">
                  <th className="text-left py-1 px-2">Agent</th>
                  <th className="text-right py-1 px-1">Revenue</th>
                  <th className="text-right py-1 px-1">Calls</th>
                  <th className="text-right py-1 px-1">Avg/Call</th>
                  <th className="text-left py-1 px-2">Campaigns</th>
                </tr>
              </thead>
              <tbody>
                {retreaver!.by_agent.slice(0, 25).map((a) => (
                  <tr key={a.agent} className="border-b border-[#1a2332]/30 hover:bg-white/[0.03]">
                    <td className="py-0.5 px-2 font-mono text-white/90 truncate max-w-[120px]">{a.agent}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-emerald-400">${a.revenue.toLocaleString()}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-white/70">{a.calls}</td>
                    <td className="py-0.5 px-1 text-right font-mono text-white/70">${a.avg_per_call.toFixed(2)}</td>
                    <td className="py-0.5 px-2 font-mono text-white/30 text-[10px] truncate max-w-[150px]">
                      {a.campaigns.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Team ROI Table */}
      <div className="flex-1 min-h-0 bg-[#0c1018]">
        <div className="px-3 py-1.5 border-b border-[#1a2332]">
          <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">Team ROI</span>
        </div>
        <div className="overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-[#0c1018] z-10">
              <tr className="text-[9px] uppercase tracking-wider text-white/25 font-mono border-b border-[#1a2332]">
                <th className="text-left py-1 px-2">Team</th>
                <th className="text-left py-1 px-1">Campaign</th>
                <th className="text-right py-1 px-1">#Agents</th>
                <th className="text-right py-1 px-1">SLA</th>
                <th className="text-right py-1 px-1">SLA/hr</th>
                <th className="text-right py-1 px-1">Est. Rev</th>
                <th className="text-right py-1 px-1">Cost</th>
                <th className="text-right py-1 px-1">P&L</th>
                <th className="text-right py-1 px-1">ROI%</th>
                <th className="text-right py-1 px-2">$/hr</th>
              </tr>
            </thead>
            <tbody>
              {byTeam.map((t) => (
                <tr key={t.team} className="border-b border-[#1a2332]/30 hover:bg-white/[0.03]">
                  <td className="py-0.5 px-2 font-mono text-white/90 truncate max-w-[120px]">{t.team}</td>
                  <td className="py-0.5 px-1 font-mono text-white/30 text-[10px]">{t.campaign_type?.toUpperCase() || "—"}</td>
                  <td className="py-0.5 px-1 text-right font-mono text-white/40">{t.agents}</td>
                  <td className="py-0.5 px-1 text-right font-mono text-white/70">{t.transfers.toLocaleString()}</td>
                  <td className="py-0.5 px-1 text-right font-mono text-white/70">{t.tph.toFixed(2)}</td>
                  <td className="py-0.5 px-1 text-right font-mono text-emerald-400">${t.revenue.toLocaleString()}</td>
                  <td className="py-0.5 px-1 text-right font-mono text-white/40">${t.cost.toLocaleString()}</td>
                  <td className={`py-0.5 px-1 text-right font-mono font-bold ${
                    t.profit >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}>
                    ${t.profit.toLocaleString()}
                  </td>
                  <td className={`py-0.5 px-1 text-right font-mono ${
                    t.roi_pct >= 0 ? "text-emerald-400/70" : "text-red-400/70"
                  }`}>
                    {t.roi_pct.toFixed(0)}%
                  </td>
                  <td className={`py-0.5 px-2 text-right font-mono ${
                    t.rev_per_hour >= 10 ? "text-emerald-400" : "text-white/50"
                  }`}>
                    ${t.rev_per_hour.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// Summary Card Component
// ═══════════════════════════════════════════════════════════

function SummaryCard({
  label,
  value,
  icon,
  color,
  sub,
  subColor,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  sub?: string;
  subColor?: string;
}) {
  return (
    <div className="bg-[#050a12] border border-[#1a2332] px-2 py-1.5">
      <div className="flex items-center gap-1 mb-0.5">
        {icon && <span className={color}>{icon}</span>}
        <span className="text-[8px] uppercase tracking-wider text-white/25 font-mono">{label}</span>
      </div>
      <div className={`text-lg font-mono font-bold ${color}`}>{value}</div>
      {sub && <div className={`text-[8px] font-mono mt-0.5 ${subColor || "text-white/20"}`}>{sub}</div>}
    </div>
  );
}

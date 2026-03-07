"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useExecutiveFilters } from "@/context/ExecutiveFilterContext";
import { useLiveData } from "@/hooks/useLiveData";
import { useIntradayData } from "@/hooks/useIntradayData";
import {
  Zap,
  Users,
  Activity,
  Radio,
  BarChart2,
  DollarSign,
} from "lucide-react";
import { PeriodLabel } from "./layout";
import { fmt, num } from "@/utils/format";
import type { RetreaverLive } from "@/types/dialedin-types";

interface CertaintyInfo {
  level: "actual" | "derived" | "estimated";
  label: string;
  coverage_pct?: number;
}

interface PeriodData {
  revenue: number;
  cost: number;
  profit: number;
  margin_pct: number;
  estimated_revenue: number;
  estimated_profit: number;
  estimated_margin_pct: number;
  revenue_days_actual: number;
  revenue_days_projected: number;
  sla_transfers: number;
  avg_tph: number;
  agent_count: number;
  alerts_count: number;
  top_agents: { name: string; revenue: number; transfers: number }[];
  certainty?: {
    revenue?: CertaintyInfo;
    estimated_revenue?: CertaintyInfo;
    labor_cost?: CertaintyInfo;
    salary_cost?: CertaintyInfo;
    dialer_cost?: CertaintyInfo;
    total_cost?: CertaintyInfo;
  };
}

function CertaintyDot({ info }: { info?: CertaintyInfo }) {
  if (!info) return null;
  const colors: Record<string, string> = {
    actual: "bg-emerald-400",
    derived: "bg-amber-400",
    estimated: "bg-orange-400",
  };
  return (
    <span className="relative group inline-block ml-1 align-middle">
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[info.level] || "bg-white/30"}`} />
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-[#0c1018] border border-[#1a2332] rounded text-[9px] text-white/70 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
        {info.label}
      </span>
    </span>
  );
}

export default function CommandCenterPage() {
  const { startDate, endDate } = useExecutiveFilters();
  const { liveMetrics, hasLiveData } = useLiveData({ interval: 30000 });
  const [retreaver, setRetreaver] = useState<RetreaverLive | null>(null);
  const [period, setPeriod] = useState<PeriodData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      // Fetch: Retreaver live + DialedIn revenue + P&L (for full cost picture)
      const [retreRes, revRes, pnlRes] = await Promise.all([
        fetch("/api/retreaver/live"),
        fetch(`/api/dialedin/revenue?period=${startDate},${endDate}`),
        fetch(`/api/executive/pnl?period=${startDate},${endDate}`),
      ]);

      if (retreRes.ok) {
        setRetreaver(await retreRes.json());
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let revData: any = null;
      if (revRes.ok) {
        const rev = await revRes.json();
        revData = rev.data || rev;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let pnlData: any = null;
      if (pnlRes.ok) {
        pnlData = await pnlRes.json();
      }

      // Revenue: prefer Retreaver actual, then P&L, then DialedIn estimated
      const retreatRev = revData?.retreaver?.totals?.revenue ?? 0;
      const pnlRev = pnlData?.summary?.revenue ?? 0;
      const dialedInRev = revData?.totals?.revenue ?? 0;
      const bestRevenue = retreatRev > 0 ? retreatRev : (pnlRev > 0 ? pnlRev : dialedInRev);

      // Cost: use P&L route (includes labor + salary + dialer + subscriptions + other)
      // Fall back to DialedIn labor-only cost if P&L unavailable
      const pnlCost = pnlData?.summary?.total_cost ?? 0;
      const dialedInCost = revData?.totals?.cost ?? 0;
      const cost = pnlCost > 0 ? pnlCost : dialedInCost;
      const profit = bestRevenue - cost;

      // Estimated revenue projection from P&L (daily run-rate × working days)
      const estRevenue = pnlData?.summary?.estimated_revenue ?? 0;
      const estProfit = pnlData?.summary?.estimated_gross_profit ?? 0;
      const estMarginPct = pnlData?.summary?.estimated_margin_pct ?? 0;
      const revDaysActual = pnlData?.summary?.revenue_days_actual ?? 0;
      const revDaysProjected = pnlData?.summary?.revenue_days_projected ?? 0;

      setPeriod({
        revenue: bestRevenue,
        cost,
        profit,
        margin_pct: bestRevenue > 0 ? (profit / bestRevenue) * 100 : 0,
        estimated_revenue: estRevenue,
        estimated_profit: estProfit,
        estimated_margin_pct: estMarginPct,
        revenue_days_actual: revDaysActual,
        revenue_days_projected: revDaysProjected,
        sla_transfers: revData?.totals?.total_transfers ?? 0,
        avg_tph: revData?.totals?.total_transfers && revData?.totals?.total_hours
          ? revData.totals.total_transfers / revData.totals.total_hours
          : 0,
        agent_count: revData?.by_team?.reduce((s: number, t: { agents?: number }) => s + (t.agents || 0), 0) ?? 0,
        alerts_count: 0,
        top_agents: (revData?.retreaver?.by_agent ?? [])
          .slice(0, 10)
          .map((a: { agent: string; revenue: number; calls: number }) => ({
            name: a.agent,
            revenue: a.revenue,
            transfers: a.calls,
          })),
        certainty: pnlData?.summary?.certainty ?? undefined,
      });
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

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

  // Intraday scraper data (5-min cumulative snapshots) + live economics
  const { data: intradayData, loading: intradayLoading } = useIntradayData({
    includeTrend: true,
    includeEconomics: true,
    interval: 120_000,
  });

  // Intraday computed stats
  const intradayStats = useMemo(() => {
    if (!intradayData?.totals) return null;
    const t = intradayData.totals;
    const aboveBE = intradayData.agents.filter((a) => {
      const team = a.team?.toLowerCase() || "";
      const be = (team.includes("aragon") || team.includes("medicare") || team.includes("whatif") || team.includes("elite") || team.includes("brandon"))
        ? intradayData.break_even.medicare
        : intradayData.break_even.aca;
      return a.sla_hr >= be && a.hours_worked > 0;
    }).length;
    const belowBE = intradayData.agents.filter((a) => {
      const team = a.team?.toLowerCase() || "";
      const be = (team.includes("aragon") || team.includes("medicare") || team.includes("whatif") || team.includes("elite") || team.includes("brandon"))
        ? intradayData.break_even.medicare
        : intradayData.break_even.aca;
      return a.sla_hr < be && a.hours_worked > 0;
    }).length;
    return { ...t, aboveBE, belowBE };
  }, [intradayData]);

  // Hourly SLA deltas for sparkline
  const intradayHourlyDeltas = useMemo(() => {
    const trend = intradayData?.hourly_trend;
    if (!trend || trend.length === 0) return [];
    return trend.map((h, i) => ({
      hour: h.hour,
      sla_delta: i === 0 ? h.sla_total : h.sla_total - trend[i - 1].sla_total,
      sla_total: h.sla_total,
    }));
  }, [intradayData]);

  const todayRevenue = retreaver?.today_revenue ?? 0;
  const periodRevenue = period?.revenue ?? 0;
  const periodCost = period?.cost ?? 0;
  const periodProfit = period?.profit ?? 0;
  const marginPct = period?.margin_pct ?? 0;
  const activeAgents = hasLiveData
    ? (liveMetrics?.agents_active ?? 0) + (liveMetrics?.agents_on_break ?? 0)
    : (period?.agent_count ?? 0);

  return (
    <div className="font-mono">
      <PeriodLabel title="EXECUTIVE DASHBOARD" />
      <div className="p-4 space-y-4">
      {/* Revenue Hero */}
      <div className="bg-[#0f1923] border border-[#243044] rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${retreaver ? "bg-emerald-500 animate-pulse" : "bg-white/20"}`} />
            <span className={`text-[11px] tracking-widest uppercase ${retreaver ? "text-emerald-400" : "text-white/60"}`}>
              {retreaver ? "LIVE REVENUE" : "REVENUE — AWAITING LIVE DATA"}
            </span>
          </div>
          {retreaver && (
            <span className="text-[11px] text-white/50 tabular-nums">
              {retreaver.calls_per_minute.toFixed(1)} calls/min
            </span>
          )}
        </div>

        <div className="grid grid-cols-5 gap-6">
          <div>
            <div className="text-[11px] text-white/60 mb-1 tracking-wider">TODAY</div>
            <div className="text-3xl font-bold text-emerald-400 tabular-nums">
              {loading ? "---" : fmt(todayRevenue)}
            </div>
            {retreaver && (
              <div className="text-[11px] text-white/60 mt-1">
                {num(retreaver.today_calls)} calls &middot; {num(retreaver.converted ?? 0)} conv &middot; {fmt(retreaver.avg_per_call, 2)}/conv
                {retreaver.avg_per_call_diluted != null && (
                  <span className="text-white/35 ml-1">({fmt(retreaver.avg_per_call_diluted, 2)}/all)</span>
                )}
                {retreaver.avg_call_duration_secs != null && (
                  <span className="text-white/35 ml-1">&middot; {Math.floor(retreaver.avg_call_duration_secs / 60)}m {Math.round(retreaver.avg_call_duration_secs % 60)}s avg</span>
                )}
              </div>
            )}
            {retreaver?.top_campaigns_today?.length ? (
              <div className="text-[11px] text-white/50 mt-1 flex items-center gap-3">
                {retreaver.top_campaigns_today.map((c) => (
                  <span key={c.campaign}>
                    <span className="text-white/60">{c.campaign}:</span>{" "}
                    <span className="text-emerald-400/80 tabular-nums">{fmt(c.revenue)}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <div className="text-[11px] text-white/60 mb-1 tracking-wider">
              PERIOD REVENUE
              <CertaintyDot info={period?.certainty?.revenue} />
            </div>
            <div className="text-2xl font-bold text-white tabular-nums">
              {loading ? "---" : fmt(periodRevenue)}
            </div>
            {!loading && (period?.revenue_days_actual ?? 0) > 0 && (
              <div className="text-[11px] text-white/50 mt-1">
                {period?.revenue_days_actual}d actual of {period?.revenue_days_projected}d
              </div>
            )}
          </div>
          <div>
            <div className="text-[11px] text-amber-400/80 mb-1 tracking-wider">
              EST. REVENUE
              <CertaintyDot info={period?.certainty?.estimated_revenue} />
            </div>
            <div className="text-2xl font-bold text-amber-400 tabular-nums">
              {loading ? "---" : fmt(period?.estimated_revenue ?? 0)}
            </div>
            {!loading && (period?.estimated_revenue ?? 0) > 0 && (
              <div className={`text-[11px] mt-1 ${(period?.estimated_margin_pct ?? 0) >= 0 ? "text-emerald-400/80" : "text-red-400/80"}`}>
                {(period?.estimated_margin_pct ?? 0).toFixed(1)}% est. margin
              </div>
            )}
          </div>
          <div>
            <div className="text-[11px] text-white/60 mb-1 tracking-wider">
              PERIOD COST
              <CertaintyDot info={period?.certainty?.total_cost} />
            </div>
            <div className="text-2xl font-bold text-red-400 tabular-nums">
              {loading ? "---" : fmt(periodCost)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-white/60 mb-1 tracking-wider">EST. PROFIT</div>
            <div
              className={`text-2xl font-bold tabular-nums ${(period?.estimated_profit ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {loading ? "---" : fmt(period?.estimated_profit ?? 0)}
            </div>
            {!loading && periodRevenue > 0 && (
              <div className="text-[11px] text-white/50 mt-1">
                actual: {fmt(periodProfit)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Intraday Pulse Strip */}
      {!intradayLoading && intradayStats && (
        <div className="bg-[#0f1923] border border-[#1a2332] rounded-lg px-4 py-3 flex items-center gap-4">
          {/* Sparkline */}
          {intradayHourlyDeltas.length > 1 && (
            <div className="flex items-end gap-[2px] h-[32px] shrink-0">
              {intradayHourlyDeltas.map((h) => {
                const maxDelta = Math.max(...intradayHourlyDeltas.map((d) => d.sla_delta), 1);
                return (
                  <div
                    key={h.hour}
                    className="w-[6px] bg-cyan-500/60 rounded-t hover:bg-cyan-400/80 transition-colors"
                    style={{ height: `${Math.max((h.sla_delta / maxDelta) * 100, 10)}%` }}
                    title={`${h.hour > 12 ? h.hour - 12 : h.hour}${h.hour >= 12 ? "PM" : "AM"}: +${h.sla_delta} SLA (${h.sla_total} total)`}
                  />
                );
              })}
            </div>
          )}

          {/* Summary Stats */}
          <div className="flex items-center gap-5 text-[11px] flex-1">
            <div className="flex items-center gap-1.5">
              <BarChart2 size={12} className="text-cyan-400/70" />
              <span className="text-white/70 tracking-wider uppercase">Intraday</span>
            </div>
            <div>
              <span className="text-white/50">SLA: </span>
              <span className="text-cyan-400 font-bold tabular-nums">{num(intradayStats.sla_total)}</span>
            </div>
            <div>
              <span className="text-white/50">Agents: </span>
              <span className="text-white/80 tabular-nums">{intradayStats.active_agents}</span>
            </div>
            <div>
              <span className="text-white/50">Avg SLA/hr: </span>
              <span className="text-white/80 tabular-nums">{intradayStats.avg_sla_hr.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-emerald-400/80 tabular-nums">{intradayStats.aboveBE}</span>
              <span className="text-white/40"> above B/E</span>
              <span className="text-white/20 mx-1">|</span>
              <span className="text-red-400/80 tabular-nums">{intradayStats.belowBE}</span>
              <span className="text-white/40"> below</span>
            </div>
            {intradayData?.totals?.total_labor_cost != null && (
              <>
                <div className="w-px h-4 bg-white/10" />
                <div className="flex items-center gap-1">
                  <DollarSign size={10} className="text-amber-400/70" />
                  <span className="text-white/50">Cost: </span>
                  <span className="text-amber-400 font-bold tabular-nums">{fmt(intradayData.totals.total_labor_cost)}</span>
                </div>
                <div>
                  <span className="text-white/50">Rev: </span>
                  <span className="text-cyan-400 font-bold tabular-nums">{fmt(intradayData.totals.total_revenue_est ?? 0)}</span>
                </div>
                <div>
                  <span className="text-white/50">P&L: </span>
                  <span className={`font-bold tabular-nums ${(intradayData.totals.live_profit ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmt(intradayData.totals.live_profit ?? 0)}
                  </span>
                </div>
                <div>
                  <span className="text-white/50">$/SLA: </span>
                  <span className="text-white/80 tabular-nums">${(intradayData.totals.avg_cost_per_sla ?? 0).toFixed(2)}</span>
                </div>
              </>
            )}
          </div>

          {/* Freshness */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className={`w-1.5 h-1.5 rounded-full ${intradayData?.stale ? "bg-amber-400" : "bg-emerald-500 animate-pulse"}`} />
            <span className="text-[10px] text-white/40 tabular-nums">
              {intradayData?.latest_snapshot_at
                ? new Date(intradayData.latest_snapshot_at).toLocaleTimeString("en-US", {
                    timeZone: "America/New_York",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "---"}
              {intradayData?.stale && <span className="text-amber-400 ml-1">stale</span>}
            </span>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-6 gap-3">
        <KPICard
          label="SLA TODAY"
          value={hasLiveData
            ? num(liveMetrics?.total_transfers ?? 0)
            : intradayStats
              ? num(intradayStats.sla_total)
              : "---"}
          icon={<Zap size={14} />}
          accent="amber"
          live={hasLiveData || !!intradayStats}
          subtitle={hasLiveData && intradayStats ? `scraper: ${num(intradayStats.sla_total)}` : undefined}
        />
        <KPICard
          label="SLA PERIOD"
          value={loading ? "---" : num(period?.sla_transfers ?? 0)}
          icon={<Zap size={14} />}
          accent="cyan"
        />
        <KPICard
          label="ACTIVE AGENTS"
          value={hasLiveData
            ? num((liveMetrics?.agents_active ?? 0) + (liveMetrics?.agents_on_break ?? 0))
            : intradayStats
              ? num(intradayStats.active_agents)
              : loading ? "---" : num(period?.agent_count ?? 0)}
          icon={<Users size={14} />}
          accent="emerald"
          live={hasLiveData || !!intradayStats}
        />
        <KPICard
          label="ON BREAK"
          value={hasLiveData ? num(liveMetrics?.agents_on_break ?? 0) : "---"}
          icon={<Radio size={14} />}
          accent={hasLiveData ? "orange" : "gray"}
          live={hasLiveData}
        />
        <KPICard
          label="AVG SLA/hr"
          value={intradayStats
            ? intradayStats.avg_sla_hr.toFixed(2)
            : loading ? "---" : (period?.avg_tph ?? 0).toFixed(2)}
          icon={<Activity size={14} />}
          accent="cyan"
          live={!!intradayStats}
          subtitle={intradayStats && period ? `period: ${(period.avg_tph ?? 0).toFixed(2)}` : undefined}
        />
        <KPICard
          label="vs B/E (ACA)"
          value={(() => {
            const slaHr = intradayStats ? intradayStats.avg_sla_hr : (period?.avg_tph ?? 0);
            const be = intradayData?.break_even?.aca ?? 2.5;
            const delta = slaHr - be;
            return loading && !intradayStats ? "---" : `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;
          })()}
          icon={<Activity size={14} />}
          accent={(() => {
            const slaHr = intradayStats ? intradayStats.avg_sla_hr : (period?.avg_tph ?? 0);
            const be = intradayData?.break_even?.aca ?? 2.5;
            return slaHr >= be ? "emerald" : "red";
          })()}
        />
      </div>

      {/* Bottom: Top Agents + Dialer Status */}
      <div className="grid grid-cols-3 gap-3">
        {/* Top Revenue Agents */}
        <div className="col-span-2 bg-[#0f1923] border border-[#243044] rounded-lg p-4">
          <div className="text-[11px] text-white/60 tracking-widest uppercase mb-3">
            TOP REVENUE AGENTS (PERIOD)
          </div>
          {loading ? (
            <div className="text-white/35 text-xs">Loading...</div>
          ) : !period?.top_agents?.length ? (
            <div className="text-white/35 text-xs">No Retreaver data for selected period</div>
          ) : (
            <div className="space-y-2">
              {period.top_agents.map((agent, i) => (
                <div key={agent.name} className="flex items-center gap-3 text-xs">
                  <span className="text-white/50 w-4 text-right tabular-nums">{i + 1}</span>
                  <span className="text-white/90 flex-1 truncate">{agent.name}</span>
                  <span className="text-white/60 tabular-nums">{num(agent.transfers)} calls</span>
                  <span className="text-emerald-400 tabular-nums font-medium w-20 text-right">
                    {fmt(agent.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dialer Status */}
        <div className="bg-[#0f1923] border border-[#243044] rounded-lg p-4">
          <div className="text-[11px] text-white/60 tracking-widest uppercase mb-3">
            DIALER STATUS
          </div>

          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <div
                className={`w-2 h-2 rounded-full ${hasLiveData ? "bg-emerald-500 animate-pulse" : "bg-white/20"}`}
              />
              <span className="text-xs text-white/85">DialedIn (Chase)</span>
              <span
                className={`text-[11px] ml-auto ${hasLiveData ? "text-emerald-400" : "text-white/50"}`}
              >
                {hasLiveData ? "CONNECTED" : "AWAITING DATA"}
              </span>
            </div>
            {hasLiveData && (
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <div className="text-white/60">Active</div>
                  <div className="text-emerald-400 font-medium">
                    {liveMetrics?.agents_active ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-white/60">Break</div>
                  <div className="text-orange-400 font-medium">
                    {liveMetrics?.agents_on_break ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-white/60">SLA/hr</div>
                  <div className="text-amber-400 font-medium">
                    {liveMetrics?.transfers_this_hour ?? 0}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-white/10" />
              <span className="text-xs text-white/60">TLD Dialer</span>
              <span className="text-[11px] ml-auto text-white/35">PENDING</span>
            </div>
            <div className="text-[11px] text-white/35 italic">Integration coming soon</div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function KPICard({
  label,
  value,
  icon,
  accent,
  live,
  subtitle,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
  live?: boolean;
  subtitle?: string;
}) {
  const colors: Record<string, { border: string; text: string }> = {
    amber: { border: "border-amber-500/20", text: "text-amber-400" },
    emerald: { border: "border-emerald-500/20", text: "text-emerald-400" },
    cyan: { border: "border-cyan-500/20", text: "text-cyan-400" },
    red: { border: "border-red-500/20", text: "text-red-400" },
    orange: { border: "border-orange-500/20", text: "text-orange-400" },
    gray: { border: "border-white/10", text: "text-white/60" },
  };

  const c = colors[accent] || colors.gray;

  return (
    <div className={`bg-[#0f1923] border ${c.border} rounded-lg p-3`}>
      <div className="flex items-center gap-1.5 mb-2">
        {live && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
        <span className={`${c.text} opacity-70`}>{icon}</span>
        <span className="text-[11px] text-white/60 tracking-widest uppercase">{label}</span>
      </div>
      <div className={`text-lg font-bold tabular-nums ${c.text}`}>{value}</div>
      {subtitle && <div className="text-[10px] text-white/40 mt-0.5 tabular-nums">{subtitle}</div>}
    </div>
  );
}

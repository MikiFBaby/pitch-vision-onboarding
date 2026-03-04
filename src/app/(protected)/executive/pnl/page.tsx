"use client";

import { useState, useEffect, useCallback } from "react";
import { useExecutiveFilters } from "@/context/ExecutiveFilterContext";
import { PeriodLabel } from "../layout";
import { fmt, num, pct } from "@/utils/format";
import type { PnLResponse, PnLBreakdown, PnLTrend } from "@/types/dialedin-types";

type ViewMode = "summary" | "by_campaign" | "by_agent" | "trend";

export default function PnLPage() {
  const { startDate, endDate, dateRange } = useExecutiveFilters();
  const [data, setData] = useState<PnLResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("summary");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const period = dateRange === "custom" ? `${startDate},${endDate}` : dateRange;
      // Only fetch the dimension we need
      const dim = view === "by_agent" ? "agent" : view === "by_campaign" ? "campaign" : "total";
      const res = await fetch(`/api/executive/pnl?period=${period}&dimension=${dim}`);
      if (res.ok) {
        const d = await res.json();
        setData({
          summary: d.summary,
          breakdown: d.breakdown || [],
          trend: d.trend || [],
        });
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, dateRange, view]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const s = data?.summary;
  const VIEWS: { key: ViewMode; label: string }[] = [
    { key: "summary", label: "SUMMARY" },
    { key: "by_campaign", label: "BY CAMPAIGN" },
    { key: "by_agent", label: "BY AGENT" },
    { key: "trend", label: "TREND" },
  ];

  return (
    <div className="font-mono">
      <PeriodLabel title="PROFIT & LOSS" />
      <div className="p-4 space-y-4">
      {/* P&L Banner */}
      <div className="bg-[#0f1923] border border-[#243044] rounded-lg p-5">
        <div className="text-[11px] text-white/60 tracking-widest mb-4">PROFIT & LOSS STATEMENT</div>
        <div className="grid grid-cols-7 gap-4">
          <PnLStat label="REVENUE" value={loading ? "---" : fmt(s?.revenue ?? 0)} accent="emerald" />
          <PnLStat label="LABOR" value={loading ? "---" : fmt(s?.labor_cost ?? 0)} accent="red" />
          <PnLStat label="DIALER" value={loading ? "---" : fmt(s?.dialer_cost ?? 0)} accent="amber" />
          <PnLStat label="SUBS" value={loading ? "---" : fmt(s?.subscription_cost ?? 0)} accent="cyan" />
          <PnLStat label="TOTAL COST" value={loading ? "---" : fmt(s?.total_cost ?? 0)} accent="red" />
          <PnLStat
            label="GROSS PROFIT"
            value={loading ? "---" : fmt(s?.gross_profit ?? 0)}
            accent={(s?.gross_profit ?? 0) >= 0 ? "emerald" : "red"}
            highlight
          />
          <PnLStat
            label="MARGIN"
            value={loading ? "---" : pct(s?.margin_pct ?? 0)}
            accent={(s?.margin_pct ?? 0) >= 0 ? "emerald" : "red"}
          />
        </div>
      </div>

      {/* Supplementary KPIs */}
      <div className="grid grid-cols-6 gap-3">
        <MiniStat label="BILLABLE CALLS" value={loading ? "---" : num(s?.billable_calls ?? 0)} />
        <MiniStat label="SLA TRANSFERS" value={loading ? "---" : num(s?.sla_transfers ?? 0)} />
        <MiniStat label="GROSS HRS" value={loading ? "---" : num(Math.round(s?.hours_worked ?? 0))} />
        <MiniStat label="PAID HRS" value={loading ? "---" : num(Math.round(s?.paid_hours ?? s?.hours_worked ?? 0))} />
        <MiniStat label="ACTIVE AGENTS" value={loading ? "---" : num(s?.agent_count ?? 0)} />
        <MiniStat label="ROI" value={loading ? "---" : pct(s?.roi_pct ?? 0)} accent={(s?.roi_pct ?? 0) >= 0 ? "emerald" : "red"} />
      </div>

      {/* Unmatched Agents Warning */}
      {!loading && (s?.unmatched_agents ?? 0) > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2.5 text-[11px] text-amber-400">
          <span className="font-medium">{s!.unmatched_agents} agent{s!.unmatched_agents === 1 ? "" : "s"}</span>
          {" "}with no wage data — labor cost may be understated.
          {s!.unmatched_agent_names?.length ? (
            <span className="text-amber-400/70 ml-1">
              ({s!.unmatched_agent_names.slice(0, 5).join(", ")}
              {s!.unmatched_agents > 5 ? `, +${s!.unmatched_agents - 5} more` : ""})
            </span>
          ) : null}
        </div>
      )}

      {/* View Navigation */}
      <div className="flex gap-0 border-b border-[#243044]">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`px-4 py-2 text-[11px] tracking-widest transition-colors ${
              view === v.key
                ? "text-amber-400 border-b-2 border-amber-500 bg-[#0f1a2d]"
                : "text-white/60 hover:text-white/75"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Summary View — Cost Breakdown Bar */}
      {view === "summary" && s && (
        <div className="space-y-4">
          {/* Visual cost breakdown */}
          <div className="bg-[#0f1923] border border-[#243044] rounded-lg p-4">
            <div className="text-[11px] text-white/60 tracking-widest mb-3">COST BREAKDOWN</div>
            <CostBar
              labor={s.labor_cost}
              dialer={s.dialer_cost}
              subs={s.subscription_cost}
              other={s.other_cost}
              total={s.total_cost}
            />
          </div>

          {/* Revenue vs Cost chart */}
          {data?.trend?.length ? (
            <div className="bg-[#0f1923] border border-[#243044] rounded-lg p-4">
              <div className="text-[11px] text-white/60 tracking-widest mb-3">DAILY P&L TREND</div>
              <TrendBars trend={data.trend} />
            </div>
          ) : null}
        </div>
      )}

      {/* Campaign Breakdown */}
      {view === "by_campaign" && (
        <BreakdownTable
          rows={data?.breakdown || []}
          dimensionLabel="CAMPAIGN"
          loading={loading}
        />
      )}

      {/* Agent Breakdown */}
      {view === "by_agent" && (
        <BreakdownTable
          rows={data?.breakdown || []}
          dimensionLabel="AGENT"
          loading={loading}
        />
      )}

      {/* Trend Table */}
      {view === "trend" && (
        <div className="bg-[#0f1923] border border-[#243044] rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#243044] text-[11px] text-white/60 tracking-wider">
                <th className="px-4 py-2 text-left">DATE</th>
                <th className="px-3 py-2 text-right">REVENUE</th>
                <th className="px-3 py-2 text-right">LABOR</th>
                <th className="px-3 py-2 text-right">TOTAL COST</th>
                <th className="px-3 py-2 text-right">PROFIT</th>
                <th className="px-3 py-2 text-right">MARGIN</th>
              </tr>
            </thead>
            <tbody>
              {(data?.trend || [])
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((t) => (
                  <tr key={t.date} className="border-b border-[#243044]/50 hover:bg-white/[0.04]">
                    <td className="px-4 py-2 text-white/85 tabular-nums">{t.date}</td>
                    <td className="px-3 py-2 text-right text-emerald-400 tabular-nums">{fmt(t.revenue)}</td>
                    <td className="px-3 py-2 text-right text-red-400/80 tabular-nums">{fmt(t.labor_cost)}</td>
                    <td className="px-3 py-2 text-right text-red-400 tabular-nums">{fmt(t.total_cost)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${t.gross_profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmt(t.gross_profit)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${t.margin_pct >= 0 ? "text-emerald-400/80" : "text-red-400/80"}`}>
                      {pct(t.margin_pct)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!data?.trend?.length && (
            <div className="py-8 text-center text-white/35 text-xs">No trend data</div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function PnLStat({
  label,
  value,
  accent,
  highlight,
}: {
  label: string;
  value: string;
  accent: string;
  highlight?: boolean;
}) {
  const c: Record<string, string> = {
    emerald: "text-emerald-400",
    red: "text-red-400",
    amber: "text-amber-400",
    cyan: "text-cyan-400",
  };
  return (
    <div className={highlight ? "border-l-2 border-emerald-500 pl-3" : ""}>
      <div className="text-[11px] text-white/60 tracking-widest mb-1">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${c[accent] || "text-white"}`}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-[#0f1923] border border-[#243044] rounded-lg p-3">
      <div className="text-[11px] text-white/60 tracking-widest mb-1">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${
        accent === "emerald" ? "text-emerald-400" : accent === "red" ? "text-red-400" : "text-white/90"
      }`}>
        {value}
      </div>
    </div>
  );
}

function CostBar({
  labor,
  dialer,
  subs,
  other,
  total,
}: {
  labor: number;
  dialer: number;
  subs: number;
  other: number;
  total: number;
}) {
  if (total === 0) return <div className="text-white/35 text-xs">No cost data</div>;

  const segments = [
    { label: "Labor", value: labor, color: "bg-red-500" },
    { label: "Dialer", value: dialer, color: "bg-amber-500" },
    { label: "Subs", value: subs, color: "bg-cyan-500" },
    { label: "Other", value: other, color: "bg-white/30" },
  ].filter((s) => s.value > 0);

  return (
    <div>
      <div className="flex h-6 rounded overflow-hidden mb-3">
        {segments.map((s) => (
          <div
            key={s.label}
            className={`${s.color} opacity-60 hover:opacity-100 transition-opacity relative group`}
            style={{ width: `${(s.value / total) * 100}%` }}
          >
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[#1e2d42] px-1.5 py-0.5 rounded text-[11px] text-white/75 hidden group-hover:block whitespace-nowrap z-10">
              {s.label}: {fmt(s.value)} ({((s.value / total) * 100).toFixed(0)}%)
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-4">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-[11px]">
            <div className={`w-2 h-2 rounded-sm ${s.color} opacity-60`} />
            <span className="text-white/60">{s.label}</span>
            <span className="text-white/75 tabular-nums">{((s.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendBars({ trend }: { trend: PnLTrend[] }) {
  const maxVal = Math.max(...trend.map((t) => Math.max(t.revenue, t.total_cost)), 1);

  return (
    <div className="flex items-end gap-1 h-40">
      {trend.map((t) => {
        const revH = (t.revenue / maxVal) * 100;
        const costH = (t.total_cost / maxVal) * 100;
        return (
          <div key={t.date} className="flex-1 flex items-end gap-px group relative">
            <div
              className="flex-1 bg-emerald-500/30 hover:bg-emerald-500/50 rounded-t transition-colors min-h-[2px]"
              style={{ height: `${revH}%` }}
            />
            <div
              className="flex-1 bg-red-500/30 hover:bg-red-500/50 rounded-t transition-colors min-h-[2px]"
              style={{ height: `${costH}%` }}
            />
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#1e2d42] px-1.5 py-0.5 rounded text-[11px] text-white/75 hidden group-hover:block whitespace-nowrap z-10">
              {t.date.slice(5)} &middot; Rev: {fmt(t.revenue)} &middot; Cost: {fmt(t.total_cost)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BreakdownTable({
  rows,
  dimensionLabel,
  loading,
}: {
  rows: PnLBreakdown[];
  dimensionLabel: string;
  loading: boolean;
}) {
  return (
    <div className="bg-[#0f1923] border border-[#243044] rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#243044] text-[11px] text-white/60 tracking-wider">
            <th className="px-4 py-2 text-left">{dimensionLabel}</th>
            <th className="px-3 py-2 text-right">REVENUE</th>
            <th className="px-3 py-2 text-right">LABOR</th>
            <th className="px-3 py-2 text-right">TOTAL COST</th>
            <th className="px-3 py-2 text-right">PROFIT</th>
            <th className="px-3 py-2 text-right">MARGIN</th>
            <th className="px-3 py-2 text-right">HOURS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.dimension_value} className="border-b border-[#243044]/50 hover:bg-white/[0.04]">
              <td className="px-4 py-2 text-white/85 capitalize truncate max-w-[200px]">
                {r.dimension_value || "Unknown"}
              </td>
              <td className="px-3 py-2 text-right text-emerald-400 tabular-nums">{fmt(r.revenue)}</td>
              <td className="px-3 py-2 text-right text-red-400/80 tabular-nums">{fmt(r.labor_cost)}</td>
              <td className="px-3 py-2 text-right text-red-400 tabular-nums">{fmt(r.total_cost)}</td>
              <td className={`px-3 py-2 text-right tabular-nums font-medium ${r.gross_profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {fmt(r.gross_profit)}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${r.margin_pct >= 0 ? "text-emerald-400/80" : "text-red-400/80"}`}>
                {pct(r.margin_pct)}
              </td>
              <td className="px-3 py-2 text-right text-white/60 tabular-nums">{num(Math.round(r.hours_worked))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && !loading && (
        <div className="py-8 text-center text-white/35 text-xs">No breakdown data</div>
      )}
    </div>
  );
}

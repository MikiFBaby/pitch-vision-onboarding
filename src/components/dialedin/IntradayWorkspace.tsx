"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Activity,
  Clock,
  Users,
  TrendingUp,
  ArrowUp,
  ArrowDown,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import type { IntradayData, IntradayAgentRow } from "@/types/dialedin-types";

type SortField = "name" | "team" | "sla_hr" | "transfers" | "hours_worked" | "connects_per_hour";
type SortDir = "asc" | "desc";

export default function IntradayWorkspace() {
  const [data, setData] = useState<IntradayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("sla_hr");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dialedin/intraday");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("[IntradayWorkspace] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120_000); // refresh every 2 min
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortedAgents = useMemo(() => {
    if (!data?.agents) return [];
    return [...data.agents].sort((a, b) => {
      const aVal = a[sortField] ?? "";
      const bVal = b[sortField] ?? "";
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [data?.agents, sortField, sortDir]);

  // Freshness indicator color
  const freshnessColor = useMemo(() => {
    if (!data?.latest_snapshot_at) return "bg-red-500";
    const mins = data.minutes_since_update;
    if (mins <= 5) return "bg-emerald-500";
    if (mins <= 35) return "bg-amber-400";
    return "bg-red-500";
  }, [data]);

  // Compute hourly deltas for the bar chart
  const hourlyDeltas = useMemo(() => {
    if (!data?.hourly_trend || data.hourly_trend.length === 0) return [];
    const trend = data.hourly_trend;
    return trend.map((h, i) => ({
      hour: h.hour,
      sla_delta: i === 0 ? h.sla_total : h.sla_total - trend[i - 1].sla_total,
      sla_cumulative: h.sla_total,
      hours_delta: i === 0 ? h.production_hours : h.production_hours - trend[i - 1].production_hours,
      agent_count: h.agent_count,
    }));
  }, [data?.hourly_trend]);

  const maxSlaDelta = useMemo(
    () => Math.max(...hourlyDeltas.map((h) => h.sla_delta), 1),
    [hourlyDeltas],
  );

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {/* Skeleton KPI cards */}
        <div className="grid grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 bg-[#0f1923] border border-[#1a2332] animate-pulse rounded" />
          ))}
        </div>
        <div className="h-48 bg-[#0f1923] border border-[#1a2332] animate-pulse rounded" />
        <div className="h-64 bg-[#0f1923] border border-[#1a2332] animate-pulse rounded" />
      </div>
    );
  }

  if (!data || !data.latest_snapshot_at) {
    return (
      <div className="flex items-center justify-center h-64 text-white/30 text-sm font-mono">
        No intraday data available. Scraper may not have run yet today.
      </div>
    );
  }

  const { totals, break_even } = data;
  const avgBreakEven = (break_even.aca + break_even.medicare) / 2;

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      {/* Stale data warning */}
      {data.stale && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-400/10 border border-amber-400/30 rounded text-amber-400 text-xs font-mono">
          <AlertTriangle size={12} />
          Data is {data.minutes_since_update}m old. Scraper may be delayed.
        </div>
      )}

      {/* KPI Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard
          label="SLA TODAY"
          value={totals.sla_total.toLocaleString()}
          icon={<TrendingUp size={14} />}
          accent="emerald"
          live
        />
        <KPICard
          label="PRODUCTION HRS"
          value={totals.production_hours.toFixed(1)}
          icon={<Clock size={14} />}
          accent="cyan"
        />
        <KPICard
          label="ACTIVE AGENTS"
          value={totals.active_agents.toString()}
          icon={<Users size={14} />}
          accent="blue"
        />
        <KPICard
          label="AVG SLA/HR"
          value={totals.avg_sla_hr.toFixed(2)}
          icon={<Activity size={14} />}
          accent={(totals.team_sla_hr ?? totals.avg_sla_hr) >= avgBreakEven ? "emerald" : "red"}
        />
        <KPICard
          label="TEAM SLA/HR"
          value={(totals.team_sla_hr ?? totals.avg_sla_hr).toFixed(2)}
          icon={<TrendingUp size={14} />}
          accent={(totals.team_sla_hr ?? totals.avg_sla_hr) >= avgBreakEven ? "emerald" : "red"}
          subtitle={`BE: ${avgBreakEven.toFixed(1)}`}
        />
        <KPICard
          label="LAST UPDATE"
          value={
            data.latest_snapshot_at
              ? new Date(data.latest_snapshot_at).toLocaleTimeString("en-US", {
                  timeZone: "America/New_York",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "---"
          }
          icon={<Clock size={14} />}
          accent="amber"
          freshness={freshnessColor}
        />
      </div>

      {/* Hourly SLA Trend Chart */}
      <div className="bg-[#0f1923] border border-[#1a2332] rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-mono font-bold text-white/50 uppercase tracking-wider">
            Hourly SLA Accumulation (ET)
          </h3>
          <span className="text-[10px] font-mono text-white/30">
            {hourlyDeltas.length} snapshots
          </span>
        </div>
        {hourlyDeltas.length > 0 ? (
          <div className="flex items-end gap-1 h-32">
            {hourlyDeltas.map((h) => (
              <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                {/* Bar */}
                <div className="w-full flex flex-col items-center justify-end h-24">
                  <span className="text-[9px] font-mono text-emerald-400/80 mb-0.5">
                    {h.sla_delta > 0 ? `+${h.sla_delta}` : ""}
                  </span>
                  <div
                    className="w-full max-w-[40px] bg-emerald-500/60 hover:bg-emerald-500/80 transition-colors rounded-t"
                    style={{
                      height: `${Math.max((h.sla_delta / maxSlaDelta) * 80, 2)}%`,
                    }}
                  />
                </div>
                {/* Hour label */}
                <span className="text-[9px] font-mono text-white/30">
                  {h.hour > 12 ? h.hour - 12 : h.hour}{h.hour >= 12 ? "p" : "a"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-24 text-white/20 text-xs font-mono">
            Waiting for first snapshot...
          </div>
        )}
        {/* Cumulative line summary */}
        {hourlyDeltas.length > 1 && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#1a2332]">
            <span className="text-[10px] font-mono text-white/30">Cumulative</span>
            <div className="flex items-center gap-3">
              {hourlyDeltas.map((h) => (
                <span key={h.hour} className="text-[9px] font-mono text-amber-400/60">
                  {h.sla_cumulative}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Agent Breakdown Table */}
      <div className="bg-[#0f1923] border border-[#1a2332] rounded overflow-hidden">
        <div className="px-4 py-2 border-b border-[#1a2332]">
          <h3 className="text-[11px] font-mono font-bold text-white/50 uppercase tracking-wider">
            Agent Breakdown ({sortedAgents.length} agents)
          </h3>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs font-mono">
            <thead className="sticky top-0 z-10 bg-[#0c1018]">
              <tr className="border-b border-[#1a2332]">
                <SortHeader field="name" label="Agent" current={sortField} dir={sortDir} onClick={handleSort} align="left" />
                <SortHeader field="team" label="Team" current={sortField} dir={sortDir} onClick={handleSort} align="left" />
                <SortHeader field="sla_hr" label="SLA/hr" current={sortField} dir={sortDir} onClick={handleSort} />
                <SortHeader field="transfers" label="SLAs" current={sortField} dir={sortDir} onClick={handleSort} />
                <SortHeader field="hours_worked" label="Hours" current={sortField} dir={sortDir} onClick={handleSort} />
                <SortHeader field="connects_per_hour" label="CPH" current={sortField} dir={sortDir} onClick={handleSort} />
                <th className="px-3 py-2 text-right text-white/30 uppercase text-[9px]">Conv%</th>
              </tr>
            </thead>
            <tbody>
              {sortedAgents.map((agent) => {
                const belowBreakEven = agent.sla_hr < avgBreakEven && agent.hours_worked > 0.3;
                const topPerformer = agent.sla_hr >= avgBreakEven * 1.5;
                return (
                  <tr
                    key={agent.name}
                    className="border-b border-[#1a2332]/50 hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="px-3 py-1.5 text-white/80 whitespace-nowrap">
                      {agent.name}
                      {agent.is_new_hire && (
                        <span className="ml-1.5 px-1 py-0.5 text-[8px] bg-cyan-500/20 text-cyan-400 rounded">
                          NEW
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-white/40 whitespace-nowrap">
                      {agent.team || "—"}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right tabular-nums ${
                        topPerformer
                          ? "text-emerald-400 font-bold"
                          : belowBreakEven
                            ? "text-red-400"
                            : "text-white/70"
                      }`}
                    >
                      {agent.sla_hr.toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-white/70 tabular-nums">
                      {agent.transfers}
                    </td>
                    <td className="px-3 py-1.5 text-right text-white/70 tabular-nums">
                      {agent.hours_worked.toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-white/70 tabular-nums">
                      {agent.connects_per_hour.toFixed(1)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-white/50 tabular-nums">
                      {agent.conversion_rate_pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────

function KPICard({
  label,
  value,
  icon,
  accent,
  subtitle,
  live,
  freshness,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
  subtitle?: string;
  live?: boolean;
  freshness?: string;
}) {
  const accentColors: Record<string, string> = {
    emerald: "text-emerald-400 border-emerald-500/30",
    cyan: "text-cyan-400 border-cyan-500/30",
    blue: "text-blue-400 border-blue-500/30",
    amber: "text-amber-400 border-amber-500/30",
    red: "text-red-400 border-red-500/30",
  };
  const colors = accentColors[accent] || accentColors.amber;
  const [textColor] = colors.split(" ");

  return (
    <div className={`bg-[#0f1923] border border-[#1a2332] rounded p-3 relative`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-mono font-bold text-white/30 uppercase tracking-wider">
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          {live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          {freshness && <span className={`w-1.5 h-1.5 rounded-full ${freshness}`} />}
          <span className="text-white/20">{icon}</span>
        </div>
      </div>
      <div className={`text-xl font-mono font-bold ${textColor} tabular-nums`}>{value}</div>
      {subtitle && (
        <span className="text-[9px] font-mono text-white/25 mt-0.5 block">{subtitle}</span>
      )}
    </div>
  );
}

function SortHeader({
  field,
  label,
  current,
  dir,
  onClick,
  align = "right",
}: {
  field: SortField;
  label: string;
  current: SortField;
  dir: SortDir;
  onClick: (f: SortField) => void;
  align?: "left" | "right";
}) {
  const active = current === field;
  return (
    <th
      className={`px-3 py-2 text-white/30 uppercase text-[9px] cursor-pointer hover:text-white/50 transition-colors select-none ${
        align === "left" ? "text-left" : "text-right"
      }`}
      onClick={() => onClick(field)}
    >
      <span className="flex items-center gap-0.5 justify-end">
        {align === "left" && label}
        {active && (
          dir === "asc" ? <ChevronUp size={10} className="text-amber-400" /> : <ChevronDown size={10} className="text-amber-400" />
        )}
        {align === "right" && label}
      </span>
    </th>
  );
}

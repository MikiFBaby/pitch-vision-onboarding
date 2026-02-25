"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown, Flag, AlertTriangle } from "lucide-react";
import { heatmapClass } from "@/utils/dialedin-heatmap";
import { getRevenuePerTransfer, isExcludedTeam } from "@/utils/dialedin-revenue";
import type { AgentPerformance, AgentTrend, AgentQAStats, LiveAgentStatus } from "@/types/dialedin-types";

function MiniSparkline({ data, trend }: { data: number[]; trend: "up" | "down" | "flat" }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 0.01);
  const min = Math.min(...data);
  const h = 16;
  const w = 40;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / (max - min || 1)) * h;
      return `${x},${y}`;
    })
    .join(" ");
  const color = trend === "up" ? "#10b981" : trend === "down" ? "#ef4444" : "#6b7280";
  return (
    <svg width={w} height={h}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

const STATUS_DOT_CLASSES: Record<string, string> = {
  available: "bg-emerald-500",
  on_call: "bg-amber-500 animate-pulse",
  wrap: "bg-blue-500",
  paused: "bg-orange-500",
};

interface AgentRankingTableProps {
  agents: AgentPerformance[];
  selectedTeam: string | null;
  onSelectAgent: (agent: AgentPerformance) => void;
  loading?: boolean;
  wages?: Record<string, number>;
  sparklines?: Record<string, AgentTrend>;
  qaStats?: Record<string, AgentQAStats>;
  liveStatuses?: Record<string, LiveAgentStatus>;
}

type SortKey =
  | "tph"
  | "transfers"
  | "conversion_rate"
  | "dials"
  | "connects"
  | "connect_rate"
  | "hours_worked"
  | "talk_time_min"
  | "waitWrap"
  | "utilization"
  | "revenue"
  | "cost"
  | "pnl"
  | "revPerHour"
  | "qaScore";

type BoardMode = "top" | "bottom";

export default function AgentRankingTable({
  agents,
  selectedTeam,
  onSelectAgent,
  loading,
  wages,
  sparklines,
  qaStats,
  liveStatuses,
}: AgentRankingTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("tph");
  const [sortAsc, setSortAsc] = useState(false);
  const [showCount, setShowCount] = useState(50);
  const [boardMode, setBoardMode] = useState<BoardMode>("top");

  // Filter out excluded teams as safety net
  const validAgents = useMemo(
    () => agents.filter((a) => !isExcludedTeam(a.team || null)),
    [agents],
  );

  const filtered = useMemo(() => {
    let list = selectedTeam
      ? validAgents.filter((a) => (a.team || "Unassigned") === selectedTeam)
      : validAgents;

    // Bottom board: only agents with >= 2 hours (meaningful sample)
    if (boardMode === "bottom") {
      list = list.filter((a) => a.hours_worked >= 2);
    }

    return list;
  }, [validAgents, selectedTeam, boardMode]);

  // Bottom 10% TPH threshold
  const bottom10Threshold = useMemo(() => {
    const qualified = validAgents.filter((a) => a.hours_worked >= 2);
    if (qualified.length === 0) return 0;
    const sorted = [...qualified].sort((a, b) => a.tph - b.tph);
    return sorted[Math.floor(sorted.length * 0.1)]?.tph || 0;
  }, [validAgents]);

  const getUtilization = (a: AgentPerformance) =>
    a.logged_in_time_min > 0
      ? ((a.talk_time_min + a.wait_time_min + a.wrap_time_min) / a.logged_in_time_min) * 100
      : 0;

  const getWaitWrap = (a: AgentPerformance) => a.wait_time_min + a.wrap_time_min;

  const getRevenue = (a: AgentPerformance) =>
    a.transfers * getRevenuePerTransfer(a.team || null);

  const getCost = (a: AgentPerformance) => {
    const wage = wages?.[a.agent_name];
    return wage != null ? a.hours_worked * wage : null;
  };

  const getPnL = (a: AgentPerformance) => {
    const rev = getRevenue(a);
    const cost = getCost(a);
    return cost != null ? rev - cost : null;
  };

  const getRevPerHour = (a: AgentPerformance) =>
    a.hours_worked > 0 ? getRevenue(a) / a.hours_worked : 0;

  // Normalized QA lookup: try exact name, then trimmed, then lowercase
  const findQA = (name: string): AgentQAStats | undefined => {
    if (!qaStats) return undefined;
    return qaStats[name] || qaStats[name.trim()] || qaStats[name.trim().toLowerCase()];
  };

  const getSortValue = (a: AgentPerformance, key: SortKey): number => {
    if (key === "utilization") return getUtilization(a);
    if (key === "waitWrap") return getWaitWrap(a);
    if (key === "revenue") return getRevenue(a);
    if (key === "cost") return getCost(a) ?? 0;
    if (key === "pnl") return getPnL(a) ?? 0;
    if (key === "revPerHour") return getRevPerHour(a);
    if (key === "qaScore") return findQA(a.agent_name)?.avg_score ?? -1;
    return (a[key as keyof AgentPerformance] as number) ?? 0;
  };

  const sorted = useMemo(() => {
    const defaultAsc = boardMode === "bottom" && sortKey === "tph";
    const direction = sortKey === "tph" && !sortAsc ? defaultAsc : sortAsc;

    return [...filtered].sort((a, b) => {
      const aVal = getSortValue(a, sortKey);
      const bVal = getSortValue(b, sortKey);
      return direction ? aVal - bVal : bVal - aVal;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortAsc, boardMode, wages, qaStats]);

  const visible = sorted.slice(0, showCount);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const handleBoardToggle = (mode: BoardMode) => {
    setBoardMode(mode);
    setShowCount(50);
    if (mode === "bottom") {
      setSortKey("tph");
      setSortAsc(true);
    } else {
      setSortKey("tph");
      setSortAsc(false);
    }
  };

  const SortHeader = ({ label, field, className }: { label: string; field: SortKey; className?: string }) => (
    <th
      className={`py-1 px-1 cursor-pointer select-none hover:text-white/40 text-right ${className || ""}`}
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-0.5 justify-end">
        {label}
        <ArrowUpDown size={8} className={sortKey === field ? "text-amber-400" : "text-white/15"} />
      </span>
    </th>
  );

  const fmtMoney = (val: number | null) => {
    if (val == null) return "—";
    return `$${val.toFixed(0)}`;
  };

  if (loading) {
    return (
      <div className="flex-1 bg-[#0c1018] border border-[#1a2332] flex items-center justify-center">
        <div className="h-[200px] w-full animate-pulse bg-white/[0.02]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#0c1018] border border-[#1a2332]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a2332] shrink-0">
        <div className="flex items-center gap-2">
          {/* Board Mode Toggle */}
          <div className="flex items-center bg-[#050a12] border border-[#1a2332]">
            <button
              onClick={() => handleBoardToggle("top")}
              className={`px-2 py-0.5 text-[9px] uppercase tracking-wider font-mono font-bold transition-colors ${
                boardMode === "top"
                  ? "bg-emerald-500/20 text-emerald-400 border-r border-[#1a2332]"
                  : "text-white/30 hover:text-white/50 border-r border-[#1a2332]"
              }`}
            >
              Top
            </button>
            <button
              onClick={() => handleBoardToggle("bottom")}
              className={`px-2 py-0.5 text-[9px] uppercase tracking-wider font-mono font-bold transition-colors ${
                boardMode === "bottom"
                  ? "bg-red-500/20 text-red-400"
                  : "text-white/30 hover:text-white/50"
              }`}
            >
              Bottom
            </button>
          </div>
          <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">
            {boardMode === "top" ? "Leaderboard" : "Coaching Targets"}
          </span>
          {selectedTeam && (
            <span className="text-[9px] text-amber-400/60 font-mono">
              [{selectedTeam}]
            </span>
          )}
        </div>
        <span className="text-[9px] text-white/20 font-mono">
          {filtered.length} agents
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-[#0c1018] z-10">
            <tr className="text-[9px] uppercase tracking-wider text-white/25 font-mono border-b border-[#1a2332]">
              <th className="text-left py-1 px-2 w-7">#</th>
              <th className="text-left py-1 px-1"></th>
              {liveStatuses && Object.keys(liveStatuses).length > 0 && (
                <th className="py-1 px-0 w-3"></th>
              )}
              <th className="text-left py-1 px-1">Agent</th>
              <th className="text-left py-1 px-1">Team</th>
              {sparklines && Object.keys(sparklines).length > 0 && (
                <th className="text-center py-1 px-1 w-[44px]">30d</th>
              )}
              <SortHeader label="SLA/hr" field="tph" />
              <SortHeader label="SLA" field="transfers" />
              <SortHeader label="Conv%" field="conversion_rate" />
              <SortHeader label="Dials" field="dials" />
              <SortHeader label="Conn" field="connects" />
              <SortHeader label="Conn%" field="connect_rate" />
              <SortHeader label="Hrs" field="hours_worked" />
              <SortHeader label="Talk" field="talk_time_min" />
              <SortHeader label="W+W" field="waitWrap" />
              <SortHeader label="Util%" field="utilization" />
              <SortHeader label="Rev$" field="revenue" />
              <SortHeader label="Cost$" field="cost" />
              <SortHeader label="P&L" field="pnl" />
              <SortHeader label="$/hr" field="revPerHour" />
              {qaStats && Object.keys(qaStats).length > 0 && (
                <SortHeader label="QA" field="qaScore" />
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((agent, i) => {
              const util = getUtilization(agent);
              const isZeroTransfer = agent.transfers === 0 && agent.hours_worked >= 2;
              const isBottom10 = agent.hours_worked >= 2 && agent.tph <= bottom10Threshold && agent.tph > 0;

              const revenue = getRevenue(agent);
              const cost = getCost(agent);
              const pnl = getPnL(agent);
              const revPerHr = getRevPerHour(agent);

              const rank = boardMode === "bottom" ? i + 1 : (agent.tph_rank || i + 1);

              return (
                <tr
                  key={agent.id || `${agent.agent_name}-${i}`}
                  onClick={() => onSelectAgent(agent)}
                  className="border-b border-[#1a2332]/30 hover:bg-white/[0.03] cursor-pointer transition-colors h-7"
                >
                  <td className="py-0.5 px-2 text-white/25 font-mono text-[10px]">
                    {rank}
                  </td>
                  <td className="py-0.5 px-1 w-4">
                    {isZeroTransfer && <Flag size={10} className="text-red-400" />}
                    {isBottom10 && !isZeroTransfer && <AlertTriangle size={10} className="text-amber-400" />}
                  </td>
                  {liveStatuses && Object.keys(liveStatuses).length > 0 && (() => {
                    const live = liveStatuses[agent.agent_name.toLowerCase()];
                    const dotClass = live ? STATUS_DOT_CLASSES[live.current_status] : null;
                    return (
                      <td className="py-0.5 px-0 w-3">
                        {dotClass && (
                          <span
                            className={`inline-block w-2 h-2 rounded-full ${dotClass}`}
                            title={`${live.current_status}${live.current_campaign ? ` — ${live.current_campaign}` : ""}${live.break_code ? ` (${live.break_code})` : ""}`}
                          />
                        )}
                      </td>
                    );
                  })()}
                  <td className="py-0.5 px-1 text-white/90 font-mono font-medium truncate max-w-[130px]">
                    {agent.agent_name}
                  </td>
                  <td className="py-0.5 px-1 text-white/30 font-mono truncate max-w-[80px] text-[10px]">
                    {agent.team || "—"}
                  </td>
                  {sparklines && Object.keys(sparklines).length > 0 && (
                    <td className="py-0.5 px-1">
                      {sparklines[agent.agent_name] ? (
                        <MiniSparkline
                          data={sparklines[agent.agent_name].sparkline}
                          trend={sparklines[agent.agent_name].trend}
                        />
                      ) : null}
                    </td>
                  )}
                  <td className={`py-0.5 px-1 text-right font-mono font-bold ${heatmapClass(agent.tph, "tph")}`}>
                    {agent.tph.toFixed(2)}
                  </td>
                  <td className="py-0.5 px-1 text-right font-mono text-white/70">
                    {agent.transfers}
                  </td>
                  <td className={`py-0.5 px-1 text-right font-mono ${heatmapClass(agent.conversion_rate, "conversion")}`}>
                    {agent.conversion_rate.toFixed(1)}%
                  </td>
                  <td className="py-0.5 px-1 text-right font-mono text-white/50">
                    {agent.dials.toLocaleString()}
                  </td>
                  <td className="py-0.5 px-1 text-right font-mono text-white/50">
                    {agent.connects.toLocaleString()}
                  </td>
                  <td className={`py-0.5 px-1 text-right font-mono ${heatmapClass(agent.connect_rate, "connect")}`}>
                    {agent.connect_rate.toFixed(1)}%
                  </td>
                  <td className="py-0.5 px-1 text-right font-mono text-white/50">
                    {agent.hours_worked.toFixed(1)}
                  </td>
                  <td className="py-0.5 px-1 text-right font-mono text-white/40">
                    {agent.talk_time_min.toFixed(0)}m
                  </td>
                  <td className="py-0.5 px-1 text-right font-mono text-white/40">
                    {(agent.wait_time_min + agent.wrap_time_min).toFixed(0)}m
                  </td>
                  <td className={`py-0.5 px-1 text-right font-mono ${heatmapClass(util, "utilization")}`}>
                    {util.toFixed(0)}%
                  </td>
                  {/* Revenue */}
                  <td className={`py-0.5 px-1 text-right font-mono ${
                    revenue > 50 ? "text-emerald-400" : revenue > 0 ? "text-white/60" : "text-white/20"
                  }`}>
                    {fmtMoney(revenue)}
                  </td>
                  {/* Cost */}
                  <td className="py-0.5 px-1 text-right font-mono text-white/40">
                    {fmtMoney(cost)}
                  </td>
                  {/* P&L */}
                  <td className={`py-0.5 px-1 text-right font-mono font-bold ${
                    pnl == null ? "text-white/20" : pnl >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}>
                    {fmtMoney(pnl)}
                  </td>
                  {/* Rev/hr */}
                  <td className={`py-0.5 px-1 text-right font-mono ${
                    revPerHr >= 15 ? "text-emerald-400" : revPerHr >= 7 ? "text-white/60" : "text-white/30"
                  }`}>
                    ${revPerHr.toFixed(1)}
                  </td>
                  {/* QA Score */}
                  {qaStats && Object.keys(qaStats).length > 0 && (() => {
                    const qa = findQA(agent.agent_name);
                    if (!qa) return <td className="py-0.5 px-1 text-right font-mono text-white/15">—</td>;
                    return (
                      <td className={`py-0.5 px-1 text-right font-mono ${
                        qa.avg_score >= 70 ? "text-emerald-400" : qa.avg_score >= 40 ? "text-amber-400" : "text-red-400"
                      }`}>
                        {qa.avg_score}
                        {qa.auto_fail_count > 0 && (
                          <span className="text-red-400/60 text-[8px] ml-0.5">AF</span>
                        )}
                      </td>
                    );
                  })()}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Show More */}
      {filtered.length > showCount && (
        <div className="shrink-0 border-t border-[#1a2332]">
          <button
            onClick={() => setShowCount((c) => c + 50)}
            className="w-full py-1 text-[10px] text-white/25 hover:text-white/40 font-mono transition-colors"
          >
            SHOW MORE ({filtered.length - showCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}

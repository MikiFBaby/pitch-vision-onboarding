"use client";

import { useState } from "react";
import type { RosterAgent, RosterTeamSummary } from "@/types/dialedin-types";

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function BarSegment({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(Math.abs(value) / max * 100, 100) : 0;
  return (
    <div className="h-2 bg-white/5 rounded-full overflow-hidden w-full">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function TeamBreakdown({
  teams,
  agents,
  loading,
  onAgentClick,
}: {
  teams: RosterTeamSummary[];
  agents: RosterAgent[];
  loading: boolean;
  onAgentClick?: (agent: RosterAgent) => void;
}) {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-white/5 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const maxRevenue = Math.max(...teams.map((t) => t.total_revenue), 1);
  const maxCost = Math.max(...teams.map((t) => t.total_cost), 1);

  return (
    <div className="p-4 space-y-2">
      {/* Header */}
      <div className="grid grid-cols-8 gap-2 px-3 py-2 text-[10px] text-white/30 font-mono tracking-wider">
        <div className="col-span-2">TEAM</div>
        <div className="text-right">AGENTS</div>
        <div className="text-right">REVENUE</div>
        <div className="text-right">COST</div>
        <div className="text-right">NET P&L</div>
        <div className="text-right">AVG $/HR</div>
        <div className="text-right">AVG SLA/hr</div>
      </div>

      {teams.map((team) => {
        const isExpanded = expandedTeam === team.team;
        const teamAgents = agents
          .filter((a) => (a.team || "Unknown") === team.team)
          .sort((a, b) => b.pnl_per_hour - a.pnl_per_hour);
        const pnlColor = team.net_pnl >= 0 ? "text-emerald-400" : "text-red-400";
        const pnlBg = team.net_pnl >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20";

        return (
          <div key={team.team}>
            <button
              onClick={() => setExpandedTeam(isExpanded ? null : team.team)}
              className={`w-full grid grid-cols-8 gap-2 items-center px-3 py-3 rounded-lg border ${pnlBg} font-mono text-[11px] hover:brightness-110 transition-all text-left`}
            >
              <div className="col-span-2 flex flex-col">
                <span className="text-white font-semibold truncate">{team.team}</span>
                <div className="flex gap-2 mt-1">
                  <BarSegment value={team.total_revenue} max={maxRevenue} color="bg-emerald-500" />
                  <BarSegment value={team.total_cost} max={maxCost} color="bg-red-500" />
                </div>
              </div>
              <div className="text-right text-white/70">{team.agent_count}</div>
              <div className="text-right text-emerald-400">{fmt(team.total_revenue)}</div>
              <div className="text-right text-red-400">{fmt(team.total_cost)}</div>
              <div className={`text-right font-semibold ${pnlColor}`}>
                {team.net_pnl >= 0 ? "+" : ""}{fmt(team.net_pnl)}
              </div>
              <div className={`text-right ${pnlColor}`}>
                {team.avg_pnl_per_hour >= 0 ? "+" : ""}${team.avg_pnl_per_hour.toFixed(2)}
              </div>
              <div className="text-right text-white/70">{team.avg_tph.toFixed(2)}</div>
            </button>

            {/* Expanded agent list */}
            {isExpanded && teamAgents.length > 0 && (
              <div className="ml-6 mt-1 space-y-px">
                {teamAgents.map((a, i) => {
                  const aPnlColor = a.pnl >= 0 ? "text-emerald-400" : "text-red-400";
                  return (
                    <div
                      key={a.agent_name}
                      onClick={() => onAgentClick?.(a)}
                      className="grid grid-cols-8 gap-2 px-3 py-1.5 text-[10px] font-mono hover:bg-white/[0.02] rounded cursor-pointer"
                    >
                      <div className="col-span-2 text-white/70 truncate">
                        <span className="text-white/30 mr-1">{i + 1}.</span>
                        {a.agent_name}
                      </div>
                      <div className="text-right text-white/40">{a.tier}</div>
                      <div className="text-right text-white/60">{fmt(a.est_revenue)}</div>
                      <div className="text-right text-white/60">{fmt(a.true_cost ?? a.est_cost)}</div>
                      <div className={`text-right ${aPnlColor}`}>
                        {a.pnl >= 0 ? "+" : ""}{fmt(a.pnl)}
                      </div>
                      <div className={`text-right ${aPnlColor}`}>
                        {a.pnl_per_hour >= 0 ? "+" : ""}${a.pnl_per_hour.toFixed(2)}
                      </div>
                      <div className="text-right text-white/60">{a.avg_tph.toFixed(2)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

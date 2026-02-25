"use client";

import { useState, useEffect, useCallback } from "react";
import { useExecutiveFilters } from "@/context/ExecutiveFilterContext";
import { PeriodLabel } from "../layout";
import { RosterBoard } from "@/components/roster/RosterBoard";
import { RosterLeaderboard } from "@/components/roster/RosterLeaderboard";
import { TeamBreakdown } from "@/components/roster/TeamBreakdown";
import { ScoutingReport } from "@/components/roster/ScoutingReport";
import { AgentSportsCard } from "@/components/roster/AgentSportsCard";
import type { RosterAgent, RosterTeamSummary, AgentTier } from "@/types/dialedin-types";

type ViewMode = "board" | "leaderboard" | "teams" | "scouting";

const VIEWS: { key: ViewMode; label: string }[] = [
  { key: "board", label: "ROSTER BOARD" },
  { key: "leaderboard", label: "LEADERBOARD" },
  { key: "teams", label: "TEAM BREAKDOWN" },
  { key: "scouting", label: "SCOUTING REPORT" },
];

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

interface RosterData {
  roster: RosterAgent[];
  teams: RosterTeamSummary[];
  period: { start: string; end: string };
  summary: {
    total_agents: number;
    total_revenue: number;
    total_cost: number;
    net_pnl: number;
    tier_counts: Record<AgentTier, number>;
  };
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400",
    red: "text-red-400",
    amber: "text-amber-400",
    cyan: "text-cyan-400",
    white: "text-white",
  };
  const color = colorMap[accent || "white"] || "text-white";

  return (
    <div className="bg-[#0c1018] border border-[#1a2332] rounded-lg px-4 py-3">
      <div className="text-[9px] text-white/30 tracking-widest mb-1">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function TierPill({ tier, count }: { tier: AgentTier; count: number }) {
  const colors: Record<AgentTier, string> = {
    S: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    A: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    B: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    C: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    D: "text-red-400 bg-red-500/10 border-red-500/20",
  };
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono ${colors[tier]}`}>
      <span className="font-bold">{tier}</span>
      <span className="opacity-70">{count}</span>
    </div>
  );
}

export default function RosterPage() {
  const { startDate, endDate, dateRange } = useExecutiveFilters();
  const [data, setData] = useState<RosterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("board");
  const [selectedAgent, setSelectedAgent] = useState<RosterAgent | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const period = dateRange === "custom" ? `${startDate},${endDate}` : dateRange;
      const res = await fetch(`/api/executive/roster?period=${period}`);
      if (res.ok) {
        setData(await res.json());
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

  const s = data?.summary;
  const pnlColor = (s?.net_pnl ?? 0) >= 0 ? "emerald" : "red";

  return (
    <div className="font-mono">
      <PeriodLabel title="GM ROSTER" />

      <div className="p-4 space-y-4">
        {/* Header Stats */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="ROSTER SIZE"
            value={loading ? "---" : `${s?.total_agents ?? 0} Agents`}
            accent="white"
          />
          <StatCard
            label="TOTAL REVENUE"
            value={loading ? "---" : fmt(s?.total_revenue ?? 0)}
            accent="emerald"
          />
          <StatCard
            label="TOTAL COST"
            value={loading ? "---" : fmt(s?.total_cost ?? 0)}
            accent="red"
          />
          <StatCard
            label="NET P&L"
            value={loading ? "---" : `${(s?.net_pnl ?? 0) >= 0 ? "+" : ""}${fmt(s?.net_pnl ?? 0)}`}
            accent={pnlColor}
          />
        </div>

        {/* Tier Distribution */}
        {s && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/30 tracking-widest mr-1">TIERS</span>
            {(["S", "A", "B", "C", "D"] as AgentTier[]).map((tier) => (
              <TierPill key={tier} tier={tier} count={s.tier_counts[tier] || 0} />
            ))}
          </div>
        )}

        {/* View Tabs */}
        <div className="flex items-center gap-0 border-b border-[#1a2332]">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`px-4 py-2 text-[11px] tracking-wider transition-colors border-b-2 ${
                view === v.key
                  ? "text-amber-400 border-b-amber-500 bg-amber-500/5"
                  : "text-white/40 border-b-transparent hover:text-white/70"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* View Content */}
        {view === "board" && (
          <RosterBoard agents={data?.roster || []} loading={loading} onAgentClick={setSelectedAgent} />
        )}
        {view === "leaderboard" && (
          <RosterLeaderboard agents={data?.roster || []} loading={loading} onAgentClick={setSelectedAgent} />
        )}
        {view === "teams" && (
          <TeamBreakdown
            teams={data?.teams || []}
            agents={data?.roster || []}
            loading={loading}
            onAgentClick={setSelectedAgent}
          />
        )}
        {view === "scouting" && (
          <ScoutingReport agents={data?.roster || []} loading={loading} onAgentClick={setSelectedAgent} />
        )}
      </div>

      {selectedAgent && (
        <AgentSportsCard agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      )}
    </div>
  );
}

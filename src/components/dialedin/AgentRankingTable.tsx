"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpDown, Trophy, Medal } from "lucide-react";
import type { AgentPerformance } from "@/types/dialedin-types";

interface AgentRankingTableProps {
  agents: AgentPerformance[];
  loading?: boolean;
}

type SortKey = "tph" | "transfers" | "conversion_rate" | "dials" | "hours_worked" | "dead_air_ratio";

export default function AgentRankingTable({ agents, loading }: AgentRankingTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("tph");
  const [sortAsc, setSortAsc] = useState(false);
  const [showCount, setShowCount] = useState(25);

  const sorted = [...agents].sort((a, b) => {
    const aVal = a[sortKey] ?? 0;
    const bVal = b[sortKey] ?? 0;
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  const visible = sorted.slice(0, showCount);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const rankBadge = (rank: number | null) => {
    if (rank === 1) return <Trophy size={14} className="text-amber-400" />;
    if (rank === 2) return <Medal size={14} className="text-gray-300" />;
    if (rank === 3) return <Medal size={14} className="text-amber-600" />;
    return <span className="text-white/30 text-xs">{rank || "—"}</span>;
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="text-left py-2 pr-3 cursor-pointer hover:text-white/60 select-none"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown size={10} className={sortKey === field ? "text-indigo-400" : "text-white/20"} />
      </span>
    </th>
  );

  if (loading) {
    return (
      <Card className="bg-white/[0.03] border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-lg">Agent Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] animate-pulse rounded-lg bg-white/[0.02]" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/[0.03] border-white/10">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-white text-lg">Agent Performance</CardTitle>
        <span className="text-white/30 text-xs">{agents.length} agents</span>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-xs border-b border-white/5">
                <th className="text-left py-2 pr-3 w-8">#</th>
                <th className="text-left py-2 pr-3">Agent</th>
                <th className="text-left py-2 pr-3">Skill</th>
                <SortHeader label="TPH" field="tph" />
                <SortHeader label="Transfers" field="transfers" />
                <SortHeader label="Conv %" field="conversion_rate" />
                <SortHeader label="Dials" field="dials" />
                <SortHeader label="Hours" field="hours_worked" />
                <SortHeader label="Dead Air %" field="dead_air_ratio" />
              </tr>
            </thead>
            <tbody>
              {visible.map((agent, i) => (
                <tr
                  key={agent.id || `${agent.agent_name}-${i}`}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                >
                  <td className="py-2 pr-3">{rankBadge(agent.tph_rank)}</td>
                  <td className="py-2 pr-3 text-white/90 font-medium">{agent.agent_name}</td>
                  <td className="py-2 pr-3 text-white/40 text-xs max-w-[120px] truncate">{agent.skill || "—"}</td>
                  <td className="py-2 pr-3">
                    <span className={`font-mono ${agent.tph >= 1.5 ? "text-emerald-400" : agent.tph >= 0.8 ? "text-white/80" : "text-red-400"}`}>
                      {agent.tph.toFixed(2)}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-white/70 font-mono">{agent.transfers}</td>
                  <td className="py-2 pr-3">
                    <span className={`font-mono ${agent.conversion_rate >= 15 ? "text-emerald-400" : agent.conversion_rate >= 8 ? "text-white/70" : "text-amber-400"}`}>
                      {agent.conversion_rate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-white/50 font-mono">{agent.dials.toLocaleString()}</td>
                  <td className="py-2 pr-3 text-white/50 font-mono">{agent.hours_worked.toFixed(1)}</td>
                  <td className="py-2 pr-3">
                    <span className={`font-mono ${agent.dead_air_ratio >= 30 ? "text-red-400" : agent.dead_air_ratio >= 15 ? "text-amber-400" : "text-white/40"}`}>
                      {agent.dead_air_ratio.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {agents.length > showCount && (
          <button
            onClick={() => setShowCount((c) => c + 25)}
            className="mt-4 w-full py-2 text-sm text-white/40 hover:text-white/60 border border-white/5 rounded-lg hover:bg-white/[0.02] transition-colors"
          >
            Show more ({agents.length - showCount} remaining)
          </button>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useMemo } from "react";
import { isExcludedTeam } from "@/utils/dialedin-revenue";
import type { AgentPerformance } from "@/types/dialedin-types";

interface TeamComparisonPanelProps {
  agents: AgentPerformance[];
  selectedTeam: string | null;
  onSelectTeam: (team: string | null) => void;
}

interface TeamRow {
  team: string;
  agents: number;
  dials: number;
  transfers: number;
  tph: number;
  convRate: number;
  hours: number;
}

export default function TeamComparisonPanel({
  agents,
  selectedTeam,
  onSelectTeam,
}: TeamComparisonPanelProps) {
  const teams = useMemo(() => {
    const map = new Map<string, { dials: number; connects: number; contacts: number; transfers: number; hours: number; count: number }>();

    for (const a of agents) {
      if (isExcludedTeam(a.team || null)) continue;
      const t = a.team || "Unassigned";
      const existing = map.get(t) || { dials: 0, connects: 0, contacts: 0, transfers: 0, hours: 0, count: 0 };
      existing.dials += a.dials;
      existing.connects += a.connects;
      existing.contacts += a.contacts;
      existing.transfers += a.transfers;
      existing.hours += a.hours_worked;
      existing.count += 1;
      map.set(t, existing);
    }

    const rows: TeamRow[] = [];
    for (const [team, data] of map) {
      rows.push({
        team,
        agents: data.count,
        dials: data.dials,
        transfers: data.transfers,
        tph: data.hours > 0 ? data.transfers / data.hours : 0,
        convRate: data.contacts > 0 ? (data.transfers / data.contacts) * 100 : 0,
        hours: data.hours,
      });
    }

    return rows.sort((a, b) => b.tph - a.tph);
  }, [agents]);

  return (
    <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a2332]">
        <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">
          Teams
        </span>
        {selectedTeam && (
          <button
            onClick={() => onSelectTeam(null)}
            className="text-[9px] text-white/30 hover:text-white/50 font-mono"
          >
            CLEAR
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-white/25 font-mono border-b border-[#1a2332]">
              <th className="text-left py-1 px-2">Team</th>
              <th className="text-right py-1 px-1">#</th>
              <th className="text-right py-1 px-1">SLA</th>
              <th className="text-right py-1 px-1">SLA/hr</th>
              <th className="text-right py-1 px-2">Conv%</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr
                key={t.team}
                onClick={() => onSelectTeam(selectedTeam === t.team ? null : t.team)}
                className={`cursor-pointer transition-colors border-b border-[#1a2332]/50 ${
                  selectedTeam === t.team
                    ? "bg-amber-400/10 text-amber-300"
                    : "hover:bg-white/[0.02] text-white/70"
                }`}
              >
                <td className="py-1 px-2 font-mono truncate max-w-[100px]">{t.team}</td>
                <td className="py-1 px-1 text-right font-mono text-white/40">{t.agents}</td>
                <td className="py-1 px-1 text-right font-mono">{t.transfers.toLocaleString()}</td>
                <td className={`py-1 px-1 text-right font-mono font-bold ${
                  t.tph >= 2 ? "text-emerald-400" : t.tph >= 1 ? "text-white/80" : "text-amber-400"
                }`}>
                  {t.tph.toFixed(2)}
                </td>
                <td className="py-1 px-2 text-right font-mono">{t.convRate.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

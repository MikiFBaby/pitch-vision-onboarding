"use client";

import type { RosterAgent, AgentTier } from "@/types/dialedin-types";
import { AgentCard, AgentCardSkeleton } from "./AgentCard";

const TIERS: { tier: AgentTier; label: string; color: string; accent: string }[] = [
  { tier: "S", label: "ELITE", color: "text-amber-400", accent: "border-l-amber-500" },
  { tier: "A", label: "STARTERS", color: "text-emerald-400", accent: "border-l-emerald-500" },
  { tier: "B", label: "ROTATION", color: "text-blue-400", accent: "border-l-blue-500" },
  { tier: "C", label: "DEVELOPMENT", color: "text-yellow-400", accent: "border-l-yellow-500" },
  { tier: "D", label: "AT RISK", color: "text-red-400", accent: "border-l-red-500" },
];

export function RosterBoard({
  agents,
  loading,
  onAgentClick,
}: {
  agents: RosterAgent[];
  loading: boolean;
  onAgentClick?: (agent: RosterAgent) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-6 p-4">
        {TIERS.map((t) => (
          <div key={t.tier}>
            <div className="text-[11px] text-white/40 tracking-widest mb-2">{t.tier} — {t.label}</div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {Array.from({ length: 4 }).map((_, i) => <AgentCardSkeleton key={i} />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const byTier = new Map<AgentTier, RosterAgent[]>();
  for (const t of TIERS) byTier.set(t.tier, []);
  for (const a of agents) {
    byTier.get(a.tier)?.push(a);
  }

  return (
    <div className="space-y-4 p-4">
      {TIERS.map((t) => {
        const tierAgents = byTier.get(t.tier) || [];
        if (tierAgents.length === 0) return null;

        return (
          <div key={t.tier} className={`border-l-2 ${t.accent} pl-3`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[11px] font-bold tracking-widest ${t.color}`}>
                {t.tier} — {t.label}
              </span>
              <span className="text-[10px] text-white/30">
                ({tierAgents.length} agent{tierAgents.length !== 1 ? "s" : ""})
              </span>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10">
              {tierAgents
                .sort((a, b) => b.pnl_per_hour - a.pnl_per_hour)
                .map((agent) => (
                  <AgentCard
                    key={agent.agent_name}
                    agent={agent}
                    onClick={() => onAgentClick?.(agent)}
                  />
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

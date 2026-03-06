"use client";

import { motion } from "framer-motion";
import type { IntradayAgentRow } from "@/types/dialedin-types";

interface LeaderboardTableProps {
  agents: IntradayAgentRow[];
  currentAgentName: string;
  maxRows?: number;
}

export default function LeaderboardTable({ agents, currentAgentName, maxRows = 10 }: LeaderboardTableProps) {
  const sorted = [...agents]
    .sort((a, b) => b.sla_hr - a.sla_hr)
    .slice(0, maxRows);

  const currentIdx = sorted.findIndex(
    (a) => a.name.toLowerCase() === currentAgentName.toLowerCase(),
  );

  // If current agent not in top N, find their global rank and append
  let currentAgent: IntradayAgentRow | null = null;
  let currentGlobalRank: number | null = null;
  if (currentIdx === -1) {
    const allSorted = [...agents].sort((a, b) => b.sla_hr - a.sla_hr);
    const globalIdx = allSorted.findIndex(
      (a) => a.name.toLowerCase() === currentAgentName.toLowerCase(),
    );
    if (globalIdx !== -1) {
      currentAgent = allSorted[globalIdx];
      currentGlobalRank = globalIdx + 1;
    }
  }

  return (
    <div className="space-y-1">
      {sorted.map((agent, i) => {
        const isMe = agent.name.toLowerCase() === currentAgentName.toLowerCase();
        return (
          <motion.div
            key={agent.name}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
              isMe ? "bg-indigo-500/15 border border-indigo-500/30" : "bg-white/5"
            }`}
          >
            <span className={`text-xs font-bold w-6 text-center ${
              i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-600" : "text-white/40"
            }`}>
              #{i + 1}
            </span>
            <span className={`text-xs flex-1 truncate ${isMe ? "text-white font-bold" : "text-white/70"}`}>
              {isMe ? `${agent.name} (You)` : agent.name}
            </span>
            <span className="text-xs font-mono font-bold text-white/80">
              {agent.sla_hr.toFixed(2)}
            </span>
            <span className="text-[10px] text-white/40 w-12 text-right">
              {agent.transfers} SLA
            </span>
          </motion.div>
        );
      })}

      {currentAgent && currentGlobalRank && (
        <>
          <div className="text-center text-white/20 text-[10px] py-1">&middot;&middot;&middot;</div>
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-indigo-500/15 border border-indigo-500/30">
            <span className="text-xs font-bold w-6 text-center text-white/40">
              #{currentGlobalRank}
            </span>
            <span className="text-xs flex-1 truncate text-white font-bold">
              {currentAgent.name} (You)
            </span>
            <span className="text-xs font-mono font-bold text-white/80">
              {currentAgent.sla_hr.toFixed(2)}
            </span>
            <span className="text-[10px] text-white/40 w-12 text-right">
              {currentAgent.transfers} SLA
            </span>
          </div>
        </>
      )}
    </div>
  );
}

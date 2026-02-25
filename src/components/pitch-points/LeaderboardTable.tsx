"use client";

import React from "react";
import { motion } from "framer-motion";
import { Trophy, Flame } from "lucide-react";
import type { LeaderboardEntry } from "@/types/pitch-points-types";

interface LeaderboardTableProps {
  leaderboard: LeaderboardEntry[];
  currentUserId: string;
}

const rankConfig: Record<number, { color: string; bg: string; label: string }> = {
  1: { color: "text-amber-400", bg: "bg-amber-500/20", label: "Gold" },
  2: { color: "text-gray-300", bg: "bg-gray-400/20", label: "Silver" },
  3: { color: "text-orange-400", bg: "bg-orange-500/20", label: "Bronze" },
};

function getInitials(first: string, last: string): string {
  return `${(first || "")[0] ?? ""}${(last || "")[0] ?? ""}`.toUpperCase();
}

export default function LeaderboardTable({
  leaderboard,
  currentUserId,
}: LeaderboardTableProps) {
  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
        <Trophy className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-white">Leaderboard</h3>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-white/40 text-xs uppercase tracking-wider">
              <th className="px-4 py-2.5 text-left font-medium w-12">Rank</th>
              <th className="px-4 py-2.5 text-left font-medium">Agent</th>
              <th className="px-4 py-2.5 text-right font-medium">Earned</th>
              <th className="px-4 py-2.5 text-right font-medium">Balance</th>
              <th className="px-4 py-2.5 text-right font-medium">Streak</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((entry, i) => {
              const isCurrentUser = entry.user_id === currentUserId;
              const podium = rankConfig[entry.rank];

              return (
                <motion.tr
                  key={entry.user_id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.03 }}
                  className={`border-b border-white/5 transition-colors ${
                    isCurrentUser
                      ? "bg-indigo-500/10 border-l-2 border-l-indigo-400 shadow-[inset_0_0_20px_rgba(99,102,241,0.1)]"
                      : "hover:bg-white/[0.03]"
                  }`}
                >
                  {/* Rank */}
                  <td className="px-4 py-3">
                    {podium ? (
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${podium.bg} ${podium.color}`}
                      >
                        {entry.rank}
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center w-7 h-7 text-xs text-white/40 font-medium">
                        {entry.rank}
                      </span>
                    )}
                  </td>

                  {/* Agent */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {entry.avatar_url ? (
                        <img
                          src={entry.avatar_url}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover border border-white/10"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-semibold text-white/60">
                          {getInitials(entry.first_name, entry.last_name)}
                        </div>
                      )}
                      <span
                        className={`font-medium ${
                          isCurrentUser ? "text-indigo-300" : "text-white"
                        }`}
                      >
                        {entry.first_name} {entry.last_name}
                        {isCurrentUser && (
                          <span className="ml-1.5 text-[10px] text-indigo-400 uppercase tracking-wider">
                            You
                          </span>
                        )}
                      </span>
                    </div>
                  </td>

                  {/* Lifetime earned */}
                  <td className="px-4 py-3 text-right text-white/70 tabular-nums">
                    {entry.lifetime_earned.toLocaleString()}
                  </td>

                  {/* Balance */}
                  <td className="px-4 py-3 text-right font-semibold text-amber-400 tabular-nums">
                    {entry.current_balance.toLocaleString()}
                  </td>

                  {/* Streak */}
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 text-white/70 tabular-nums">
                      {entry.current_streak_calls > 0 && (
                        <Flame className="w-3.5 h-3.5 text-orange-400" />
                      )}
                      {entry.current_streak_calls}
                    </span>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {leaderboard.length === 0 && (
        <div className="px-4 py-8 text-center text-white/30 text-sm">
          No leaderboard data available
        </div>
      )}
    </div>
  );
}

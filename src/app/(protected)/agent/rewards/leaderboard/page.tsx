"use client";

import React, { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import LeaderboardTable from "@/components/pitch-points/LeaderboardTable";
import { Trophy, Crown, Medal } from "lucide-react";
import { motion } from "framer-motion";
import type { LeaderboardEntry } from "@/types/pitch-points-types";

type Period = "all" | "month" | "week";

const periodTabs: { key: Period; label: string }[] = [
  { key: "all", label: "All Time" },
  { key: "month", label: "This Month" },
  { key: "week", label: "This Week" },
];

function getInitials(first: string, last: string): string {
  return `${(first || "")[0] ?? ""}${(last || "")[0] ?? ""}`.toUpperCase();
}

export default function LeaderboardPage() {
  const { profile } = useAuth();

  const [period, setPeriod] = useState<Period>("all");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/pitch-points/leaderboard?period=${period}&limit=25`
        );
        if (!res.ok) throw new Error("Failed to load leaderboard");
        const data = await res.json();
        setLeaderboard(data.leaderboard ?? data ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [period]);

  const top3 = leaderboard.slice(0, 3);
  const hasTop3 = top3.length >= 3;

  // Podium order: [2nd, 1st, 3rd]
  const podiumOrder = hasTop3 ? [top3[1], top3[0], top3[2]] : [];

  const podiumConfig = [
    {
      rank: 2,
      height: "h-24",
      icon: <Medal size={16} className="text-gray-300" />,
      ring: "ring-gray-300/30",
      bg: "bg-gray-400/10",
      label: "2nd",
    },
    {
      rank: 1,
      height: "h-32",
      icon: <Crown size={18} className="text-amber-400" />,
      ring: "ring-amber-400/40",
      bg: "bg-amber-500/10",
      label: "1st",
    },
    {
      rank: 3,
      height: "h-20",
      icon: <Medal size={16} className="text-orange-400" />,
      ring: "ring-orange-400/30",
      bg: "bg-orange-500/10",
      label: "3rd",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Leaderboard
          </h2>
          <p className="text-white/50 text-sm font-medium">
            See who is leading the Pitch Points race
          </p>
        </div>

        {/* Period Filter Tabs */}
        <div className="flex gap-2">
          {periodTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setPeriod(tab.key)}
              className={`relative px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 border ${
                period === tab.key
                  ? "text-white border-indigo-500/30 bg-indigo-500/10"
                  : "text-white/50 border-white/5 bg-white/[0.03] hover:bg-white/[0.06] hover:text-white/70"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-6">
            {/* Podium skeleton */}
            <div className="flex items-end justify-center gap-4 py-8">
              {[24, 32, 20].map((h, i) => (
                <div key={i} className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-white/5 animate-pulse" />
                  <div
                    className={`w-24 rounded-t-xl bg-white/5 animate-pulse`}
                    style={{ height: `${h * 4}px` }}
                  />
                </div>
              ))}
            </div>
            {/* Table skeleton */}
            <div className="h-[400px] rounded-xl bg-white/5 border border-white/5 animate-pulse" />
          </div>
        ) : error ? (
          <div className="bg-white/5 backdrop-blur-xl border border-rose-500/20 rounded-xl p-6 text-center">
            <p className="text-sm text-rose-400">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 text-xs text-white/50 hover:text-white/70 underline"
            >
              Retry
            </button>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-12 text-center">
            <Trophy size={36} className="text-white/15 mx-auto mb-3" />
            <p className="text-sm text-white/40 font-medium">
              No leaderboard data available
            </p>
            <p className="text-xs text-white/25 mt-1">
              Earn points to appear on the leaderboard
            </p>
          </div>
        ) : (
          <>
            {/* Top-3 Podium */}
            {hasTop3 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-8"
              >
                <div className="flex items-end justify-center gap-6 sm:gap-10">
                  {podiumOrder.map((entry, i) => {
                    const config = podiumConfig[i];
                    return (
                      <motion.div
                        key={entry.user_id}
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.4,
                          delay: 0.2 + i * 0.15,
                        }}
                        className="flex flex-col items-center"
                      >
                        {/* Crown for 1st place */}
                        {config.rank === 1 && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.6 }}
                            className="mb-2"
                          >
                            <Crown
                              size={24}
                              className="text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                            />
                          </motion.div>
                        )}

                        {/* Avatar */}
                        <div
                          className={`w-16 h-16 rounded-full ring-2 ${config.ring} flex items-center justify-center overflow-hidden mb-3 ${
                            entry.avatar_url ? "" : "bg-white/10"
                          }`}
                        >
                          {entry.avatar_url ? (
                            <img
                              src={entry.avatar_url}
                              alt={`${entry.first_name} ${entry.last_name}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-sm font-bold text-white/60">
                              {getInitials(
                                entry.first_name,
                                entry.last_name
                              )}
                            </span>
                          )}
                        </div>

                        {/* Name */}
                        <p className="text-xs font-semibold text-white text-center max-w-[80px] truncate">
                          {entry.first_name} {entry.last_name}
                        </p>

                        {/* Points */}
                        <p className="text-[11px] text-amber-400 font-semibold mt-0.5 tabular-nums">
                          {entry.lifetime_earned.toLocaleString()} pts
                        </p>

                        {/* Podium pillar */}
                        <div
                          className={`w-20 sm:w-24 ${config.height} ${config.bg} rounded-t-xl mt-3 flex items-start justify-center pt-2 border border-white/5 border-b-0`}
                        >
                          <span className="text-xs font-bold text-white/40">
                            {config.label}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Full Leaderboard Table */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <LeaderboardTable
                leaderboard={leaderboard}
                currentUserId={profile?.id ?? ""}
              />
            </motion.div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

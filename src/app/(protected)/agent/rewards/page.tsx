"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import StatsCard from "@/components/dashboard/StatsCard";
import TransactionList from "@/components/pitch-points/TransactionList";
import StreakProgress from "@/components/pitch-points/StreakProgress";
import {
  Coins,
  Clock,
  Flame,
  Trophy,
  ShoppingBag,
  Medal,
  History,
  ArrowRight,
} from "lucide-react";
import { motion } from "framer-motion";
import type { PointsBalance, PointsTransaction } from "@/types/pitch-points-types";

export default function RewardsDashboard() {
  const { profile } = useAuth();
  const router = useRouter();

  const [balance, setBalance] = useState<PointsBalance | null>(null);
  const [transactions, setTransactions] = useState<PointsTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.id) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [balRes, txRes] = await Promise.all([
          fetch(`/api/pitch-points/balance?userId=${profile.id}`),
          fetch(`/api/pitch-points/transactions?userId=${profile.id}&limit=5`),
        ]);

        if (!balRes.ok) throw new Error("Failed to load balance");
        if (!txRes.ok) throw new Error("Failed to load transactions");

        const balData = await balRes.json();
        const txData = await txRes.json();

        setBalance(balData);
        setTransactions(txData.transactions ?? txData ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile?.id]);

  // Compute expiring-soon points placeholder (would be from API in production)
  const expiringSoon = 0;

  const quickActions = [
    {
      label: "Reward Store",
      href: "/agent/rewards/store",
      icon: <ShoppingBag size={16} />,
      color: "text-indigo-400",
      bg: "bg-indigo-500/10",
      border: "border-indigo-500/20",
    },
    {
      label: "Leaderboard",
      href: "/agent/rewards/leaderboard",
      icon: <Medal size={16} />,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
    {
      label: "Points History",
      href: "/agent/rewards/history",
      icon: <History size={16} />,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Pitch Points
          </h2>
          <p className="text-white/50 text-sm font-medium">
            Earn points for great performance. Redeem them for real rewards.
          </p>
        </div>

        {/* Stats Cards */}
        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[120px] rounded-2xl bg-white/5 border border-white/5 animate-pulse"
              />
            ))}
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
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              index={0}
              title="Pitch Points Balance"
              value={balance?.current_balance?.toLocaleString() ?? "0"}
              trend="up"
              trendValue={`${balance?.lifetime_earned?.toLocaleString() ?? "0"} lifetime`}
              icon={<Coins size={18} />}
            />
            <StatsCard
              index={1}
              title="Expiring Soon"
              value={expiringSoon.toLocaleString()}
              trend="neutral"
              trendValue="7 days"
              icon={<Clock size={18} />}
            />
            <StatsCard
              index={2}
              title="Call Streak"
              value={balance?.current_streak_calls ?? 0}
              trend={
                (balance?.current_streak_calls ?? 0) > 0 ? "up" : "neutral"
              }
              trendValue={`${balance?.longest_streak_calls ?? 0} best`}
              icon={<Flame size={18} />}
            />
            <StatsCard
              index={3}
              title="Lifetime Earned"
              value={balance?.lifetime_earned?.toLocaleString() ?? "0"}
              trend="up"
              trendValue={`${balance?.lifetime_redeemed?.toLocaleString() ?? "0"} redeemed`}
              icon={<Trophy size={18} />}
            />
          </div>
        )}

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap gap-3">
          {quickActions.map((action, i) => (
            <motion.button
              key={action.href}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 + i * 0.05 }}
              onClick={() => router.push(action.href)}
              className={`inline-flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all duration-200 hover:scale-[1.02] ${action.bg} ${action.color} ${action.border}`}
            >
              {action.icon}
              {action.label}
              <ArrowRight size={14} className="opacity-50" />
            </motion.button>
          ))}
        </div>

        {/* Two-column: Recent Activity + Streak Progress */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Activity */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">
                Recent Activity
              </h3>
              <button
                onClick={() => router.push("/agent/rewards/history")}
                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-widest"
              >
                View All
              </button>
            </div>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 rounded-xl bg-white/5 border border-white/5 animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <TransactionList transactions={transactions} />
            )}
          </motion.div>

          {/* Streak Progress */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6"
          >
            <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-5">
              Streak Progress
            </h3>
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-20 rounded-xl bg-white/5 border border-white/5 animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <StreakProgress
                  currentStreak={balance?.current_streak_calls ?? 0}
                  nextMilestone={5}
                  label="5-Call Streak"
                />
                <StreakProgress
                  currentStreak={balance?.current_streak_calls ?? 0}
                  nextMilestone={10}
                  label="10-Call Streak"
                />
                <StreakProgress
                  currentStreak={balance?.current_streak_calls ?? 0}
                  nextMilestone={25}
                  label="25-Call Streak"
                />
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
}

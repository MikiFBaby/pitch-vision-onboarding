"use client";

import React, { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import TransactionList from "@/components/pitch-points/TransactionList";
import RedemptionCard from "@/components/pitch-points/RedemptionCard";
import {
  History,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
} from "lucide-react";
import { motion } from "framer-motion";
import type {
  PointsTransaction,
  Redemption,
  TransactionType,
} from "@/types/pitch-points-types";

type FilterTab = "all" | "earn" | "redeem" | "expire";

const filterTabs: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "earn", label: "Earned" },
  { key: "redeem", label: "Redeemed" },
  { key: "expire", label: "Expired" },
];

export default function PointsHistoryPage() {
  const { profile } = useAuth();

  const [transactions, setTransactions] = useState<PointsTransaction[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingTx, setLoadingTx] = useState(true);
  const [loadingRedemptions, setLoadingRedemptions] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch transactions
  useEffect(() => {
    if (!profile?.id) return;

    const fetchTransactions = async () => {
      setLoadingTx(true);
      setError(null);
      try {
        const typeParam = filter !== "all" ? `&type=${filter}` : "";
        const res = await fetch(
          `/api/pitch-points/transactions?userId=${profile.id}&page=${page}${typeParam}`
        );
        if (!res.ok) throw new Error("Failed to load transactions");
        const data = await res.json();
        setTransactions(data.transactions ?? data ?? []);
        setHasMore(data.hasMore ?? false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoadingTx(false);
      }
    };

    fetchTransactions();
  }, [profile?.id, page, filter]);

  // Fetch redemptions (once)
  useEffect(() => {
    if (!profile?.id) return;

    const fetchRedemptions = async () => {
      setLoadingRedemptions(true);
      try {
        const res = await fetch(
          `/api/pitch-points/my-redemptions?userId=${profile.id}`
        );
        if (!res.ok) throw new Error("Failed to load redemptions");
        const data = await res.json();
        setRedemptions(data.redemptions ?? data ?? []);
      } catch {
        // Silently fail for redemptions — not critical
      } finally {
        setLoadingRedemptions(false);
      }
    };

    fetchRedemptions();
  }, [profile?.id]);

  // Reset page when filter changes
  const handleFilterChange = (newFilter: FilterTab) => {
    setFilter(newFilter);
    setPage(1);
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Points History
          </h2>
          <p className="text-white/50 text-sm font-medium">
            Full history of your Pitch Points earnings and redemptions
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleFilterChange(tab.key)}
              className={`relative px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 border ${
                filter === tab.key
                  ? "text-white border-indigo-500/30 bg-indigo-500/10"
                  : "text-white/50 border-white/5 bg-white/[0.03] hover:bg-white/[0.06] hover:text-white/70"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Transactions */}
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-4">
            Transactions
          </h3>

          {loadingTx ? (
            <div className="space-y-1">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 rounded-lg bg-white/5 border border-white/5 animate-pulse"
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
          ) : transactions.length === 0 ? (
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-12 text-center">
              <History size={36} className="text-white/15 mx-auto mb-3" />
              <p className="text-sm text-white/40 font-medium">
                {filter === "all"
                  ? "No transactions yet"
                  : `No ${filter === "earn" ? "earning" : filter === "redeem" ? "redemption" : "expiry"} transactions`}
              </p>
              <p className="text-xs text-white/25 mt-1">
                Points activity will appear here
              </p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <TransactionList transactions={transactions} />
            </motion.div>
          )}

          {/* Pagination */}
          {!loadingTx && transactions.length > 0 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all duration-200 ${
                  page > 1
                    ? "text-white/70 border-white/10 bg-white/5 hover:bg-white/10"
                    : "text-white/20 border-white/5 bg-white/[0.02] cursor-not-allowed"
                }`}
              >
                <ChevronLeft size={14} />
                Previous
              </button>

              <span className="text-xs text-white/40 tabular-nums">
                Page {page}
              </span>

              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all duration-200 ${
                  hasMore
                    ? "text-white/70 border-white/10 bg-white/5 hover:bg-white/10"
                    : "text-white/20 border-white/5 bg-white/[0.02] cursor-not-allowed"
                }`}
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* My Redemptions */}
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-4">
            My Redemptions
          </h3>

          {loadingRedemptions ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 rounded-xl bg-white/5 border border-white/5 animate-pulse"
                />
              ))}
            </div>
          ) : redemptions.length === 0 ? (
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-10 text-center">
              <ShoppingBag size={32} className="text-white/15 mx-auto mb-3" />
              <p className="text-sm text-white/40 font-medium">
                No redemptions yet
              </p>
              <p className="text-xs text-white/25 mt-1">
                Visit the Reward Store to redeem your points
              </p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-3"
            >
              {redemptions.map((redemption) => (
                <RedemptionCard
                  key={redemption.id}
                  redemption={redemption}
                />
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

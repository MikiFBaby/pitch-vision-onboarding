"use client";

import React, { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import CategoryFilter from "@/components/pitch-points/CategoryFilter";
import StoreItemCard from "@/components/pitch-points/StoreItemCard";
import { Coins, ShoppingBag, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { StoreItem, StoreCategory, PointsBalance } from "@/types/pitch-points-types";

export default function RewardStorePage() {
  const { profile } = useAuth();

  const [items, setItems] = useState<StoreItem[]>([]);
  const [balance, setBalance] = useState<PointsBalance | null>(null);
  const [category, setCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redemption modal state
  const [selectedItem, setSelectedItem] = useState<StoreItem | null>(null);
  const [agentNotes, setAgentNotes] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showToast = useCallback(
    (type: "success" | "error", message: string) => {
      setToast({ type, message });
      setTimeout(() => setToast(null), 4000);
    },
    []
  );

  useEffect(() => {
    if (!profile?.id) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [storeRes, balRes] = await Promise.all([
          fetch("/api/pitch-points/store"),
          fetch(`/api/pitch-points/balance?userId=${profile.id}`),
        ]);

        if (!storeRes.ok) throw new Error("Failed to load store items");
        if (!balRes.ok) throw new Error("Failed to load balance");

        const storeData = await storeRes.json();
        const balData = await balRes.json();

        setItems(storeData.items ?? storeData ?? []);
        setBalance(balData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile?.id]);

  const filteredItems =
    category === "all"
      ? items
      : items.filter((item) => item.category === category);

  const handleRedeem = (item: StoreItem) => {
    setSelectedItem(item);
    setAgentNotes("");
  };

  const confirmRedeem = async () => {
    if (!selectedItem || !profile?.id) return;
    setRedeeming(true);

    try {
      const res = await fetch("/api/pitch-points/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: profile.id,
          storeItemId: selectedItem.id,
          agentNotes: agentNotes.trim() || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || "Redemption failed");
      }

      // Update local balance
      setBalance((prev) =>
        prev
          ? {
              ...prev,
              current_balance: prev.current_balance - selectedItem.point_cost,
              lifetime_redeemed:
                prev.lifetime_redeemed + selectedItem.point_cost,
            }
          : prev
      );

      // Update stock
      setItems((prev) =>
        prev.map((it) =>
          it.id === selectedItem.id && it.stock_quantity !== null
            ? { ...it, stock_quantity: it.stock_quantity - 1 }
            : it
        )
      );

      setSelectedItem(null);
      showToast("success", `Successfully redeemed "${selectedItem.name}"!`);
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Redemption failed"
      );
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Reward Store
            </h2>
            <p className="text-white/50 text-sm font-medium">
              Spend your hard-earned Pitch Points on rewards
            </p>
          </div>

          {/* Balance display */}
          {balance && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10"
            >
              <Coins size={18} className="text-amber-400" />
              <span className="text-lg font-bold text-white">
                {balance.current_balance.toLocaleString()}
              </span>
              <span className="text-xs text-white/40 font-medium">pts available</span>
            </motion.div>
          )}
        </div>

        {/* Category Filter */}
        <CategoryFilter selected={category} onChange={setCategory} />

        {/* Content */}
        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-[300px] rounded-xl bg-white/5 border border-white/5 animate-pulse"
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
        ) : filteredItems.length === 0 ? (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-12 text-center">
            <ShoppingBag size={36} className="text-white/15 mx-auto mb-3" />
            <p className="text-sm text-white/40 font-medium">
              No items available in this category
            </p>
            <p className="text-xs text-white/25 mt-1">
              Check back later for new rewards
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredItems.map((item) => (
              <StoreItemCard
                key={item.id}
                item={item}
                onRedeem={handleRedeem}
                userBalance={balance?.current_balance ?? 0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Redemption Confirmation Modal */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => !redeeming && setSelectedItem(null)}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 shadow-2xl"
            >
              <button
                onClick={() => !redeeming && setSelectedItem(null)}
                className="absolute top-4 right-4 text-white/30 hover:text-white/60 transition-colors"
              >
                <X size={18} />
              </button>

              <h3 className="text-lg font-bold text-white mb-1">
                Confirm Redemption
              </h3>
              <p className="text-sm text-white/50 mb-6">
                Are you sure you want to redeem{" "}
                <span className="text-white font-medium">
                  {selectedItem.name}
                </span>{" "}
                for{" "}
                <span className="text-amber-400 font-semibold">
                  {selectedItem.point_cost.toLocaleString()} points
                </span>
                ?
              </p>

              {/* Optional notes */}
              <div className="mb-6">
                <label className="block text-xs text-white/40 font-medium mb-1.5 uppercase tracking-wider">
                  Notes (optional)
                </label>
                <textarea
                  value={agentNotes}
                  onChange={(e) => setAgentNotes(e.target.value)}
                  placeholder="e.g., preferred size, color, etc."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-indigo-500/40 resize-none"
                />
              </div>

              {/* Balance preview */}
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 mb-6">
                <span className="text-xs text-white/40">Balance after</span>
                <span className="text-sm font-semibold text-white tabular-nums">
                  {(
                    (balance?.current_balance ?? 0) - selectedItem.point_cost
                  ).toLocaleString()}{" "}
                  pts
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => !redeeming && setSelectedItem(null)}
                  disabled={redeeming}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white/60 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRedeem}
                  disabled={redeeming}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-500/80 hover:bg-indigo-500 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {redeeming ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Redeeming...
                    </>
                  ) : (
                    "Confirm Redeem"
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-xl ${
              toast.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-rose-500/10 border-rose-500/20 text-rose-400"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { motion } from "framer-motion";

interface PointsBalanceWidgetProps {
  userId: string;
}

export default function PointsBalanceWidget({ userId }: PointsBalanceWidgetProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    const fetchBalance = async () => {
      try {
        const res = await fetch(`/api/pitch-points/balance?userId=${userId}`);
        if (res.ok) {
          const data = await res.json();
          setBalance(data.current_balance ?? 0);
        }
      } catch {
        // Silently fail — widget is non-critical
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();
  }, [userId]);

  if (loading) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 animate-pulse">
        <div className="w-4 h-4 rounded bg-white/10" />
        <div className="w-10 h-4 rounded bg-white/10" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 backdrop-blur-xl border border-white/10 cursor-default"
    >
      <Coins className="w-4 h-4 text-amber-400" />
      <motion.span
        key={balance}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-sm font-semibold text-white"
        style={{
          textShadow: "0 0 8px rgba(251, 191, 36, 0.4), 0 0 16px rgba(251, 191, 36, 0.2)",
        }}
      >
        {balance !== null ? balance.toLocaleString() : "0"}
      </motion.span>
    </motion.div>
  );
}

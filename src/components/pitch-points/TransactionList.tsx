"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  ArrowUp,
  ArrowDown,
  Clock,
  Gift,
  Wrench,
} from "lucide-react";
import type { PointsTransaction, TransactionType } from "@/types/pitch-points-types";

interface TransactionListProps {
  transactions: PointsTransaction[];
}

const typeConfig: Record<
  TransactionType,
  { icon: React.ElementType; color: string; bg: string }
> = {
  earn: { icon: ArrowUp, color: "text-emerald-400", bg: "bg-emerald-500/15" },
  redeem: { icon: ArrowDown, color: "text-rose-400", bg: "bg-rose-500/15" },
  expire: { icon: Clock, color: "text-gray-400", bg: "bg-gray-500/15" },
  manager_bonus: { icon: Gift, color: "text-purple-400", bg: "bg-purple-500/15" },
  admin_adjust: { icon: Wrench, color: "text-blue-400", bg: "bg-blue-500/15" },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TransactionList({ transactions }: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-8 text-center">
        <Clock className="w-8 h-8 text-white/20 mx-auto mb-2" />
        <p className="text-sm text-white/30">No transactions yet</p>
        <p className="text-xs text-white/20 mt-1">Points activity will appear here</p>
      </div>
    );
  }

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
      {transactions.map((tx, i) => {
        const config = typeConfig[tx.type];
        const Icon = config.icon;
        const isPositive = tx.amount > 0;

        return (
          <motion.div
            key={tx.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.03 }}
            className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
          >
            {/* Type icon */}
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${config.bg}`}
            >
              <Icon className={`w-4 h-4 ${config.color}`} />
            </div>

            {/* Description + Date */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{tx.description}</p>
              <p className="text-xs text-white/40 mt-0.5">
                {formatDate(tx.created_at)} at {formatTime(tx.created_at)}
              </p>
            </div>

            {/* Amount + Balance after */}
            <div className="flex-shrink-0 text-right">
              <p
                className={`text-sm font-semibold tabular-nums ${
                  isPositive ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {isPositive ? "+" : ""}
                {tx.amount.toLocaleString()}
              </p>
              <p className="text-[11px] text-white/30 tabular-nums">
                Bal: {tx.balance_after.toLocaleString()}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

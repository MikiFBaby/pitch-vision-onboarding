"use client";

import React from "react";
import { motion } from "framer-motion";
import { ShoppingBag, Calendar } from "lucide-react";
import type { Redemption, RedemptionStatus } from "@/types/pitch-points-types";

interface RedemptionCardProps {
  redemption: Redemption;
}

const statusConfig: Record<
  RedemptionStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  pending: {
    label: "Pending",
    color: "text-yellow-400",
    bg: "bg-yellow-500/15",
    border: "border-yellow-500/30",
  },
  approved: {
    label: "Approved",
    color: "text-blue-400",
    bg: "bg-blue-500/15",
    border: "border-blue-500/30",
  },
  fulfilled: {
    label: "Fulfilled",
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/30",
  },
  rejected: {
    label: "Rejected",
    color: "text-red-400",
    bg: "bg-red-500/15",
    border: "border-red-500/30",
  },
  cancelled: {
    label: "Cancelled",
    color: "text-gray-400",
    bg: "bg-gray-500/15",
    border: "border-gray-500/30",
  },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function RedemptionCard({ redemption }: RedemptionCardProps) {
  const status = statusConfig[redemption.status];
  const itemName = redemption.store_item?.name ?? "Unknown Item";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4 flex items-center gap-4 hover:bg-white/[0.07] transition-colors"
    >
      {/* Icon */}
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
        <ShoppingBag className="w-5 h-5 text-white/40" />
      </div>

      {/* Item info */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-white truncate">{itemName}</h4>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-amber-400 font-medium tabular-nums">
            {redemption.point_cost.toLocaleString()} pts
          </span>
          <span className="text-white/15">|</span>
          <span className="inline-flex items-center gap-1 text-xs text-white/40">
            <Calendar className="w-3 h-3" />
            {formatDate(redemption.created_at)}
          </span>
        </div>
      </div>

      {/* Status badge */}
      <div
        className={`flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${status.bg} ${status.color} ${status.border}`}
      >
        {status.label}
      </div>
    </motion.div>
  );
}

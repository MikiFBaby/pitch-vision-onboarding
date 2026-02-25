"use client";

import React from "react";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";

interface StreakProgressProps {
  currentStreak: number;
  nextMilestone: number;
  label: string;
}

export default function StreakProgress({
  currentStreak,
  nextMilestone,
  label,
}: StreakProgressProps) {
  const progress = nextMilestone > 0 ? Math.min((currentStreak / nextMilestone) * 100, 100) : 0;
  const isComplete = currentStreak >= nextMilestone;

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {currentStreak > 0 ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", bounce: 0.5 }}
            >
              <Flame className="w-5 h-5 text-orange-400" />
            </motion.div>
          ) : (
            <Flame className="w-5 h-5 text-white/20" />
          )}
          <span className="text-sm font-semibold text-white">{label}</span>
        </div>
        <span className="text-xs text-white/50 tabular-nums">
          {currentStreak} / {nextMilestone} {label.toLowerCase().includes("call") ? "" : "calls"}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-2.5 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: isComplete
              ? "linear-gradient(90deg, #10b981, #34d399)"
              : "linear-gradient(90deg, #6366f1, #a855f7)",
          }}
        />
        {/* Animated shimmer on progress bar */}
        {currentStreak > 0 && !isComplete && (
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: "200%" }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            style={{ left: 0, right: `${100 - progress}%` }}
          />
        )}
      </div>

      {/* Milestone text */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-white/30">
          {isComplete ? "Milestone reached!" : `${nextMilestone - currentStreak} more to go`}
        </span>
        {currentStreak > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-400">
            <Flame className="w-3 h-3" />
            Active
          </span>
        )}
      </div>
    </div>
  );
}

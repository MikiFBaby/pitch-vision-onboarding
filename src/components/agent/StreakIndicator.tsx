"use client";

import { Flame, Shield, Award } from "lucide-react";
import { motion } from "framer-motion";

type StreakType = "hot" | "attendance" | "qa";

interface StreakIndicatorProps {
  type: StreakType;
  days: number;
  label?: string;
}

const STREAK_CONFIG: Record<StreakType, { icon: typeof Flame; color: string; label: string }> = {
  hot:        { icon: Flame,  color: "text-orange-400", label: "Hot Streak" },
  attendance: { icon: Shield, color: "text-emerald-400", label: "Perfect Attendance" },
  qa:         { icon: Award,  color: "text-blue-400", label: "QA Champion" },
};

export default function StreakIndicator({ type, days, label }: StreakIndicatorProps) {
  if (days <= 0) return null;
  const config = STREAK_CONFIG[type];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className="flex items-center gap-1.5"
    >
      <Icon size={14} className={`${config.color} ${days >= 5 ? "animate-pulse" : ""}`} />
      <span className={`text-xs font-bold ${config.color}`}>{days}d</span>
      <span className="text-[10px] text-white/40">{label || config.label}</span>
    </motion.div>
  );
}

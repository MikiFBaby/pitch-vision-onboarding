"use client";

import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";

interface CarrotGoalCardProps {
  title: string;
  current: number;
  target: number;
  unit: string;
  rewardMessage: string;
  completed?: boolean;
}

export default function CarrotGoalCard({
  title,
  current,
  target,
  unit,
  rewardMessage,
  completed = false,
}: CarrotGoalCardProps) {
  const progress = target > 0 ? Math.min(current / target, 1) : 0;
  const remaining = Math.max(target - current, 0);
  const pct = Math.round(progress * 100);

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card rounded-xl border-white/5 p-4 ${
        completed ? "border-emerald-500/30 bg-emerald-500/5" : ""
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
            <motion.circle
              cx="40" cy="40" r={radius} fill="none"
              stroke={completed ? "#10b981" : "#6366f1"}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {completed ? (
              <CheckCircle size={20} className="text-emerald-400" />
            ) : (
              <span className="text-sm font-bold text-white">{pct}%</span>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-white/40 uppercase tracking-widest mb-1">{title}</div>
          {completed ? (
            <div className="text-sm font-bold text-emerald-400">{rewardMessage}</div>
          ) : (
            <>
              <div className="text-sm font-bold text-white">
                {remaining.toLocaleString(undefined, { maximumFractionDigits: 1 })} {unit} to go
              </div>
              <div className="text-[10px] text-white/40 mt-0.5">
                {current.toLocaleString(undefined, { maximumFractionDigits: 1 })} / {target.toLocaleString(undefined, { maximumFractionDigits: 1 })} {unit}
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

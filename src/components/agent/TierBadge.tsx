"use client";

import { motion } from "framer-motion";
import type { TierDefinition } from "@/utils/agent-tiers";

const TIER_GRADIENTS: Record<string, string> = {
  amber:  "from-amber-600 to-amber-400",
  slate:  "from-slate-400 to-slate-300",
  yellow: "from-yellow-500 to-yellow-300",
  cyan:   "from-cyan-400 to-cyan-200",
  violet: "from-violet-500 to-purple-300",
};

interface TierBadgeProps {
  tier: TierDefinition;
  size?: "sm" | "md" | "lg";
}

export default function TierBadge({ tier, size = "md" }: TierBadgeProps) {
  const sizeClasses = {
    sm: "text-[10px] px-2 py-0.5",
    md: "text-xs px-3 py-1",
    lg: "text-sm px-4 py-1.5",
  };

  return (
    <motion.span
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`inline-flex items-center gap-1.5 font-bold rounded-full bg-gradient-to-r ${TIER_GRADIENTS[tier.color] || TIER_GRADIENTS.amber} text-black/80 ${sizeClasses[size]}`}
    >
      <span className="opacity-70">{tier.badge}</span>
      <span>{tier.name}</span>
    </motion.span>
  );
}

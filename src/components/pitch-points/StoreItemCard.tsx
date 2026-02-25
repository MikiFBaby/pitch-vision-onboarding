"use client";

import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Monitor,
  Package,
  Award,
  Sparkles,
  Star,
  ShoppingCart,
} from "lucide-react";
import type { StoreItem, StoreCategory } from "@/types/pitch-points-types";

interface StoreItemCardProps {
  item: StoreItem;
  onRedeem: (item: StoreItem) => void;
  userBalance: number;
}

const categoryConfig: Record<
  StoreCategory,
  { icon: React.ElementType; label: string; color: string; bg: string }
> = {
  digital_perk: {
    icon: Monitor,
    label: "Digital Perk",
    color: "text-cyan-400",
    bg: "bg-cyan-500/20",
  },
  physical_good: {
    icon: Package,
    label: "Physical Good",
    color: "text-amber-400",
    bg: "bg-amber-500/20",
  },
  recognition: {
    icon: Award,
    label: "Recognition",
    color: "text-emerald-400",
    bg: "bg-emerald-500/20",
  },
  experience: {
    icon: Sparkles,
    label: "Experience",
    color: "text-purple-400",
    bg: "bg-purple-500/20",
  },
};

export default function StoreItemCard({
  item,
  onRedeem,
  userBalance,
}: StoreItemCardProps) {
  const canAfford = userBalance >= item.point_cost;
  const outOfStock = item.stock_quantity === 0;
  const catConfig = categoryConfig[item.category];
  const CategoryIcon = catConfig.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative group bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden flex flex-col"
    >
      {/* Featured badge */}
      {item.is_featured && (
        <div className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30">
          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
          <span className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider">
            Featured
          </span>
        </div>
      )}

      {/* Out of stock overlay */}
      {outOfStock && (
        <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-xl">
          <span className="text-sm font-semibold text-white/70 uppercase tracking-wider">
            Out of Stock
          </span>
        </div>
      )}

      {/* Image / Placeholder */}
      <div className="relative w-full h-40 bg-white/[0.03] flex items-center justify-center overflow-hidden">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <CategoryIcon className={`w-12 h-12 ${catConfig.color} opacity-40`} />
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4 gap-3">
        {/* Category badge */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${catConfig.bg} ${catConfig.color}`}
          >
            <CategoryIcon className="w-3 h-3" />
            {catConfig.label}
          </span>
        </div>

        {/* Name + Description */}
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white leading-snug">
            {item.name}
          </h3>
          {item.description && (
            <p className="mt-1 text-xs text-white/50 line-clamp-2">
              {item.description}
            </p>
          )}
        </div>

        {/* Cost + Redeem */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <span className="text-sm font-bold text-amber-400">
            {item.point_cost.toLocaleString()} pts
          </span>
          <button
            onClick={() => onRedeem(item)}
            disabled={!canAfford || outOfStock}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
              canAfford && !outOfStock
                ? "bg-indigo-500/80 hover:bg-indigo-500 text-white cursor-pointer shadow-lg shadow-indigo-500/20"
                : "bg-white/5 text-white/30 cursor-not-allowed"
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            Redeem
          </button>
        </div>
      </div>
    </motion.div>
  );
}

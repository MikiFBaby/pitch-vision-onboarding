"use client";

import React from "react";
import { motion } from "framer-motion";
import { LayoutGrid, Monitor, Package, Award, Sparkles } from "lucide-react";

interface CategoryFilterProps {
  selected: string;
  onChange: (category: string) => void;
}

const categories: { key: string; label: string; icon: React.ElementType }[] = [
  { key: "all", label: "All", icon: LayoutGrid },
  { key: "digital_perk", label: "Digital Perks", icon: Monitor },
  { key: "physical_good", label: "Physical Goods", icon: Package },
  { key: "recognition", label: "Recognition", icon: Award },
  { key: "experience", label: "Experiences", icon: Sparkles },
];

export default function CategoryFilter({ selected, onChange }: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((cat) => {
        const isActive = selected === cat.key;
        const Icon = cat.icon;

        return (
          <button
            key={cat.key}
            onClick={() => onChange(cat.key)}
            className={`relative inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all duration-200 border ${
              isActive
                ? "text-white bg-indigo-500/20 border-indigo-500/30"
                : "text-white/50 bg-transparent border-white/10 hover:bg-white/5 hover:text-white/70"
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="activeCategoryPill"
                className="absolute inset-0 rounded-full bg-indigo-500/20 border border-indigo-500/30"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5" />
              {cat.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { AnimatePresence, motion } from "framer-motion";
import { TrendingUp, ShieldCheck, Award, Clock, Phone } from "lucide-react";

export interface FeedEvent {
  id: string;
  type: "transfer" | "qa" | "tier" | "streak" | "shift";
  title: string;
  subtitle?: string;
  timestamp: string;
}

const ICON_MAP = {
  transfer: Phone,
  qa: ShieldCheck,
  tier: Award,
  streak: TrendingUp,
  shift: Clock,
};

const COLOR_MAP: Record<string, string> = {
  transfer: "text-emerald-400",
  qa: "text-blue-400",
  tier: "text-yellow-400",
  streak: "text-orange-400",
  shift: "text-white/40",
};

interface EventFeedProps {
  events: FeedEvent[];
  maxItems?: number;
}

export default function EventFeed({ events, maxItems = 20 }: EventFeedProps) {
  const visible = events.slice(0, maxItems);

  return (
    <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
      <AnimatePresence mode="popLayout">
        {visible.map((event) => {
          const Icon = ICON_MAP[event.type] || Phone;
          const color = COLOR_MAP[event.type] || "text-white/40";

          return (
            <motion.div
              key={event.id}
              layout
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
            >
              <Icon size={14} className={color} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white/80 truncate">{event.title}</div>
                {event.subtitle && (
                  <div className="text-[10px] text-white/30 truncate">{event.subtitle}</div>
                )}
              </div>
              <span className="text-[10px] text-white/20 font-mono shrink-0">{event.timestamp}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {events.length === 0 && (
        <div className="text-center py-6 text-white/20 text-xs">No events yet today</div>
      )}
    </div>
  );
}

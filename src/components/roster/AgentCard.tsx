"use client";

import type { RosterAgent, AgentTier } from "@/types/dialedin-types";

const TIER_CONFIG: Record<AgentTier, { label: string; color: string; bg: string; border: string; glow: string }> = {
  S: { label: "ELITE", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", glow: "shadow-[0_0_12px_rgba(245,158,11,0.15)]" },
  A: { label: "STARTER", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", glow: "shadow-[0_0_8px_rgba(16,185,129,0.1)]" },
  B: { label: "ROTATION", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", glow: "" },
  C: { label: "DEVELOPMENT", color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", glow: "" },
  D: { label: "AT RISK", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", glow: "" },
};

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 0.1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 80;
  const h = 20;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={w} height={h} className="opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function AgentCard({ agent, onClick }: { agent: RosterAgent; onClick?: () => void }) {
  const tier = TIER_CONFIG[agent.tier];
  const trendArrow = agent.trend === "up" ? "▲" : agent.trend === "down" ? "▼" : "─";
  const trendColor = agent.trend === "up" ? "text-emerald-400" : agent.trend === "down" ? "text-red-400" : "text-white/30";
  const sparkColor = agent.trend === "up" ? "#34d399" : agent.trend === "down" ? "#f87171" : "#6b7280";
  const pnlColor = agent.pnl >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <button
      onClick={onClick}
      className={`${tier.bg} ${tier.border} ${tier.glow} border rounded-lg p-3 text-left font-mono transition-all hover:scale-[1.02] hover:brightness-110 w-[200px] flex-shrink-0 cursor-pointer`}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`text-[9px] font-bold ${tier.color} ${tier.bg} px-1 py-px rounded`}>
          {agent.tier}
        </span>
        <span className="text-[11px] text-white font-semibold truncate flex-1">
          {agent.agent_name}
        </span>
      </div>

      {/* Team + Days */}
      <div className="text-[9px] text-white/40 mb-2 truncate">
        {agent.team || "No Team"} | {agent.days_worked}d
      </div>

      {/* Divider */}
      <div className="h-px bg-white/5 mb-2" />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        <div>
          <span className="text-white/40">SLA/hr </span>
          <span className="text-white font-semibold">{agent.avg_tph.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-white/40">Rev </span>
          <span className="text-white font-semibold">{fmt(agent.est_revenue)}</span>
        </div>
        <div>
          <span className="text-white/40">Cost </span>
          <span className="text-white/70">{fmt(agent.true_cost ?? agent.est_cost)}</span>
        </div>
        <div>
          <span className="text-white/40">P&L </span>
          <span className={`font-semibold ${pnlColor}`}>
            {agent.pnl >= 0 ? "+" : ""}{fmt(agent.pnl)}
          </span>
        </div>
      </div>

      {/* Bottom: $/hr + Sparkline */}
      <div className="flex items-center justify-between mt-2">
        <div className="text-[10px]">
          <span className="text-white/40">$/hr </span>
          <span className={`font-semibold ${pnlColor}`}>
            {agent.pnl_per_hour >= 0 ? "+" : ""}{agent.pnl_per_hour.toFixed(2)}
          </span>
          <span className={`ml-1 ${trendColor}`}>{trendArrow} {Math.abs(agent.trend_pct)}%</span>
        </div>
        <MiniSparkline data={agent.sparkline} color={sparkColor} />
      </div>
    </button>
  );
}

export function AgentCardSkeleton() {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-3 w-[200px] flex-shrink-0 animate-pulse">
      <div className="h-3 bg-white/10 rounded w-3/4 mb-2" />
      <div className="h-2 bg-white/5 rounded w-1/2 mb-3" />
      <div className="h-px bg-white/5 mb-2" />
      <div className="space-y-1.5">
        <div className="h-2.5 bg-white/5 rounded w-full" />
        <div className="h-2.5 bg-white/5 rounded w-full" />
      </div>
    </div>
  );
}

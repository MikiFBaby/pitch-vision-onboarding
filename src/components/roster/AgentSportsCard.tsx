"use client";

import type { RosterAgent, AgentTier } from "@/types/dialedin-types";

const TIER_CONFIG: Record<AgentTier, {
  label: string;
  color: string;
  accent: string;
  gradientFrom: string;
  border: string;
  glow: string;
}> = {
  S: {
    label: "ELITE",
    color: "text-amber-400",
    accent: "amber",
    gradientFrom: "from-amber-900/20",
    border: "border-amber-500/40",
    glow: "shadow-[0_0_30px_rgba(245,158,11,0.12)]",
  },
  A: {
    label: "STARTER",
    color: "text-emerald-400",
    accent: "emerald",
    gradientFrom: "from-emerald-900/15",
    border: "border-emerald-500/30",
    glow: "shadow-[0_0_20px_rgba(16,185,129,0.08)]",
  },
  B: {
    label: "ROTATION",
    color: "text-blue-400",
    accent: "blue",
    gradientFrom: "from-blue-900/10",
    border: "border-blue-500/25",
    glow: "",
  },
  C: {
    label: "DEVELOPMENT",
    color: "text-yellow-400",
    accent: "yellow",
    gradientFrom: "from-yellow-900/10",
    border: "border-yellow-500/20",
    glow: "",
  },
  D: {
    label: "AT RISK",
    color: "text-red-400",
    accent: "red",
    gradientFrom: "from-red-900/15",
    border: "border-red-500/30",
    glow: "",
  },
};

function Sparkline({ data, color, width = 160, height = 32 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return <div style={{ width, height }} className="opacity-30 flex items-center justify-center text-[9px] text-white/30">No data</div>;
  const max = Math.max(...data, 0.1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  // Fill area
  const fillPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} className="block">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill="url(#sparkFill)" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatBlock({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div>
      <div className="text-[8px] text-white/30 tracking-wider mb-0.5">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${accent || "text-white"}`}>{value}</div>
      {sub && <div className="text-[9px] text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}

function HBar({ segments }: { segments: { label: string; pct: number; color: string }[] }) {
  return (
    <div className="space-y-1">
      <div className="flex h-3 rounded-full overflow-hidden bg-white/5">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`${seg.color} transition-all`}
            style={{ width: `${Math.max(seg.pct, 0.5)}%` }}
            title={`${seg.label}: ${seg.pct.toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="flex gap-2">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1 text-[8px] text-white/40">
            <div className={`w-1.5 h-1.5 rounded-full ${seg.color}`} />
            {seg.label} {seg.pct.toFixed(0)}%
          </div>
        ))}
      </div>
    </div>
  );
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function getVerdict(pnlPerHour: number): { label: string; color: string } {
  if (pnlPerHour >= 15) return { label: "MONEY MAKER", color: "text-emerald-400" };
  if (pnlPerHour >= 0) return { label: "BREAK EVEN", color: "text-yellow-400" };
  return { label: "COSTING US", color: "text-red-400" };
}

function Avatar({ src, name, size = 56 }: { src: string | null; name: string; size?: number }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover border border-white/10"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className="rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white/60 font-bold text-sm"
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  );
}

export function AgentSportsCard({ agent, onClose }: { agent: RosterAgent; onClose: () => void }) {
  const tier = TIER_CONFIG[agent.tier];
  const pnlColor = agent.pnl >= 0 ? "text-emerald-400" : "text-red-400";
  const trendArrow = agent.trend === "up" ? "▲" : agent.trend === "down" ? "▼" : "─";
  const trendColor = agent.trend === "up" ? "text-emerald-400" : agent.trend === "down" ? "text-red-400" : "text-white/30";
  const sparkColor = agent.trend === "up" ? "#34d399" : agent.trend === "down" ? "#f87171" : "#6b7280";
  const verdict = getVerdict(agent.pnl_per_hour);
  const cost = agent.true_cost ?? agent.est_cost;
  const revPct = cost + agent.est_revenue > 0 ? (agent.est_revenue / (cost + agent.est_revenue)) * 100 : 50;
  const costPct = 100 - revPct;
  const flag = agent.country === "Canada" ? "\u{1F1E8}\u{1F1E6}" : agent.country === "USA" ? "\u{1F1FA}\u{1F1F8}" : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Card */}
      <div
        className={`relative w-[420px] max-h-[90vh] overflow-y-auto bg-gradient-to-b ${tier.gradientFrom} to-[#0c1018] border ${tier.border} ${tier.glow} rounded-xl font-mono`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 space-y-4">
          {/* Top Bar */}
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-2`}>
              <span className={`text-xs font-black ${tier.color} tracking-widest`}>
                {agent.tier}
              </span>
              <span className={`text-[10px] ${tier.color} opacity-70 tracking-wider`}>
                {tier.label}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-white/30 hover:text-white/70 text-lg leading-none transition-colors p-1"
            >
              &times;
            </button>
          </div>

          {/* Identity */}
          <div className="flex items-center gap-3">
            <Avatar src={agent.user_image} name={agent.agent_name} />
            <div className="min-w-0 flex-1">
              <div className="text-base font-bold text-white truncate">{agent.agent_name}</div>
              <div className="text-[10px] text-white/40 truncate">
                {agent.team || "No Team"} {agent.campaign_type ? `\u00B7 ${agent.campaign_type}` : ""} {flag ? `\u00B7 ${flag}` : ""}
              </div>
              {agent.hire_date && (
                <div className="text-[9px] text-white/25 mt-0.5">
                  Hired {agent.days_active}d ago \u00B7 {agent.days_worked}d active in period
                </div>
              )}
            </div>
          </div>

          {/* ═════ P&L HERO ═════ */}
          <div className="bg-black/20 rounded-lg border border-white/5 p-4">
            <div className="text-[8px] text-white/30 tracking-widest mb-1">NET P&L</div>
            <div className={`text-3xl font-black tabular-nums ${pnlColor}`}>
              {agent.pnl >= 0 ? "+" : ""}{fmt(agent.pnl)}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[10px]">
              <span className="text-white/40">$/hr</span>
              <span className={`font-bold ${pnlColor}`}>
                {agent.pnl_per_hour >= 0 ? "+" : ""}{agent.pnl_per_hour.toFixed(2)}
              </span>
              <span className="text-white/20">|</span>
              <span className="text-white/40">ROI</span>
              <span className={`font-bold ${pnlColor}`}>
                {agent.roi_pct.toFixed(1)}%
              </span>
            </div>

            {/* Revenue vs Cost bar */}
            <div className="mt-3">
              <div className="flex h-2.5 rounded-full overflow-hidden">
                <div className="bg-emerald-500/70 transition-all" style={{ width: `${revPct}%` }} />
                <div className="bg-red-500/40 transition-all" style={{ width: `${costPct}%` }} />
              </div>
              <div className="flex justify-between mt-1 text-[9px]">
                <span className="text-emerald-400/70">Rev {fmt(agent.est_revenue)}</span>
                <span className="text-red-400/50">Cost {fmt(cost)}</span>
              </div>
            </div>
          </div>

          {/* ═════ PERFORMANCE ═════ */}
          <div>
            <div className="text-[8px] text-white/20 tracking-[0.2em] mb-2">PERFORMANCE</div>
            <div className="grid grid-cols-3 gap-3">
              <StatBlock
                label="TPH"
                value={agent.avg_tph.toFixed(2)}
                sub={`${trendArrow} ${Math.abs(agent.trend_pct)}%`}
                accent="text-white"
              />
              <StatBlock
                label="TRANSFERS"
                value={agent.total_transfers.toLocaleString()}
                sub={`${agent.avg_transfers.toFixed(1)}/day`}
              />
              <StatBlock
                label="HOURS"
                value={agent.total_hours.toFixed(1)}
                sub={`${agent.avg_hours.toFixed(1)}/day`}
              />
            </div>

            {/* Sparkline */}
            <div className="mt-2 bg-black/10 rounded-lg p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[8px] text-white/20 tracking-wider">TPH TREND</span>
                <span className={`text-[9px] ${trendColor}`}>{trendArrow} {Math.abs(agent.trend_pct)}%</span>
              </div>
              <Sparkline data={agent.sparkline} color={sparkColor} width={370} height={36} />
            </div>
          </div>

          {/* ═════ COMPLIANCE ═════ */}
          {(agent.qa_score != null || agent.qa_stats) && (
            <div>
              <div className="text-[8px] text-white/20 tracking-[0.2em] mb-2">COMPLIANCE</div>
              <div className="grid grid-cols-3 gap-3">
                <StatBlock
                  label="QA SCORE"
                  value={agent.qa_score != null ? `${agent.qa_score}` : "---"}
                  accent={
                    agent.qa_score != null
                      ? agent.qa_score >= 80 ? "text-emerald-400" : agent.qa_score >= 60 ? "text-yellow-400" : "text-red-400"
                      : "text-white/30"
                  }
                />
                <StatBlock
                  label="PASS RATE"
                  value={agent.qa_stats ? `${agent.qa_stats.pass_rate}%` : "---"}
                  sub={agent.qa_stats ? `${agent.qa_stats.total_calls} calls` : undefined}
                />
                <StatBlock
                  label="AUTO-FAILS"
                  value={agent.qa_stats ? `${agent.qa_stats.auto_fail_count}` : "---"}
                  sub={agent.qa_stats ? `${agent.qa_stats.auto_fail_rate}% rate` : undefined}
                  accent={
                    agent.qa_stats && agent.qa_stats.auto_fail_count > 0 ? "text-red-400" : "text-white"
                  }
                />
              </div>

              {/* Risk breakdown */}
              {agent.qa_stats && (
                <div className="flex gap-2 mt-2">
                  {[
                    { label: "HIGH", value: agent.qa_stats.risk_breakdown.high, color: "text-red-400 bg-red-500/10 border-red-500/20" },
                    { label: "MED", value: agent.qa_stats.risk_breakdown.medium, color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
                    { label: "LOW", value: agent.qa_stats.risk_breakdown.low, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                  ].map((r) => (
                    <div key={r.label} className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-mono ${r.color}`}>
                      {r.label}: {r.value}
                    </div>
                  ))}
                </div>
              )}

              {/* Language assessment */}
              {agent.qa_language && (
                <div className="mt-2 bg-black/10 rounded-lg p-2 space-y-1">
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    {agent.qa_language.professionalism != null && (
                      <div>
                        <span className="text-white/30">Prof </span>
                        <span className="text-white font-semibold">{agent.qa_language.professionalism.toFixed(1)}</span>
                      </div>
                    )}
                    {agent.qa_language.empathy != null && (
                      <div>
                        <span className="text-white/30">Empathy </span>
                        <span className="text-white font-semibold">{agent.qa_language.empathy.toFixed(1)}</span>
                      </div>
                    )}
                    {agent.qa_language.clarity != null && (
                      <div>
                        <span className="text-white/30">Clarity </span>
                        <span className="text-white font-semibold">{agent.qa_language.clarity.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                  {agent.qa_language.pace && (
                    <div className="text-[9px] text-white/40">
                      Pace: <span className="text-white/60">{agent.qa_language.pace}</span>
                    </div>
                  )}
                  {agent.qa_language.tone_keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {agent.qa_language.tone_keywords.map((kw) => (
                        <span key={kw} className="text-[8px] text-white/50 bg-white/5 px-1.5 py-0.5 rounded">
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═════ UTILIZATION ═════ */}
          {agent.total_hours > 0 && (
            <div>
              <div className="text-[8px] text-white/20 tracking-[0.2em] mb-2">EFFICIENCY</div>
              <div className="grid grid-cols-3 gap-3 text-[10px] mb-2">
                <div>
                  <span className="text-white/30">Dials </span>
                  <span className="text-white font-semibold">{agent.total_dials?.toLocaleString() ?? "---"}</span>
                </div>
                <div>
                  <span className="text-white/30">Connects </span>
                  <span className="text-white font-semibold">{agent.total_connects?.toLocaleString() ?? "---"}</span>
                </div>
                <div>
                  <span className="text-white/30">Conv </span>
                  <span className="text-white font-semibold">{(agent.avg_conversion * 100).toFixed(1)}%</span>
                </div>
              </div>
              {agent.hourly_wage != null && (
                <div className="text-[10px]">
                  <span className="text-white/30">Hourly wage </span>
                  <span className="text-white/70">${agent.hourly_wage.toFixed(2)}/hr</span>
                  {agent.true_cost != null && (
                    <span className="text-white/20 ml-2">(payroll verified)</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═════ VERDICT ═════ */}
          <div className={`flex items-center justify-between bg-black/20 rounded-lg border border-white/5 px-4 py-3`}>
            <div>
              <div className="text-[8px] text-white/20 tracking-widest">VERDICT</div>
              <div className={`text-sm font-black tracking-wider ${verdict.color}`}>{verdict.label}</div>
            </div>
            <div className={`text-right`}>
              <div className={`text-lg font-bold tabular-nums ${pnlColor}`}>
                {agent.pnl_per_hour >= 0 ? "+" : ""}${agent.pnl_per_hour.toFixed(2)}/hr
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { AlertTriangle, Flame, GraduationCap, MessageSquare, StickyNote, TrendingUp } from "lucide-react";
import type { WatchAgent } from "@/hooks/useWatchList";

interface WatchListPanelProps {
  agents: WatchAgent[];
  loading: boolean;
  onAgentClick?: (name: string) => void;
  onCoachAgent?: (name: string) => void;
  onDmAgent?: (name: string) => void;
  onAddNote?: (name: string) => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  info: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  positive: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
};

function MiniSparkline({ values, color = "text-white/30" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const filtered = values.filter((v) => v > 0);
  if (filtered.length < 2) return null;

  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((Math.max(v, min) - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className={`${color} flex-shrink-0`}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={(values.length - 1) / (values.length - 1) * w} cy={h - ((Math.max(values[values.length - 1], min) - min) / range) * h} r="2" fill="currentColor" />
    </svg>
  );
}

function AgentRow({
  agent,
  onAgentClick,
  onCoachAgent,
  onDmAgent,
  onAddNote,
}: {
  agent: WatchAgent;
  onAgentClick?: (name: string) => void;
  onCoachAgent?: (name: string) => void;
  onDmAgent?: (name: string) => void;
  onAddNote?: (name: string) => void;
}) {
  const isNegative = agent.sentiment === "negative" || agent.sentiment === "mixed";
  const bgClass = isNegative ? "bg-red-500/5 border-red-500/10" : "bg-emerald-500/5 border-emerald-500/10";
  const sparklineColor = agent.trend_direction === "up" ? "text-emerald-400" : agent.trend_direction === "down" ? "text-red-400" : "text-white/30";

  return (
    <div className={`${bgClass} border rounded-lg p-3`}>
      <div className="flex items-center gap-3">
        {/* Avatar initial */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          isNegative ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400"
        }`}>
          {agent.name.charAt(0)}
        </div>

        {/* Name + sparkline */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onAgentClick?.(agent.name)}
              className="text-white/90 text-xs font-medium truncate text-left cursor-pointer hover:text-cyan-400 transition-colors"
            >
              {agent.name}
            </button>
            <span className={`text-xs font-mono font-bold tabular-nums ${
              agent.sla_hr_14d_avg >= 2.5 ? "text-emerald-400" : "text-red-400"
            }`}>
              {agent.sla_hr_14d_avg.toFixed(2)}
            </span>
          </div>
          <MiniSparkline values={agent.sparkline} color={sparklineColor} />
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onCoachAgent?.(agent.name)}
            title="Log coaching"
            className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-purple-400 transition-colors"
          >
            <GraduationCap size={14} />
          </button>
          <button
            onClick={() => onDmAgent?.(agent.name)}
            title="Send Slack DM"
            className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-cyan-400 transition-colors"
          >
            <MessageSquare size={14} />
          </button>
          <button
            onClick={() => onAddNote?.(agent.name)}
            title="Add note"
            className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-amber-400 transition-colors"
          >
            <StickyNote size={14} />
          </button>
        </div>
      </div>

      {/* Flags */}
      <div className="flex items-center gap-1 mt-2 flex-wrap">
        {agent.flags.map((f, i) => (
          <span
            key={`${f.type}-${i}`}
            title={f.detail}
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded border cursor-default ${SEVERITY_COLORS[f.severity]}`}
          >
            {f.label}
          </span>
        ))}
      </div>

      {/* Coaching status */}
      {agent.last_coached_days_ago !== null && (
        <div className="text-[10px] text-white/30 mt-1">
          Last coached: {agent.last_coached_days_ago}d ago
        </div>
      )}
    </div>
  );
}

export default function WatchListPanel({
  agents,
  loading,
  onAgentClick,
  onCoachAgent,
  onDmAgent,
  onAddNote,
}: WatchListPanelProps) {
  const needsAttention = agents.filter((a) => a.sentiment === "negative" || a.sentiment === "mixed");
  const brightSpots = agents.filter((a) => a.sentiment === "positive");
  const criticalCount = agents.filter((a) => a.flags.some((f) => f.severity === "critical")).length;

  return (
    <div className="lg:col-span-2 glass-card p-6 rounded-2xl border-white/5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle size={14} className="text-amber-400" />
        <h3 className="text-sm font-bold text-white uppercase tracking-widest">Watch List</h3>
        <div className="ml-auto flex items-center gap-2">
          {criticalCount > 0 && (
            <span className="text-[10px] font-bold bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
              {criticalCount} critical
            </span>
          )}
          <span className="text-[10px] text-white/40">{agents.length} agents</span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-12">
          <span className="text-emerald-400 text-3xl">&#10003;</span>
          <p className="text-white/50 text-sm mt-2">All agents performing well. No flags detected.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Needs Attention */}
          {needsAttention.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle size={10} className="text-red-400" />
                <span className="text-[10px] font-bold text-red-400/70 uppercase tracking-widest">
                  Needs Attention ({needsAttention.length})
                </span>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {needsAttention.map((a) => (
                  <AgentRow
                    key={a.name}
                    agent={a}
                    onAgentClick={onAgentClick}
                    onCoachAgent={onCoachAgent}
                    onDmAgent={onDmAgent}
                    onAddNote={onAddNote}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Bright Spots */}
          {brightSpots.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                {brightSpots.some((a) => a.hot_streak >= 3) ? (
                  <Flame size={10} className="text-emerald-400" />
                ) : (
                  <TrendingUp size={10} className="text-emerald-400" />
                )}
                <span className="text-[10px] font-bold text-emerald-400/70 uppercase tracking-widest">
                  Bright Spots ({brightSpots.length})
                </span>
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {brightSpots.map((a) => (
                  <AgentRow
                    key={a.name}
                    agent={a}
                    onAgentClick={onAgentClick}
                    onCoachAgent={onCoachAgent}
                    onDmAgent={onDmAgent}
                    onAddNote={onAddNote}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

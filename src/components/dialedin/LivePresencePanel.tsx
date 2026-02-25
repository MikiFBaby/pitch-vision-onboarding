"use client";

import type { LiveAgentStatus } from "@/types/dialedin-types";

interface LivePresencePanelProps {
  agentStatuses: LiveAgentStatus[];
  hasLiveData: boolean;
  lastUpdated: Date | null;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  available: {
    label: "AVAILABLE",
    bg: "bg-emerald-500/20",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
  },
  on_call: {
    label: "ON CALL",
    bg: "bg-amber-500/20",
    text: "text-amber-400",
    border: "border-amber-500/30",
  },
  paused: {
    label: "ON BREAK",
    bg: "bg-orange-500/20",
    text: "text-orange-400",
    border: "border-orange-500/30",
  },
  wrap: {
    label: "WRAP",
    bg: "bg-blue-500/20",
    text: "text-blue-400",
    border: "border-blue-500/30",
  },
};

function getInitials(name: string): string {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatTimeSince(since: string): string {
  const diff = Date.now() - new Date(since).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export default function LivePresencePanel({
  agentStatuses,
  hasLiveData,
  lastUpdated,
}: LivePresencePanelProps) {
  if (!hasLiveData || agentStatuses.length === 0) {
    return (
      <div className="h-full bg-[#0c1018] border border-[#1a2332] flex flex-col">
        <div className="px-3 py-1.5 border-b border-[#1a2332] shrink-0">
          <span className="text-[9px] uppercase tracking-wider text-white/25 font-mono font-bold">
            Live Presence
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[10px] text-white/15 font-mono">
            NO LIVE DATA
          </span>
        </div>
      </div>
    );
  }

  // Group by status
  const groups: Record<string, LiveAgentStatus[]> = {};
  for (const agent of agentStatuses) {
    const status = agent.current_status || "available";
    if (!groups[status]) groups[status] = [];
    groups[status].push(agent);
  }

  const statusOrder = ["available", "on_call", "paused", "wrap"];

  return (
    <div className="h-full bg-[#0c1018] border border-[#1a2332] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a2332] shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[9px] uppercase tracking-wider text-emerald-400/80 font-mono font-bold">
            Live Presence
          </span>
          <span className="text-[9px] text-white/25 font-mono">
            {agentStatuses.length} agents
          </span>
        </div>
        {lastUpdated && (
          <span className="text-[8px] text-white/15 font-mono">
            {lastUpdated.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>

      {/* Agent grid by status */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {statusOrder.map((status) => {
          const agents = groups[status];
          if (!agents || agents.length === 0) return null;
          const config = STATUS_CONFIG[status] || STATUS_CONFIG.available;

          return (
            <div key={status}>
              <div className="flex items-center gap-1 mb-1">
                <span className={`text-[8px] uppercase tracking-wider font-mono font-bold ${config.text}`}>
                  {config.label}
                </span>
                <span className="text-[8px] text-white/20 font-mono">
                  ({agents.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {agents.map((agent) => (
                  <span
                    key={agent.agent_name}
                    className={`inline-flex items-center justify-center w-7 h-5 text-[8px] font-mono font-bold rounded ${config.bg} ${config.text} border ${config.border}`}
                    title={`${agent.agent_name}${agent.current_campaign ? ` — ${agent.current_campaign}` : ""}${agent.break_code ? ` (${agent.break_code})` : ""} — ${formatTimeSince(agent.status_since)}`}
                  >
                    {getInitials(agent.agent_name)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

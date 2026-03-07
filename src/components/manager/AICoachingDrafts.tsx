import { useState, useCallback } from "react";
import { Sparkles, ChevronDown, ChevronUp, Copy } from "lucide-react";
import type { WatchAgent } from "@/hooks/useWatchList";

interface AICoachingDraftsProps {
  agents: WatchAgent[];
  onUseAsNotes?: (agentName: string, notes: string) => void;
}

interface DraftResult {
  agentName: string;
  response: string | null;
  loading: boolean;
  error: boolean;
}

export default function AICoachingDrafts({ agents, onUseAsNotes }: AICoachingDraftsProps) {
  const [drafts, setDrafts] = useState<DraftResult[]>([]);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);

  const topAgents = agents
    .filter((a) => a.sentiment === "negative" || a.sentiment === "mixed")
    .slice(0, 5);

  const generateDrafts = useCallback(async () => {
    if (topAgents.length === 0) return;
    setGenerating(true);

    const initial: DraftResult[] = topAgents.map((a) => ({
      agentName: a.name,
      response: null,
      loading: true,
      error: false,
    }));
    setDrafts(initial);
    setExpanded(new Set(topAgents.map((a) => a.name)));

    // Fire all in parallel
    const promises = topAgents.map(async (agent) => {
      try {
        const res = await fetch("/api/ai/manager-coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentName: agent.name,
            avg14dTph: agent.sla_hr_14d_avg,
            consistencyScore: agent.consistency_score,
            trendDirection: agent.trend_direction,
            hotColdStreak: agent.hot_streak > 0 ? agent.hot_streak : -agent.decline_streak,
            qaAutoFails: agent.qa_auto_fails_30d,
            attentionFlags: agent.flags.map((f) => f.label).join(", "),
            declineStreak: agent.decline_streak > 0 ? agent.decline_streak : undefined,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          return { agentName: agent.name, response: data.response, loading: false, error: false };
        }
        return { agentName: agent.name, response: null, loading: false, error: true };
      } catch {
        return { agentName: agent.name, response: null, loading: false, error: true };
      }
    });

    const results = await Promise.allSettled(promises);
    const finalDrafts = results.map((r) =>
      r.status === "fulfilled" ? r.value : { agentName: "Unknown", response: null, loading: false, error: true },
    );

    setDrafts(finalDrafts);
    setGenerating(false);
  }, [topAgents]);

  const toggleExpanded = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="glass-card p-6 rounded-2xl border-white/5">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={14} className="text-purple-400" />
        <h3 className="text-sm font-bold text-white uppercase tracking-widest">AI Coaching Drafts</h3>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="ml-auto text-white/30 hover:text-white/50 transition-colors"
        >
          {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {!isCollapsed && (
        <>
          {/* Generate button */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={generateDrafts}
              disabled={generating || topAgents.length === 0}
              className="flex items-center gap-1.5 text-xs font-bold bg-purple-500/20 text-purple-400 px-3 py-1.5 rounded-lg hover:bg-purple-500/30 transition-colors disabled:opacity-40"
            >
              <Sparkles size={12} />
              {generating ? "Generating..." : `Generate for Top ${Math.min(5, topAgents.length)}`}
            </button>
            {topAgents.length === 0 && (
              <span className="text-[10px] text-white/30">No agents needing attention</span>
            )}
          </div>

          {/* Draft cards */}
          {drafts.length > 0 && (
            <div className="space-y-2">
              {drafts.map((draft) => (
                <div
                  key={draft.agentName}
                  className="bg-purple-500/5 border border-purple-500/15 rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => toggleExpanded(draft.agentName)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-purple-500/10 transition-colors"
                  >
                    <span className="text-xs font-medium text-white/80">{draft.agentName}</span>
                    <div className="flex items-center gap-2">
                      {draft.loading && (
                        <span className="text-[10px] text-purple-400 animate-pulse">Generating...</span>
                      )}
                      {draft.error && (
                        <span className="text-[10px] text-red-400">Failed</span>
                      )}
                      {expanded.has(draft.agentName) ? (
                        <ChevronUp size={12} className="text-white/30" />
                      ) : (
                        <ChevronDown size={12} className="text-white/30" />
                      )}
                    </div>
                  </button>

                  {expanded.has(draft.agentName) && draft.response && (
                    <div className="px-3 pb-3 border-t border-purple-500/10">
                      <div className="text-xs text-white/70 whitespace-pre-wrap mt-2 leading-relaxed">
                        {draft.response}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => onUseAsNotes?.(draft.agentName, draft.response!)}
                          className="flex items-center gap-1 text-[10px] font-bold text-purple-400 hover:text-purple-300 transition-colors"
                        >
                          <Copy size={10} />
                          Use as coaching notes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

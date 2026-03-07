import { useState } from "react";
import { BookOpen, Plus, TrendingUp, TrendingDown } from "lucide-react";
import type { CoachingEventWithImpact } from "@/hooks/useCoachingLog";

interface CoachingActionLogProps {
  events: CoachingEventWithImpact[];
  loading: boolean;
  onAgentClick?: (name: string) => void;
  onLogCoaching?: (data: { agent_name: string; event_type: string; notes: string }) => void;
}

const EVENT_TYPE_BADGE: Record<string, string> = {
  coaching: "bg-purple-500/15 text-purple-400 border-purple-500/25",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  pip: "bg-red-500/20 text-red-400 border-red-500/30",
  training: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  note: "bg-white/10 text-white/50 border-white/15",
};

const FILTER_TABS = ["all", "coaching", "warning", "pip", "training"] as const;

export default function CoachingActionLog({
  events,
  loading,
  onAgentClick,
  onLogCoaching,
}: CoachingActionLogProps) {
  const [filter, setFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [formAgent, setFormAgent] = useState("");
  const [formType, setFormType] = useState("coaching");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const filtered = filter === "all" ? events : events.filter((e) => e.event_type === filter);

  const handleSubmit = async () => {
    if (!formAgent.trim() || !formNotes.trim() || !onLogCoaching) return;
    setSubmitting(true);
    onLogCoaching({ agent_name: formAgent.trim(), event_type: formType, notes: formNotes.trim() });
    setFormAgent("");
    setFormNotes("");
    setShowForm(false);
    setSubmitting(false);
  };

  return (
    <div className="glass-card p-6 rounded-2xl border-white/5">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen size={14} className="text-purple-400" />
        <h3 className="text-sm font-bold text-white uppercase tracking-widest">Coaching Log</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="ml-auto flex items-center gap-1 text-[10px] font-bold text-purple-400 hover:text-purple-300 transition-colors"
        >
          <Plus size={12} />
          Log Session
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="mb-4 p-3 bg-purple-500/5 border border-purple-500/15 rounded-lg space-y-2">
          <input
            type="text"
            placeholder="Agent name"
            value={formAgent}
            onChange={(e) => setFormAgent(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
          />
          <select
            value={formType}
            onChange={(e) => setFormType(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50"
          >
            <option value="coaching">Coaching</option>
            <option value="warning">Warning</option>
            <option value="pip">PIP</option>
            <option value="training">Training</option>
            <option value="note">Note</option>
          </select>
          <textarea
            placeholder="Session notes..."
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="text-[10px] text-white/40 hover:text-white/60 transition-colors px-2 py-1"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!formAgent.trim() || !formNotes.trim() || submitting}
              className="text-[10px] font-bold bg-purple-500/20 text-purple-400 px-3 py-1 rounded hover:bg-purple-500/30 transition-colors disabled:opacity-40"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-3">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors capitalize ${
              filter === tab
                ? "bg-white/10 text-white"
                : "text-white/30 hover:text-white/50"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Events list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-white/5 rounded animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-white/30 text-xs">No coaching events found.</p>
        </div>
      ) : (
        <div className="space-y-1.5 overflow-y-auto max-h-[400px]">
          {filtered.slice(0, 20).map((e) => (
            <div key={e.id} className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0">
              {/* Date */}
              <span className="text-[10px] text-white/30 font-mono w-14 flex-shrink-0">
                {new Date(e.event_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>

              {/* Agent */}
              <button
                onClick={() => onAgentClick?.(e.agent_name)}
                className="text-xs text-white/80 truncate min-w-0 flex-shrink-0 max-w-[100px] text-left hover:text-cyan-400 transition-colors cursor-pointer"
              >
                {e.agent_name}
              </button>

              {/* Type badge */}
              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 capitalize ${
                EVENT_TYPE_BADGE[e.event_type] || EVENT_TYPE_BADGE.note
              }`}>
                {e.event_type}
              </span>

              {/* Notes (truncated) */}
              <span className="text-[10px] text-white/40 truncate flex-1 min-w-0" title={e.notes || ""}>
                {e.notes || "—"}
              </span>

              {/* Impact badge */}
              {e.impact && (
                <span className={`flex items-center gap-0.5 text-[10px] font-mono font-bold flex-shrink-0 ${
                  e.impact.tph_delta > 0 ? "text-emerald-400" : "text-red-400"
                }`}>
                  {e.impact.tph_delta > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {e.impact.tph_delta > 0 ? "+" : ""}{e.impact.tph_delta.toFixed(2)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

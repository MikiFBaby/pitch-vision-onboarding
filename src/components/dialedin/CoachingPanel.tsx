"use client";

import { useState, useEffect } from "react";
import { Plus, ChevronRight } from "lucide-react";
import type { CoachingEvent, CoachingImpact } from "@/types/dialedin-types";

export default function CoachingPanel() {
  const [events, setEvents] = useState<CoachingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [impact, setImpact] = useState<CoachingImpact | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formAgent, setFormAgent] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formType, setFormType] = useState("coaching");
  const [formNotes, setFormNotes] = useState("");
  const [formCoach, setFormCoach] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/dialedin/coaching?limit=50")
      .then((r) => r.json())
      .then((json) => setEvents(json.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadImpact = async (eventId: string) => {
    setSelectedEvent(eventId);
    setImpact(null);
    try {
      const res = await fetch(`/api/dialedin/coaching/impact?event_id=${eventId}`);
      const json = await res.json();
      setImpact(json.data || null);
    } catch {}
  };

  const handleSubmit = async () => {
    if (!formAgent || !formDate) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/dialedin/coaching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_name: formAgent,
          event_date: formDate,
          event_type: formType,
          notes: formNotes || null,
          coach_name: formCoach || null,
        }),
      });
      const json = await res.json();
      if (json.data) {
        setEvents((prev) => [json.data, ...prev]);
        setShowForm(false);
        setFormAgent("");
        setFormDate("");
        setFormNotes("");
        setFormCoach("");
      }
    } catch {}
    setSubmitting(false);
  };

  const typeBadge = (type: string) => {
    const colors: Record<string, string> = {
      coaching: "bg-blue-500/20 text-blue-400",
      warning: "bg-amber-500/20 text-amber-400",
      pip: "bg-red-500/20 text-red-400",
      training: "bg-emerald-500/20 text-emerald-400",
      note: "bg-white/10 text-white/40",
    };
    return colors[type] || colors.note;
  };

  return (
    <div className="flex flex-col h-full bg-[#0c1018] border border-[#1a2332]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a2332] shrink-0">
        <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">Coaching Tracker</span>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 text-[9px] font-mono text-white/30 hover:text-white/50"
        >
          <Plus size={10} /> ADD
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="px-3 py-2 border-b border-[#1a2332] bg-[#080e17] space-y-1.5 shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Agent name"
              value={formAgent}
              onChange={(e) => setFormAgent(e.target.value)}
              className="flex-1 bg-[#050a12] border border-[#1a2332] px-2 py-0.5 text-[10px] font-mono text-white/80 outline-none"
            />
            <input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              className="bg-[#050a12] border border-[#1a2332] px-2 py-0.5 text-[10px] font-mono text-white/60 outline-none [color-scheme:dark]"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
              className="bg-[#050a12] border border-[#1a2332] px-2 py-0.5 text-[10px] font-mono text-white/60 outline-none"
            >
              <option value="coaching">Coaching</option>
              <option value="warning">Warning</option>
              <option value="pip">PIP</option>
              <option value="training">Training</option>
              <option value="note">Note</option>
            </select>
            <input
              type="text"
              placeholder="Coach name"
              value={formCoach}
              onChange={(e) => setFormCoach(e.target.value)}
              className="flex-1 bg-[#050a12] border border-[#1a2332] px-2 py-0.5 text-[10px] font-mono text-white/80 outline-none"
            />
          </div>
          <input
            type="text"
            placeholder="Notes..."
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            className="w-full bg-[#050a12] border border-[#1a2332] px-2 py-0.5 text-[10px] font-mono text-white/80 outline-none"
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !formAgent || !formDate}
            className="px-3 py-0.5 text-[9px] font-mono bg-amber-400/15 text-amber-400 hover:bg-amber-400/25 disabled:opacity-30 transition-colors"
          >
            {submitting ? "SAVING..." : "SAVE"}
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Event list */}
        <div className="w-[260px] border-r border-[#1a2332] overflow-y-auto">
          {loading ? (
            <div className="p-3 animate-pulse bg-white/[0.02]" />
          ) : events.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-[10px] text-white/20 font-mono">No coaching events yet</span>
            </div>
          ) : (
            events.map((e) => (
              <div
                key={e.id}
                onClick={() => loadImpact(e.id)}
                className={`px-2 py-1.5 border-b border-[#1a2332]/30 cursor-pointer transition-colors ${
                  selectedEvent === e.id ? "bg-amber-400/10" : "hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-white/80 truncate">{e.agent_name}</span>
                  <ChevronRight size={10} className="text-white/15 shrink-0" />
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-[8px] font-mono px-1 py-0 rounded ${typeBadge(e.event_type)}`}>
                    {e.event_type.toUpperCase()}
                  </span>
                  <span className="text-[8px] font-mono text-white/20">{e.event_date}</span>
                  {e.coach_name && <span className="text-[8px] font-mono text-white/15">by {e.coach_name}</span>}
                </div>
                {e.notes && <div className="text-[8px] font-mono text-white/20 truncate mt-0.5">{e.notes}</div>}
              </div>
            ))
          )}
        </div>

        {/* Impact panel */}
        <div className="flex-1 overflow-y-auto">
          {!impact ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-[10px] text-white/15 font-mono">Select an event to view impact</span>
            </div>
          ) : (
            <div className="p-3 space-y-3">
              <div className="text-[9px] uppercase tracking-wider text-white/25 font-mono">Before / After Analysis</div>
              <div className="grid grid-cols-3 gap-2">
                {/* SLA/hr */}
                <ImpactCard
                  label="SLA/hr"
                  before={impact.before.avg_tph}
                  after={impact.after.avg_tph}
                  format={(v) => v.toFixed(2)}
                />
                {/* Conversion */}
                <ImpactCard
                  label="Conv%"
                  before={impact.before.avg_conv}
                  after={impact.after.avg_conv}
                  format={(v) => `${v.toFixed(1)}%`}
                />
                {/* Connect */}
                <ImpactCard
                  label="Conn%"
                  before={impact.before.avg_connect}
                  after={impact.after.avg_connect}
                  format={(v) => `${v.toFixed(1)}%`}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-white/25">
                  Before: {impact.before.days} days | After: {impact.after.days} days
                </span>
                <span className={`text-[10px] font-mono font-bold ${impact.impact.improved ? "text-emerald-400" : "text-red-400"}`}>
                  {impact.impact.improved ? "IMPROVED" : "DECLINED"} ({impact.impact.tph_pct_change > 0 ? "+" : ""}{impact.impact.tph_pct_change.toFixed(1)}%)
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ImpactCard({
  label,
  before,
  after,
  format,
}: {
  label: string;
  before: number;
  after: number;
  format: (v: number) => string;
}) {
  const delta = after - before;
  const positive = delta >= 0;
  return (
    <div className="bg-[#050a12] border border-[#1a2332] p-2">
      <div className="text-[8px] uppercase tracking-wider text-white/25 font-mono mb-1">{label}</div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[9px] text-white/30 font-mono">Before</div>
          <div className="text-sm font-mono text-white/60">{format(before)}</div>
        </div>
        <div className="text-center px-1">
          <span className={`text-[10px] font-mono font-bold ${positive ? "text-emerald-400" : "text-red-400"}`}>
            {positive ? "+" : ""}{format(delta)}
          </span>
        </div>
        <div className="text-right">
          <div className="text-[9px] text-white/30 font-mono">After</div>
          <div className="text-sm font-mono text-white/90 font-bold">{format(after)}</div>
        </div>
      </div>
    </div>
  );
}

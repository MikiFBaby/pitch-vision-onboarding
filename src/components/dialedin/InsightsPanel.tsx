"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, RefreshCw, Send, Sparkles, Loader2 } from "lucide-react";
import type { DailyKPIs, AgentPerformance } from "@/types/dialedin-types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface InsightsPanelProps {
  kpis: DailyKPIs | null;
  agents: AgentPerformance[];
  date: string;
  onClose: () => void;
}

const QUICK_CHIPS = [
  "Who needs coaching?",
  "Top revenue drivers?",
  "Team comparison?",
  "Efficiency gaps?",
];

function buildKPISummary(kpis: DailyKPIs | null, agents: AgentPerformance[]): string {
  if (!kpis) return "No data available for this date.";

  const lines: string[] = [];

  // Daily KPIs
  lines.push(`Date: ${kpis.report_date}`);
  lines.push(`Total Agents: ${kpis.total_agents} (${kpis.agents_with_transfers} with SLA)`);
  lines.push(`Total Dials: ${kpis.total_dials.toLocaleString()}`);
  lines.push(`Total Connects: ${kpis.total_connects.toLocaleString()}`);
  lines.push(`Total SLA: ${kpis.total_transfers.toLocaleString()}`);
  lines.push(`SLA/hr: ${kpis.transfers_per_hour.toFixed(2)}`);
  lines.push(`Conversion Rate: ${kpis.conversion_rate.toFixed(1)}%`);
  lines.push(`Connect Rate: ${kpis.connect_rate.toFixed(1)}%`);
  lines.push(`Man Hours: ${kpis.total_man_hours.toFixed(1)}`);
  if (kpis.delta_transfers != null) lines.push(`SLA Delta vs Prev Day: ${kpis.delta_transfers > 0 ? "+" : ""}${kpis.delta_transfers}`);
  if (kpis.delta_tph != null) lines.push(`SLA/hr Delta vs Prev Day: ${kpis.delta_tph > 0 ? "+" : ""}${kpis.delta_tph.toFixed(2)}`);

  // Distribution
  if (kpis.distribution) {
    const d = kpis.distribution;
    lines.push(`\nSLA/hr Distribution: P10=${d.p10.toFixed(2)}, P25=${d.p25.toFixed(2)}, P50=${d.p50.toFixed(2)}, P75=${d.p75.toFixed(2)}, P90=${d.p90.toFixed(2)}, Mean=${d.mean.toFixed(2)}`);
  }

  // Top 10 agents
  const qualified = agents.filter(a => a.hours_worked >= 2);
  const topAgents = [...qualified].sort((a, b) => b.tph - a.tph).slice(0, 10);
  if (topAgents.length > 0) {
    lines.push("\nTop 10 Agents by SLA/hr:");
    for (const a of topAgents) {
      lines.push(`  ${a.agent_name} (${a.team || "No team"}) — SLA/hr: ${a.tph.toFixed(2)}, SLA: ${a.transfers}, Conv: ${a.conversion_rate.toFixed(1)}%, Hours: ${a.hours_worked.toFixed(1)}`);
    }
  }

  // Bottom 10 agents (coaching targets)
  const bottomAgents = [...qualified].sort((a, b) => a.tph - b.tph).slice(0, 10);
  if (bottomAgents.length > 0) {
    lines.push("\nBottom 10 Agents by SLA/hr (Coaching Targets):");
    for (const a of bottomAgents) {
      lines.push(`  ${a.agent_name} (${a.team || "No team"}) — SLA/hr: ${a.tph.toFixed(2)}, SLA: ${a.transfers}, Conv: ${a.conversion_rate.toFixed(1)}%, Hours: ${a.hours_worked.toFixed(1)}`);
    }
  }

  // Zero transfer agents
  const zeroTransfer = agents.filter(a => a.transfers === 0 && a.hours_worked >= 2);
  if (zeroTransfer.length > 0) {
    lines.push(`\nZero SLA Agents (2+ hrs): ${zeroTransfer.length} agents`);
    for (const a of zeroTransfer.slice(0, 10)) {
      lines.push(`  ${a.agent_name} (${a.team || "No team"}) — Hours: ${a.hours_worked.toFixed(1)}, Dials: ${a.dials}`);
    }
    if (zeroTransfer.length > 10) lines.push(`  ... and ${zeroTransfer.length - 10} more`);
  }

  // Team summary
  const teamMap = new Map<string, { agents: number; transfers: number; tph: number[]; hours: number }>();
  for (const a of agents) {
    const t = a.team || "Unassigned";
    const existing = teamMap.get(t) || { agents: 0, transfers: 0, tph: [], hours: 0 };
    existing.agents++;
    existing.transfers += a.transfers;
    existing.tph.push(a.tph);
    existing.hours += a.hours_worked;
    teamMap.set(t, existing);
  }
  if (teamMap.size > 0) {
    lines.push("\nTeam Summary:");
    const teams = [...teamMap.entries()]
      .map(([name, d]) => ({ name, ...d, avgTph: d.tph.reduce((s, v) => s + v, 0) / d.tph.length }))
      .sort((a, b) => b.avgTph - a.avgTph);
    for (const t of teams) {
      lines.push(`  ${t.name}: ${t.agents} agents, ${t.transfers} SLA, Avg SLA/hr: ${t.avgTph.toFixed(2)}, Hours: ${t.hours.toFixed(0)}`);
    }
  }

  return lines.join("\n");
}

export default function InsightsPanel({ kpis, agents, date, onClose }: InsightsPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [insights, setInsights] = useState("");
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"insights" | "chat">("insights");

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  const kpiSummary = buildKPISummary(kpis, agents);

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    setInsights("");

    try {
      const res = await fetch("/api/dialedin/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "insights", date, kpiSummary }),
      });

      if (!res.ok) {
        const err = await res.json();
        setInsights(`Error: ${err.error || "Failed to fetch insights"}`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              accumulated += parsed.content;
              setInsights(accumulated);
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      setInsights(`Error: ${String(err)}`);
    } finally {
      setInsightsLoading(false);
    }
  }, [date, kpiSummary]);

  // Auto-fetch insights on mount
  useEffect(() => {
    if (kpis) fetchInsights();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendChat = async (msg: string) => {
    if (!msg.trim() || chatLoading) return;

    const userMsg: ChatMessage = { role: "user", content: msg.trim() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/dialedin/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          date,
          kpiSummary,
          message: msg.trim(),
          history: chatMessages,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setChatMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.error}` }]);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      // Add placeholder assistant message
      setChatMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              accumulated += parsed.content;
              setChatMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: accumulated };
                return updated;
              });
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: "assistant", content: `Error: ${String(err)}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div
      ref={ref}
      className="absolute right-0 top-0 bottom-0 w-[380px] bg-[#0c1018] border-l border-[#1a2332] z-20 flex flex-col shadow-2xl shadow-black/50"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a2332] shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={12} className="text-amber-400" />
          <span className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">
            AI Insights
          </span>
          <span className="text-[9px] text-white/20 font-mono">MiniMax M2.5</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchInsights}
            disabled={insightsLoading}
            className="p-1 text-white/20 hover:text-white/40 disabled:opacity-30"
            title="Refresh insights"
          >
            <RefreshCw size={12} className={insightsLoading ? "animate-spin" : ""} />
          </button>
          <button onClick={onClose} className="p-1 text-white/20 hover:text-white/40">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-[#1a2332] shrink-0">
        <button
          onClick={() => setActiveTab("insights")}
          className={`flex-1 py-1.5 text-[9px] uppercase tracking-wider font-mono transition-colors ${
            activeTab === "insights"
              ? "text-amber-400 border-b border-amber-400 bg-amber-400/5"
              : "text-white/25 hover:text-white/40"
          }`}
        >
          Insights
        </button>
        <button
          onClick={() => setActiveTab("chat")}
          className={`flex-1 py-1.5 text-[9px] uppercase tracking-wider font-mono transition-colors ${
            activeTab === "chat"
              ? "text-amber-400 border-b border-amber-400 bg-amber-400/5"
              : "text-white/25 hover:text-white/40"
          }`}
        >
          Chat
        </button>
      </div>

      {/* Insights Tab */}
      {activeTab === "insights" && (
        <div className="flex-1 overflow-y-auto min-h-0 p-3">
          {insightsLoading && !insights && (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 size={14} className="text-amber-400 animate-spin" />
              <span className="text-[10px] text-white/30 font-mono">ANALYZING DATA...</span>
            </div>
          )}
          {insights && (
            <div className="text-[11px] text-white/70 font-mono leading-relaxed whitespace-pre-wrap break-words">
              {insights.split(/^(## .+)$/gm).map((part, i) => {
                if (part.startsWith("## ")) {
                  return (
                    <div key={i} className="text-amber-400 font-bold text-[10px] uppercase tracking-wider mt-3 mb-1 first:mt-0">
                      {part.replace("## ", "")}
                    </div>
                  );
                }
                if (part.trim()) {
                  return (
                    <div key={i} className="mb-2 text-white/60">
                      {part.split("\n").map((line, j) => {
                        const trimmed = line.trim();
                        if (!trimmed) return null;
                        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                          return (
                            <div key={j} className="pl-2 border-l border-amber-400/20 mb-1">
                              {trimmed.slice(2)}
                            </div>
                          );
                        }
                        if (/^\d+\.\s/.test(trimmed)) {
                          return (
                            <div key={j} className="pl-2 border-l border-cyan-400/20 mb-1">
                              {trimmed}
                            </div>
                          );
                        }
                        return <div key={j}>{line}</div>;
                      })}
                    </div>
                  );
                }
                return null;
              })}
              {insightsLoading && (
                <span className="inline-block w-1.5 h-3 bg-amber-400/60 animate-pulse ml-0.5" />
              )}
            </div>
          )}
          {!insightsLoading && !insights && !kpis && (
            <div className="flex items-center justify-center py-8">
              <span className="text-[10px] text-white/20 font-mono">NO DATA FOR ANALYSIS</span>
            </div>
          )}
        </div>
      )}

      {/* Chat Tab */}
      {activeTab === "chat" && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {chatMessages.length === 0 && (
              <div className="text-center py-4">
                <Sparkles size={16} className="text-amber-400/30 mx-auto mb-2" />
                <div className="text-[10px] text-white/20 font-mono mb-3">ASK ABOUT YOUR DATA</div>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {QUICK_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => sendChat(chip)}
                      className="text-[9px] font-mono px-2 py-1 border border-[#1a2332] text-white/30 hover:text-amber-400 hover:border-amber-400/30 transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`text-[11px] font-mono ${
                  msg.role === "user"
                    ? "text-white/80 bg-white/[0.03] p-2 border-l-2 border-amber-400/40"
                    : "text-white/60 p-2 border-l-2 border-cyan-400/20"
                }`}
              >
                <div className="text-[8px] uppercase tracking-wider mb-0.5 text-white/20">
                  {msg.role === "user" ? "You" : "MiniMax"}
                </div>
                <div className="whitespace-pre-wrap break-words leading-relaxed">
                  {msg.content}
                  {chatLoading && i === chatMessages.length - 1 && msg.role === "assistant" && (
                    <span className="inline-block w-1.5 h-3 bg-cyan-400/60 animate-pulse ml-0.5" />
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Chips (when has messages) */}
          {chatMessages.length > 0 && (
            <div className="px-3 py-1 border-t border-[#1a2332] shrink-0">
              <div className="flex flex-wrap gap-1">
                {QUICK_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => sendChat(chip)}
                    disabled={chatLoading}
                    className="text-[8px] font-mono px-1.5 py-0.5 border border-[#1a2332] text-white/20 hover:text-amber-400 hover:border-amber-400/30 transition-colors disabled:opacity-30"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat Input */}
          <div className="px-3 py-2 border-t border-[#1a2332] shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendChat(chatInput);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about the data..."
                disabled={chatLoading}
                className="flex-1 bg-[#050a12] border border-[#1a2332] text-white/80 text-[11px] font-mono px-2 py-1.5 focus:outline-none focus:border-amber-400/40 placeholder:text-white/15 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="p-1.5 text-amber-400/60 hover:text-amber-400 disabled:text-white/10 transition-colors"
              >
                {chatLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

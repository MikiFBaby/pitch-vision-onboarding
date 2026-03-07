"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, Loader2 } from "lucide-react";
import AuraAvatar from "./AuraAvatar";

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

interface CoachContext {
    productType: string;
    afCodes: string[];
    manualViolations: string[];
    performanceProfile: {
        avgSlaHr: number | null;
        breakEven: number;
        breakEvenGap: number | null;
        tierName: string | null;
        trend: "improving" | "declining" | "stable";
        conversionRate: number | null;
        qaScore: number | null;
    };
    slackHistory?: { message_in: string; message_out: string; issue?: string; created_at: string }[];
}

interface AuraCoachChatProps {
    agentName: string;
    agentEmail: string;
    context: CoachContext;
    onStartVoice: () => void;
    topViolationCode?: string | null;
}

export default function AuraCoachChat({ agentName, agentEmail, context, onStartVoice, topViolationCode }: AuraCoachChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [slackHistory, setSlackHistory] = useState<CoachContext["slackHistory"]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Fetch Slack history once on mount
    useEffect(() => {
        if (!agentEmail) return;
        fetch("/api/qa/slack-history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: agentEmail }),
        })
            .then((r) => r.json())
            .then((d) => setSlackHistory(d.history || []))
            .catch(() => {});
    }, [agentEmail]);

    // Auto-scroll on new messages
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages]);

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim() || loading) return;
        const userMsg: ChatMessage = { role: "user", content: text.trim() };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setSuggestions([]);
        setLoading(true);

        try {
            const res = await fetch("/api/agent/aura-coach-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: text.trim(),
                    history: [...messages, userMsg].map((m) => ({ role: m.role === "assistant" ? "model" : "user", content: m.content })),
                    agentName,
                    agentEmail,
                    context: {
                        ...context,
                        slackHistory: slackHistory || [],
                    },
                }),
            });
            const data = await res.json();
            if (data.reply) {
                setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
                if (data.suggestions?.length) setSuggestions(data.suggestions);
            }
        } catch {
            setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I couldn't connect. Try again in a moment." }]);
        } finally {
            setLoading(false);
        }
    }, [loading, messages, agentName, agentEmail, context, slackHistory]);

    const quickChips = [
        topViolationCode ? `How do I avoid ${topViolationCode}?` : null,
        "What should I focus on?",
        "Practice a call with me",
        "Explain my metrics",
    ].filter(Boolean) as string[];

    return (
        <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
                <AuraAvatar size={36} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">Aura Coach</span>
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Online
                        </span>
                    </div>
                    <div className="text-[10px] text-white/40">AI coaching assistant — ask anything about your performance</div>
                </div>
                <button
                    onClick={onStartVoice}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-lg text-white text-xs font-bold transition-all shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40"
                >
                    <Mic size={12} />
                    Voice
                </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="h-72 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-white/10">
                {messages.length === 0 && (
                    <div className="text-center py-8">
                        <AuraAvatar size={48} />
                        <p className="text-sm text-white/40 mt-3">
                            Hi {agentName.split(" ")[0]}! Ask me anything about your performance, compliance, or practice a call.
                        </p>
                    </div>
                )}

                <AnimatePresence mode="popLayout">
                    {messages.map((msg, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            {msg.role === "assistant" && <AuraAvatar size={24} />}
                            <div
                                className={`max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                                    msg.role === "user"
                                        ? "bg-indigo-600/30 text-white rounded-br-sm"
                                        : "bg-white/5 text-white/80 rounded-bl-sm"
                                }`}
                            >
                                {msg.content}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {loading && (
                    <div className="flex gap-2 items-center">
                        <AuraAvatar size={24} />
                        <div className="bg-white/5 rounded-xl px-3 py-2 flex items-center gap-2">
                            <Loader2 size={12} className="animate-spin text-purple-400" />
                            <span className="text-xs text-white/40">Thinking...</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Quick chips / suggestions */}
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                {(suggestions.length > 0 ? suggestions : messages.length === 0 ? quickChips : []).map((chip) => (
                    <button
                        key={chip}
                        onClick={() => sendMessage(chip)}
                        disabled={loading}
                        className="text-[10px] font-medium text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-full transition-colors disabled:opacity-40"
                    >
                        {chip}
                    </button>
                ))}
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 px-4 pb-4">
                <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
                    placeholder="Ask Aura anything..."
                    disabled={loading}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50 disabled:opacity-50"
                />
                <button
                    onClick={() => sendMessage(input)}
                    disabled={loading || !input.trim()}
                    className="p-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white transition-colors disabled:opacity-30 disabled:hover:bg-indigo-600"
                >
                    <Send size={14} />
                </button>
            </div>
        </div>
    );
}

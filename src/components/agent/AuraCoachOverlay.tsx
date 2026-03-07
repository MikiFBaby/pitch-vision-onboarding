"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { X, Mic, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { useGeminiLive } from "@/hooks/useGeminiLive";
import { buildAgentCoachPrompt } from "@/utils/aura-agent-coach";
import { motion, AnimatePresence } from "framer-motion";

interface PerformanceProfile {
    avgSlaHr: number | null;
    breakEven: number;
    breakEvenGap: number | null;
    tierName: string | null;
    trend: "improving" | "declining" | "stable";
    conversionRate: number | null;
    qaScore: number | null;
}

interface TrainingScenario {
    scenario: string;
    tips: string[];
    af_codes: string[];
    key_phrases?: string[];
}

interface AuraCoachOverlayProps {
    agentName: string;
    agentEmail: string;
    productType: string;
    afCodes: string[];
    manualViolations: string[];
    performanceProfile: PerformanceProfile;
    trainingScenario?: TrainingScenario | null;
    onClose: () => void;
}

type Phase = "loading" | "ready" | "active" | "ended" | "error";

export default function AuraCoachOverlay({
    agentName,
    agentEmail,
    productType,
    afCodes,
    manualViolations,
    performanceProfile,
    trainingScenario,
    onClose,
}: AuraCoachOverlayProps) {
    const [phase, setPhase] = useState<Phase>("loading");
    const [systemPrompt, setSystemPrompt] = useState<string>("");
    const [errorMsg, setErrorMsg] = useState<string>("");
    const mountedRef = useRef(true);

    const {
        connect,
        disconnect,
        isConnected,
        isSpeaking,
        userSpeaking,
        error: hookError,
    } = useGeminiLive();

    // Build system prompt on mount
    useEffect(() => {
        mountedRef.current = true;
        let cancelled = false;

        async function prepare() {
            try {
                // Fetch Slack history for this agent
                let slackHistory: any[] = [];
                if (agentEmail) {
                    try {
                        const res = await fetch("/api/qa/slack-history", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ email: agentEmail }),
                        });
                        const data = await res.json();
                        slackHistory = data.history || [];
                    } catch {
                        // Slack history is optional
                    }
                }

                if (cancelled) return;

                const prompt = buildAgentCoachPrompt({
                    agentName,
                    productType,
                    afCodes,
                    manualViolations,
                    performanceProfile,
                    slackHistory,
                    trainingScenario,
                });

                if (!cancelled) {
                    setSystemPrompt(prompt);
                    setPhase("ready");
                }
            } catch {
                if (!cancelled) setPhase("ready");
            }
        }

        prepare();
        return () => {
            cancelled = true;
            mountedRef.current = false;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Track connection drops (only after we've been connected at least once)
    const wasConnectedRef = useRef(false);
    useEffect(() => {
        if (isConnected) {
            wasConnectedRef.current = true;
        }
        if (phase === "active" && !isConnected && wasConnectedRef.current) {
            setPhase("ended");
        }
    }, [isConnected, phase]);

    // Catch async WebSocket errors (fires after connect() resolves)
    useEffect(() => {
        if (hookError && (phase === "active" || phase === "loading")) {
            setErrorMsg(hookError);
            setPhase("error");
        }
    }, [hookError, phase]);

    const handleStart = useCallback(async () => {
        setPhase("active");
        setErrorMsg("");
        try {
            await connect({
                systemInstruction: systemPrompt,
                tools: [], // No tools for agent coaching — pure voice
            });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Connection failed";
            setErrorMsg(msg);
            setPhase("error");
        }
    }, [connect, systemPrompt]);

    const handleRetry = useCallback(() => {
        setErrorMsg("");
        wasConnectedRef.current = false;
        setPhase("ready");
    }, []);

    const handleEnd = useCallback(() => {
        disconnect();
        setPhase("ended");
    }, [disconnect]);

    const handleClose = useCallback(() => {
        if (isConnected) disconnect();
        onClose();
    }, [disconnect, isConnected, onClose]);

    const statusText = isSpeaking
        ? "Aura is speaking..."
        : userSpeaking
            ? "Listening to you..."
            : isConnected
                ? "Listening..."
                : "Connecting...";

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-xl flex flex-col"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                        <span className="text-sm font-bold text-white tracking-wide">Aura Coach</span>
                        <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded uppercase">
                            {productType}
                        </span>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Center Content */}
                <div className="flex-1 flex flex-col items-center justify-center px-6">
                    {phase === "loading" && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center gap-4"
                        >
                            <Loader2 size={32} className="text-purple-400 animate-spin" />
                            <p className="text-white/50 text-sm">Preparing your coaching session...</p>
                        </motion.div>
                    )}

                    {phase === "ready" && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex flex-col items-center gap-6 max-w-sm text-center"
                        >
                            {/* Orb preview */}
                            <div className="relative w-28 h-28">
                                <motion.div
                                    animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.6, 0.4] }}
                                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                                    className="absolute inset-0 bg-purple-500 rounded-full blur-xl"
                                />
                                <div className="relative z-10 w-28 h-28 rounded-full bg-gradient-to-br from-purple-900/60 to-indigo-900/60 border border-white/10 flex items-center justify-center shadow-2xl shadow-purple-900/40">
                                    <Mic size={36} className="text-purple-300" />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xl font-bold text-white mb-2">Ready to Coach</h3>
                                <p className="text-white/50 text-sm leading-relaxed">
                                    Aura will greet you by name and discuss your performance, practice scenarios, or answer compliance questions.
                                </p>
                            </div>

                            {trainingScenario && (
                                <div className="w-full bg-white/5 border border-white/10 rounded-xl p-3">
                                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Scenario Loaded</p>
                                    <p className="text-xs text-white/60 line-clamp-2">{trainingScenario.scenario}</p>
                                </div>
                            )}

                            <button
                                onClick={handleStart}
                                className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl text-white font-bold text-sm uppercase tracking-wider transition-all shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-105"
                            >
                                <Mic size={16} />
                                Start Session
                            </button>
                        </motion.div>
                    )}

                    {phase === "active" && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center gap-6"
                        >
                            {/* Animated orb */}
                            <div className="relative w-36 h-36">
                                {/* Outer glow rings */}
                                <motion.div
                                    animate={{
                                        scale: isSpeaking ? [1, 1.3, 1] : [1, 1.1, 1],
                                        opacity: isSpeaking ? [0.3, 0.5, 0.3] : [0.15, 0.25, 0.15],
                                    }}
                                    transition={{ duration: isSpeaking ? 1.2 : 3, repeat: Infinity, ease: "easeInOut" }}
                                    className="absolute inset-0 bg-purple-500 rounded-full blur-2xl"
                                />
                                {isSpeaking && (
                                    <motion.div
                                        animate={{ scale: [1, 1.5, 1], opacity: [0.1, 0.2, 0.1] }}
                                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                                        className="absolute -inset-4 bg-indigo-400 rounded-full blur-3xl"
                                    />
                                )}

                                {/* Core orb */}
                                <div className="relative z-10 w-36 h-36 rounded-full bg-black border border-white/10 flex items-center justify-center overflow-hidden shadow-2xl shadow-purple-900/50">
                                    <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 to-indigo-900/40" />

                                    {/* Sound wave bars */}
                                    <div className="flex items-center justify-center gap-1">
                                        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                                            <motion.div
                                                key={i}
                                                animate={{
                                                    height: isSpeaking
                                                        ? [8, 28 + Math.random() * 16, 8]
                                                        : userSpeaking
                                                            ? [6, 14 + Math.random() * 8, 6]
                                                            : [4, 8, 4],
                                                    opacity: isSpeaking ? 1 : userSpeaking ? 0.7 : 0.3,
                                                }}
                                                transition={{
                                                    duration: isSpeaking ? 0.6 : 1.2,
                                                    repeat: Infinity,
                                                    delay: i * 0.08,
                                                    ease: "easeInOut",
                                                }}
                                                className={`w-1.5 rounded-full ${
                                                    isSpeaking
                                                        ? "bg-purple-400"
                                                        : userSpeaking
                                                            ? "bg-emerald-400"
                                                            : "bg-white/40"
                                                }`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Status */}
                            <motion.p
                                key={statusText}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-sm font-medium text-white/70 tracking-wide"
                            >
                                {statusText}
                            </motion.p>

                            {/* End button */}
                            <button
                                onClick={handleEnd}
                                className="flex items-center gap-2 px-6 py-2.5 bg-white/10 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 rounded-full text-white/80 hover:text-red-300 text-sm font-medium transition-all"
                            >
                                <X size={14} />
                                End Session
                            </button>
                        </motion.div>
                    )}

                    {phase === "ended" && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center gap-5 text-center"
                        >
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-900/40 to-indigo-900/40 border border-white/10 flex items-center justify-center">
                                <Mic size={28} className="text-purple-400/50" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white mb-1">Session Complete</h3>
                                <p className="text-white/40 text-sm">Great practice! Keep applying what you learned.</p>
                            </div>
                            <button
                                onClick={handleClose}
                                className="px-6 py-2.5 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl text-white text-sm font-medium transition-all"
                            >
                                Close
                            </button>
                        </motion.div>
                    )}

                    {phase === "error" && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center gap-5 text-center max-w-sm"
                        >
                            <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                                <AlertCircle size={28} className="text-red-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white mb-2">Connection Failed</h3>
                                <p className="text-white/50 text-sm leading-relaxed">
                                    {errorMsg || "Could not connect to Aura. Check your microphone permissions and try again."}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleRetry}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl text-white font-bold text-sm transition-all shadow-lg shadow-purple-500/20"
                                >
                                    <RefreshCw size={14} />
                                    Try Again
                                </button>
                                <button
                                    onClick={handleClose}
                                    className="px-6 py-2.5 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl text-white text-sm font-medium transition-all"
                                >
                                    Close
                                </button>
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* Footer hint */}
                {phase === "active" && (
                    <div className="px-6 py-3 border-t border-white/5 text-center">
                        <p className="text-[10px] text-white/25">
                            Speak naturally — Aura can hear you in real time. Say &ldquo;let&apos;s role-play&rdquo; to practice a scenario.
                        </p>
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
}

"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, RotateCcw, X, AlertCircle } from "lucide-react";

interface Message {
    role: "customer" | "agent";
    text: string;
}

interface VoiceRolePlayProps {
    agentName: string;
    productType?: string;
    afCodes?: string[];
    manualViolations?: string[];
    performanceProfile?: Record<string, unknown>;
    onClose: () => void;
}

type PlayState = "ready" | "ai_speaking" | "listening" | "processing" | "ended";

const STATUS_CONFIG: Record<PlayState, { label: string; sublabel: string; orbClass: string }> = {
    ready: { label: "Ready to Practice", sublabel: "You'll role-play a call with an AI customer", orbClass: "bg-white/10" },
    ai_speaking: { label: "Customer Speaking", sublabel: "Listen to the customer...", orbClass: "bg-blue-500/40" },
    listening: { label: "Your Turn", sublabel: "Speak now — respond as you would on a real call", orbClass: "bg-emerald-500/40" },
    processing: { label: "Thinking...", sublabel: "Preparing response", orbClass: "bg-amber-500/30" },
    ended: { label: "Session Complete", sublabel: "Review your feedback below", orbClass: "bg-indigo-500/30" },
};

export default function VoiceRolePlay({
    agentName,
    productType,
    afCodes = [],
    manualViolations = [],
    performanceProfile,
    onClose,
}: VoiceRolePlayProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [playState, setPlayState] = useState<PlayState>("ready");
    const [feedback, setFeedback] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [interimText, setInterimText] = useState("");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognitionRef = useRef<any>(null);
    const abortRef = useRef(false);
    const messagesRef = useRef<Message[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Check browser support
    const supported = typeof window !== "undefined" &&
        ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) &&
        "speechSynthesis" in window;

    // Load voices (Chrome needs voiceschanged event)
    const [voicesLoaded, setVoicesLoaded] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
        const loadVoices = () => {
            const v = window.speechSynthesis.getVoices();
            if (v.length > 0) setVoicesLoaded(true);
        };
        loadVoices();
        window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
        return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    }, []);

    // Scroll transcript to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, interimText]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            abortRef.current = true;
            window.speechSynthesis?.cancel();
            recognitionRef.current?.abort();
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        };
    }, []);

    const speak = useCallback((text: string): Promise<void> => {
        return new Promise((resolve) => {
            if (!("speechSynthesis" in window)) { resolve(); return; }

            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.92;
            utterance.pitch = 1.05;

            // Pick a natural-sounding voice
            const voices = window.speechSynthesis.getVoices();
            const preferred = voices.find(v =>
                v.name.includes("Samantha") ||
                v.name.includes("Karen") ||
                v.name.includes("Google US English") ||
                v.name.includes("Microsoft Aria") ||
                (v.lang.startsWith("en-US") && v.localService && !v.name.toLowerCase().includes("male"))
            ) || voices.find(v => v.lang.startsWith("en"));
            if (preferred) utterance.voice = preferred;

            utterance.onend = () => resolve();
            utterance.onerror = () => resolve();

            window.speechSynthesis.speak(utterance);
        });
    }, []);

    const listen = useCallback((): Promise<string> => {
        return new Promise((resolve, reject) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const w = window as any;
            const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
            if (!SR) { reject(new Error("Speech recognition not supported")); return; }

            const recognition = new SR();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = "en-US";

            let finalTranscript = "";
            let hasResult = false;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            recognition.onresult = (event: any) => {
                hasResult = true;
                let interim = "";
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript + " ";
                    } else {
                        interim += event.results[i][0].transcript;
                    }
                }
                setInterimText(interim);

                // Reset silence timer on every result
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = setTimeout(() => {
                    if (finalTranscript.trim()) {
                        recognition.stop();
                    }
                }, 3000); // 3s silence = end of turn
            };

            recognition.onend = () => {
                setInterimText("");
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                resolve(finalTranscript.trim());
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            recognition.onerror = (event: any) => {
                setInterimText("");
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                if (event.error === "no-speech") {
                    resolve("");
                } else if (event.error === "not-allowed") {
                    reject(new Error("Microphone access denied. Please allow microphone access in your browser and try again."));
                } else {
                    reject(new Error(`Speech recognition error: ${event.error}`));
                }
            };

            recognitionRef.current = recognition;
            recognition.start();

            // Safety timeout — if no speech after 15s, stop
            setTimeout(() => {
                if (!hasResult) {
                    recognition.stop();
                }
            }, 15000);
        });
    }, []);

    const getAIResponse = useCallback(async (history: Message[], end = false) => {
        const resp = await fetch("/api/agent/training-voice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                agentName,
                productType,
                afCodes,
                manualViolations,
                performanceProfile,
                conversationHistory: history,
                endConversation: end,
            }),
        });
        if (!resp.ok) throw new Error("AI response failed");
        return resp.json();
    }, [agentName, productType, afCodes, manualViolations, performanceProfile]);

    const runConversation = useCallback(async () => {
        let history: Message[] = [];
        abortRef.current = false;

        for (let turn = 0; turn < 8; turn++) {
            if (abortRef.current) break;

            // 1. Get AI customer line
            setPlayState("processing");
            try {
                const { response } = await getAIResponse(history);
                if (abortRef.current) break;

                const customerMsg: Message = { role: "customer", text: response };
                history = [...history, customerMsg];
                messagesRef.current = history;
                setMessages([...history]);

                // 2. Speak the customer line
                setPlayState("ai_speaking");
                await speak(response);
                if (abortRef.current) break;

                // 3. Listen for agent response
                setPlayState("listening");
                const agentText = await listen();
                if (abortRef.current) break;

                if (!agentText) {
                    // No speech detected — skip this turn and let AI continue
                    continue;
                }

                const agentMsg: Message = { role: "agent", text: agentText };
                history = [...history, agentMsg];
                messagesRef.current = history;
                setMessages([...history]);
            } catch (err) {
                if (abortRef.current) break;
                setError(err instanceof Error ? err.message : "Something went wrong");
                setPlayState("ended");
                return;
            }
        }

        // Get feedback
        if (!abortRef.current) {
            setPlayState("processing");
            try {
                const { feedback: fb } = await getAIResponse(history, true);
                setFeedback(fb || "Practice session complete. Keep it up!");
            } catch {
                setFeedback("Practice session complete. Good work!");
            }
            setPlayState("ended");
        }
    }, [getAIResponse, speak, listen]);

    const handleStart = useCallback(() => {
        setMessages([]);
        setFeedback(null);
        setError(null);
        messagesRef.current = [];
        runConversation();
    }, [runConversation]);

    const handleStop = useCallback(async () => {
        abortRef.current = true;
        window.speechSynthesis?.cancel();
        recognitionRef.current?.abort();
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        const history = messagesRef.current;
        if (history.length > 0) {
            setPlayState("processing");
            try {
                const { feedback: fb } = await getAIResponse(history, true);
                setFeedback(fb || "Practice session ended early.");
            } catch {
                setFeedback("Practice session ended.");
            }
        } else {
            setFeedback("Practice session ended.");
        }
        setPlayState("ended");
    }, [getAIResponse]);

    const handleRestart = useCallback(() => {
        abortRef.current = true;
        window.speechSynthesis?.cancel();
        recognitionRef.current?.abort();
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        setTimeout(() => {
            handleStart();
        }, 100);
    }, [handleStart]);

    const config = STATUS_CONFIG[playState];

    return (
        <div className="fixed inset-0 z-[60] bg-[#050508] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                <div>
                    <h2 className="text-base font-bold text-white tracking-tight">Voice Practice</h2>
                    <p className="text-[11px] text-white/30">{productType || "Insurance"} call simulation</p>
                </div>
                <button
                    onClick={() => { abortRef.current = true; window.speechSynthesis?.cancel(); recognitionRef.current?.abort(); onClose(); }}
                    className="text-white/30 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Center Area — Orb + Status */}
            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 min-h-0">
                {/* Animated Orb */}
                <div className="relative">
                    <motion.div
                        className={`w-28 h-28 rounded-full ${config.orbClass} transition-colors duration-500`}
                        animate={
                            playState === "ai_speaking"
                                ? { scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }
                                : playState === "listening"
                                    ? { scale: [1, 1.08, 1], opacity: [0.5, 0.9, 0.5] }
                                    : playState === "processing"
                                        ? { rotate: 360 }
                                        : {}
                        }
                        transition={
                            playState === "processing"
                                ? { duration: 2, repeat: Infinity, ease: "linear" }
                                : { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                        }
                    />
                    {/* Ring pulses */}
                    {playState === "listening" && (
                        <>
                            <motion.div
                                className="absolute inset-0 rounded-full border-2 border-emerald-500/40"
                                animate={{ scale: [1, 1.6], opacity: [0.5, 0] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                            />
                            <motion.div
                                className="absolute inset-0 rounded-full border-2 border-emerald-500/20"
                                animate={{ scale: [1, 2], opacity: [0.3, 0] }}
                                transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
                            />
                        </>
                    )}
                    {playState === "ai_speaking" && (
                        <motion.div
                            className="absolute inset-0 rounded-full border-2 border-blue-500/30"
                            animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
                            transition={{ duration: 1.2, repeat: Infinity }}
                        />
                    )}
                    {/* Mic icon when listening */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        {playState === "listening" && <Mic size={28} className="text-emerald-400" />}
                        {playState === "ai_speaking" && (
                            <div className="flex items-end gap-0.5 h-6">
                                {[0, 1, 2, 3, 4].map(i => (
                                    <motion.div
                                        key={i}
                                        className="w-1 bg-blue-400 rounded-full"
                                        animate={{ height: [4, 16 + Math.random() * 8, 4] }}
                                        transition={{ duration: 0.5 + i * 0.1, repeat: Infinity, delay: i * 0.08 }}
                                    />
                                ))}
                            </div>
                        )}
                        {playState === "processing" && (
                            <div className="w-5 h-5 border-2 border-amber-400/60 border-t-transparent rounded-full animate-spin" />
                        )}
                    </div>
                </div>

                {/* Status */}
                <div className="text-center">
                    <p className="text-white font-semibold text-sm">{config.label}</p>
                    <p className="text-white/40 text-xs mt-1">{config.sublabel}</p>
                </div>

                {/* Interim speech text */}
                <AnimatePresence>
                    {interimText && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-emerald-400/60 text-sm italic text-center max-w-md"
                        >
                            {interimText}...
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Error */}
                {error && (
                    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 max-w-md">
                        <AlertCircle size={16} className="text-red-400 shrink-0" />
                        <p className="text-red-400 text-xs">{error}</p>
                    </div>
                )}
            </div>

            {/* Transcript */}
            <div className="max-h-[35vh] overflow-y-auto px-6 py-3 border-t border-white/5 bg-white/[0.02]">
                {messages.length === 0 && playState === "ready" && (
                    <p className="text-white/20 text-xs text-center py-4">Conversation transcript will appear here</p>
                )}
                <div className="space-y-2.5">
                    {messages.map((m, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: m.role === "customer" ? -10 : 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={`flex ${m.role === "agent" ? "justify-end" : "justify-start"}`}
                        >
                            <div className={`max-w-[75%] rounded-xl px-3 py-2 ${m.role === "customer"
                                ? "bg-blue-500/10 border border-blue-500/15"
                                : "bg-emerald-500/10 border border-emerald-500/15"
                                }`}
                            >
                                <span className={`text-[9px] font-bold uppercase tracking-wider ${m.role === "customer" ? "text-blue-400/60" : "text-emerald-400/60"
                                    }`}>
                                    {m.role === "customer" ? "Customer" : "You"}
                                </span>
                                <p className={`text-sm mt-0.5 ${m.role === "customer" ? "text-blue-100/80" : "text-emerald-100/80"}`}>
                                    {m.text}
                                </p>
                            </div>
                        </motion.div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* Feedback */}
                <AnimatePresence>
                    {feedback && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4"
                        >
                            <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">Coach Feedback</h4>
                            <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{feedback}</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Controls */}
            <div className="px-6 py-4 border-t border-white/5 flex items-center justify-center gap-3">
                {!supported ? (
                    <p className="text-red-400 text-xs text-center">
                        Voice practice requires Chrome or Edge browser with microphone access.
                    </p>
                ) : playState === "ready" ? (
                    <button
                        onClick={handleStart}
                        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 rounded-xl text-white font-bold text-sm uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:scale-105"
                    >
                        <Mic size={16} />
                        Start Practice Call
                    </button>
                ) : playState === "ended" ? (
                    <div className="flex gap-3">
                        <button
                            onClick={handleRestart}
                            className="flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/70 hover:text-white text-sm font-medium transition-all"
                        >
                            <RotateCcw size={14} />
                            Try Again
                        </button>
                        <button
                            onClick={onClose}
                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white text-sm font-medium transition-all"
                        >
                            Done
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={handleStop}
                        className="flex items-center gap-2 px-5 py-2.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/20 rounded-xl text-red-400 text-sm font-medium transition-all"
                    >
                        <Square size={14} />
                        End Session
                    </button>
                )}
            </div>
        </div>
    );
}

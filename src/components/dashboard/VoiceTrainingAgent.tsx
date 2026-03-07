"use client";

import React from "react";
import { motion } from "framer-motion";
import { Sparkles, Play, Headphones, Mic } from "lucide-react";

interface VoiceTrainingAgentProps {
    scenariosAvailable?: number;
    onStartTraining?: () => void;
    onTalkToCoach?: () => void;
    mode?: "violations" | "general";
}

export default function VoiceTrainingAgent({ scenariosAvailable = 0, onStartTraining, onTalkToCoach, mode = "violations" }: VoiceTrainingAgentProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="glass-card rounded-2xl border border-white/5 overflow-hidden relative group"
        >
            {/* Animated gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 via-purple-600/5 to-pink-600/10 opacity-50" />
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.02]" />

            {/* Glow effect */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl group-hover:bg-indigo-500/30 transition-all duration-700" />
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl group-hover:bg-purple-500/30 transition-all duration-700" />

            <div className="relative z-10 p-6 flex items-center gap-6">
                {/* AI Avatar with animated rings */}
                <div className="relative flex-shrink-0">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                        <Headphones size={32} className="text-white" />
                    </div>

                    {/* Animated pulse rings */}
                    <div className="absolute inset-0 rounded-2xl animate-ping bg-indigo-500/20" style={{ animationDuration: '2s' }} />
                    <div className="absolute inset-0 rounded-2xl animate-ping bg-purple-500/10" style={{ animationDuration: '3s', animationDelay: '0.5s' }} />

                    {/* Status indicator */}
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-black flex items-center justify-center">
                        <Sparkles size={10} className="text-white" />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-white tracking-tight">AI Voice Coach</h3>
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Beta
                        </span>
                    </div>
                    <p className="text-white/50 text-sm mb-3">
                        Practice with AI-powered scenarios based on your actual calls to improve compliance & SLA scores.
                    </p>
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded">
                            {scenariosAvailable > 0
                                ? `${scenariosAvailable} scenario${scenariosAvailable > 1 ? "s" : ""} from recent violations`
                                : "General compliance practice available"}
                        </span>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex-shrink-0 flex flex-col gap-2">
                    {onTalkToCoach && (
                        <button
                            onClick={onTalkToCoach}
                            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl text-white font-bold text-sm uppercase tracking-wider transition-all duration-300 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-105 group/btn"
                        >
                            <Mic size={16} className="group-hover/btn:scale-110 transition-transform" />
                            Talk to Aura
                        </button>
                    )}
                    <button
                        onClick={onStartTraining}
                        className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm uppercase tracking-wider transition-all duration-300 group/btn ${
                            onTalkToCoach
                                ? "bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 font-medium"
                                : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-105"
                        }`}
                    >
                        <Play size={16} className="group-hover/btn:scale-110 transition-transform" />
                        {scenariosAvailable > 0 ? "Start Training" : "Practice"}
                    </button>
                </div>
            </div>

            {/* Audio waveform decoration */}
            <div className="absolute bottom-0 left-0 right-0 h-1 flex items-end gap-[2px] px-6 pb-2 opacity-30">
                {Array.from({ length: 50 }).map((_, i) => (
                    <motion.div
                        key={i}
                        className="flex-1 bg-gradient-to-t from-indigo-500 to-purple-500 rounded-full"
                        animate={{
                            height: [4, Math.random() * 12 + 4, 4],
                        }}
                        transition={{
                            duration: 0.8 + Math.random() * 0.4,
                            repeat: Infinity,
                            delay: i * 0.02,
                        }}
                    />
                ))}
            </div>
        </motion.div>
    );
}

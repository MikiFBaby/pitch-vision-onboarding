"use client";
import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SymbolicIconProps {
    roleId: string;
    gradient: string;
    className?: string;
}

export const SymbolicIcon = ({ roleId, gradient, className }: SymbolicIconProps) => {
    // Determine the inner "symbol" shape based on role
    const renderSymbol = () => {
        switch (roleId) {
            case "agent": // The Digital Communicator - Soundwave Head
                return (
                    <div className="relative w-full h-full flex items-center justify-center scale-110">
                        {/* Holographic Wireframe Aura */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-20">
                            {[...Array(3)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    animate={{ rotate: 360, scale: [1, 1.1, 1] }}
                                    transition={{ duration: 15 + i * 5, repeat: Infinity, ease: "linear" }}
                                    className={cn("absolute border border-white/40 rounded-full",
                                        i === 0 ? "w-48 h-48" : i === 1 ? "w-56 h-56 border-dashed" : "w-64 h-64 border-dotted"
                                    )}
                                />
                            ))}
                        </div>
                        {/* Silhouette / Soundwave Head */}
                        <div className="relative z-10 w-40 h-40 flex items-center justify-center">
                            <svg viewBox="0 0 200 200" className="w-full h-full">
                                <defs>
                                    <linearGradient id="agentGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" className="text-blue-400" stopColor="currentColor" />
                                        <stop offset="100%" className="text-cyan-400" stopColor="currentColor" />
                                    </linearGradient>
                                </defs>
                                {/* Digital Silhouette */}
                                <circle cx="100" cy="80" r="40" fill="none" stroke="url(#agentGradient)" strokeWidth="2" strokeDasharray="5,5" className="animate-[spin_20s_linear_infinite]" />
                                <path d="M60,150 Q100,120 140,150" fill="none" stroke="url(#agentGradient)" strokeWidth="2" strokeDasharray="4,4" />
                                {/* Dynamic Voice Bars */}
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <motion.rect
                                        key={i}
                                        x={70 + i * 8}
                                        y={80}
                                        width="4"
                                        animate={{ height: [10, 40, 15, 30, 10], y: [95, 80, 92, 85, 95] }}
                                        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1 }}
                                        fill="white"
                                        opacity="0.8"
                                    />
                                ))}
                            </svg>
                        </div>
                    </div>
                );
            case "qa": // The Analytical Eye - Precision Verification
                return (
                    <div className="relative w-full h-full flex items-center justify-center">
                        {/* Scanning Lens Hierarchy */}
                        <div className="relative w-44 h-44 flex items-center justify-center">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                                className="absolute inset-0 border-2 border-white/10 rounded-full border-t-white/40"
                            />
                            <motion.div
                                animate={{ rotate: -360 }}
                                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                                className="absolute w-32 h-32 border border-dashed border-white/20 rounded-full"
                            />
                            {/* The Eye / Lens */}
                            <div className={cn("w-24 h-24 rounded-full bg-gradient-to-br flex items-center justify-center p-1", gradient)}>
                                <div className="w-full h-full rounded-full bg-black/60 backdrop-blur-xl flex items-center justify-center border border-white/20 relative overflow-hidden">
                                    <motion.div
                                        animate={{ scale: [1, 1.2, 1] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                        className="w-8 h-8 rounded-full bg-white/10 border border-white/40 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                                    />
                                    {/* Scan Line */}
                                    <motion.div
                                        animate={{ top: ["0%", "100%", "0%"] }}
                                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                        className="absolute w-full h-0.5 bg-white/40 blur-[1px]"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case "manager": // The Strategic Core - Networked Nodes
                return (
                    <div className="relative w-full h-full flex items-center justify-center scale-110">
                        {/* Neural Mesh Background */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-10">
                            <svg viewBox="0 0 200 200" className="w-full h-full">
                                <path d="M40,40 L160,160 M40,160 L160,40 M100,20 L100,180 M20,100 L180,100" stroke="white" strokeWidth="1" />
                            </svg>
                        </div>
                        {/* Connecting Nodes */}
                        <div className="relative w-48 h-48">
                            {[...Array(6)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    animate={{
                                        scale: [1, 1.2, 1],
                                        opacity: [0.3, 0.7, 0.3],
                                        x: Math.sin(i) * 10,
                                        y: Math.cos(i) * 10
                                    }}
                                    transition={{ duration: 4, repeat: Infinity, delay: i * 0.5 }}
                                    className="absolute w-4 h-4 rounded-full bg-white/40 border border-white/60 blur-[1px]"
                                    style={{
                                        top: `${50 + 35 * Math.sin(i * Math.PI * 2 / 6)}%`,
                                        left: `${50 + 35 * Math.cos(i * Math.PI * 2 / 6)}%`,
                                    }}
                                />
                            ))}
                            {/* Central Intelligence Hub */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                                    className={cn("w-20 h-20 rounded-xl border-2 border-white/20 flex items-center justify-center relative overflow-hidden", gradient)}
                                >
                                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                                    <motion.div
                                        animate={{ scale: [0.8, 1.1, 0.8] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                        className="w-8 h-8 rounded-full bg-white/20 border border-white/60 shadow-[0_0_15px_rgba(255,255,255,0.4)]"
                                    />
                                </motion.div>
                            </div>
                        </div>
                    </div>
                );
            case "executive": // The Visionary Nexus - Concentric Insight
                return (
                    <div className="relative w-full h-full flex items-center justify-center scale-110">
                        {/* Orbital Rings */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            {[...Array(4)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    animate={{
                                        rotate: i % 2 === 0 ? 360 : -360,
                                        scale: [1, 1.05, 1],
                                        opacity: [0.1, 0.2, 0.1]
                                    }}
                                    transition={{ duration: 10 + i * 5, repeat: Infinity, ease: "linear" }}
                                    className={cn("absolute border border-white/40 rounded-full",
                                        i === 0 ? "w-40 h-40" : i === 1 ? "w-48 h-48 border-dashed" : i === 2 ? "w-56 h-56" : "w-64 h-64 border-dotted"
                                    )}
                                />
                            ))}
                        </div>
                        {/* The Nexus Core */}
                        <div className="relative w-32 h-32 flex items-center justify-center">
                            <motion.div
                                animate={{ rotate: 45 }}
                                className={cn("w-24 h-24 border-2 border-white/30 relative overflow-hidden rotate-45 flex items-center justify-center", gradient)}
                            >
                                <div className="absolute inset-0 bg-black/30 backdrop-blur-md" />
                                <motion.div
                                    animate={{
                                        opacity: [0.4, 1, 0.4],
                                        boxShadow: ["0 0 0px rgba(255,255,255,0)", "0 0 20px rgba(255,255,255,0.5)", "0 0 0px rgba(255,255,255,0)"]
                                    }}
                                    transition={{ duration: 3, repeat: Infinity }}
                                    className="w-12 h-12 bg-white/20 border border-white/60"
                                />
                            </motion.div>
                            {/* Data Streams */}
                            <motion.div
                                animate={{ width: ["0%", "150%", "0%"], left: ["-25%", "125%", "125%"] }}
                                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                className="absolute h-0.5 bg-white/40 blur-[1px] -rotate-45"
                            />
                        </div>
                    </div>
                );
            case "partner": // The Synthesis Gate - Collaborative Infinity
                return (
                    <div className="relative w-full h-full flex items-center justify-center scale-110">
                        {/* Infinity Path SVG */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <svg viewBox="0 0 200 100" className="w-64 h-32 opacity-20">
                                <motion.path
                                    d="M50,50 Q75,20 100,50 T150,50 T100,50 T50,50"
                                    fill="none"
                                    stroke="white"
                                    strokeWidth="1"
                                    animate={{ strokeDashoffset: [0, 200] }}
                                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                                    strokeDasharray="5,5"
                                />
                            </svg>
                        </div>
                        {/* Merging Entities */}
                        <div className="relative w-56 h-32 flex items-center justify-center gap-4">
                            {[0, 1].map((i) => (
                                <motion.div
                                    key={i}
                                    animate={{
                                        x: i === 0 ? [0, 40, 0] : [0, -40, 0],
                                        scale: [1, 1.2, 1],
                                        borderRadius: i === 0 ? ["30% 70% 70% 30% / 30% 30% 70% 70%", "50% 50% 50% 50%", "30% 70% 70% 30% / 30% 30% 70% 70%"] : ["70% 30% 30% 70% / 70% 70% 30% 30%", "50% 50% 50% 50%", "70% 30% 30% 70% / 70% 70% 30% 30%"]
                                    }}
                                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                                    className={cn("w-16 h-16 border border-white/40 glass-card relative overflow-hidden", gradient)}
                                >
                                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-2 h-2 rounded-full bg-white opacity-50 animate-pulse" />
                                    </div>
                                </motion.div>
                            ))}
                            {/* Synthesis Point */}
                            <motion.div
                                animate={{ opacity: [0, 0.8, 0], scale: [0.5, 1.5, 0.5] }}
                                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                                className="absolute w-8 h-8 rounded-full bg-white blur-[4px] z-10"
                            />
                        </div>
                        {/* Aura */}
                        <div className={cn("absolute w-64 h-32 bg-gradient-to-r opacity-20 blur-[50px]", gradient)} />
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className={cn("relative w-full h-full flex items-center justify-center", className)}>
            {renderSymbol()}
        </div>
    );
};

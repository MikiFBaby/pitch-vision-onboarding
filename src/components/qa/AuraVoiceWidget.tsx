"use client";

import React, { useCallback, useState, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Mic, X, Volume2, Loader2, MicOff, ChevronDown, Maximize2, Minimize2, PhoneOff } from "lucide-react";
import { AuraVoiceIcon } from "@/components/ui/AuraVoiceIcon";
import { useVoice } from "@/context/VoiceContext";
import { useGeminiLive } from "@/hooks/useGeminiLive";
import { motion, AnimatePresence } from "framer-motion";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useRecentQAStats } from "@/hooks/useRecentQAStats";
import { fetchFullAuraContext, buildAuraSystemPrompt } from "@/utils/aura-context";

export const AuraVoiceWidget: React.FC = () => {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { isOpen, closeVoice, openVoice, voiceData } = useVoice();
    const [error, setError] = useState<string | null>(null);
    const [transcript, setTranscript] = useState<string>("");
    // Sync local expansion with context 'isOpen'
    // isOpen = true -> Expanded
    // isOpen = false -> Collapsed

    const hasConnectedRef = useRef(false);

    const { displayName, email: userEmail } = useUserSettings();

    // Use context data or fallbacks
    const activeUserName = voiceData.userName || displayName || "there";

    // Hide completely on login/auth pages
    const isAuraView = searchParams?.get('view') === 'aura';
    const isHiddenCompletely = pathname?.startsWith('/login') || pathname?.startsWith('/auth') || pathname?.startsWith('/onboarding') || pathname === '/';

    // On Aura page: show expanded widget when open, but hide collapsed orb (there's one in the input bar)
    const hideCollapsedOrb = isAuraView;

    // Helper to toggle context
    const toggleExpanded = () => {
        if (isOpen) closeVoice();
        else openVoice();
    };



    const {
        connect,
        disconnect,
        stopSpeaking,
        isConnected,
        isSpeaking,
        userSpeaking,
        volume // Use this for orb visuals?
    } = useGeminiLive();

    const { statsContext } = useRecentQAStats();

    const isConnecting = false; // Simplified for now




    // Auto-open if connected/connecting
    useEffect(() => {
        if (isConnected || isConnecting) {
            // Ensure widget is open if active
            // But don't force openVoice() here to avoid loop if managing local state
        }
    }, [isConnected, isConnecting]);

    const startSession = useCallback(async () => {
        try {
            setError(null);
            setTranscript("");

            // Build Unified Context - Same as Text Aura
            const now = new Date();
            const timeString = now.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
            const pageContext = searchParams?.get('view') ? `User is currently viewing the ${searchParams.get('view')} page.` : `User is on the ${pathname} page.`;

            // Fetch comprehensive context (employee directory, Slack memory, QA data)
            const fullContext = await fetchFullAuraContext(userEmail);

            // Build the system prompt with all context
            const systemPrompt = buildAuraSystemPrompt(
                fullContext,
                activeUserName,
                pageContext,
                timeString,
                userEmail // Pass email so Aura can send to "me" even if user not in directory
            );

            console.log('[VoiceAura] Starting session with full context', {
                hasDirectory: fullContext.employeeDirectory.length > 0,
                hasSlackHistory: fullContext.slackHistory.length > 0,
                hasCurrentUser: !!fullContext.currentUser,
                userEmail: userEmail || 'none'
            });

            await connect({ systemInstruction: systemPrompt });
        } catch (err: any) {
            console.error("Failed to start:", err);
            setError(err.message || "Failed to start");
        }
    }, [connect, activeUserName, userEmail, searchParams, pathname]);

    const endSession = useCallback(async () => {
        disconnect();
        setTranscript("");
    }, [disconnect]);

    const handleClose = useCallback(async () => {
        await endSession();
        closeVoice();
    }, [endSession, closeVoice]);

    // Auto-start when opened if not connected
    useEffect(() => {
        if (isOpen && !isConnected && !isConnecting) {
            startSession();
        }
    }, [isOpen]);



    // Handle close widget = collapse

    if (isHiddenCompletely) return null;

    // On Aura page, only show when expanded (not the collapsed orb)
    if (hideCollapsedOrb && !isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="fixed bottom-6 right-6 z-[100] flex flex-col items-end"
            >
                {/* Widget Container - Compact */}
                <div className={`${isOpen ? 'w-[260px] bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-purple-900/40' : 'w-auto bg-transparent border-none shadow-none'} overflow-hidden transition-all duration-300 ease-spring`}>

                    {/* Header / Controls */}
                    {isOpen && (
                        <div className="flex items-center justify-between px-4 py-3 bg-white/5">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                                <span className="text-xs font-semibold text-white/90">Aura Voice</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={handleClose}
                                    className="p-1.5 hover:bg-rose-500/20 rounded-full text-white/60 hover:text-rose-400 transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Content - Compact */}
                    {isOpen ? (
                        <div className="p-4 flex flex-col items-center">
                            {/* Listening State - Compact */}
                            <div className="relative w-20 h-20 mb-4 flex items-center justify-center">
                                {/* Main Glow */}
                                <motion.div
                                    animate={{
                                        scale: isSpeaking ? [1, 1.2, 1] : [1, 1.05, 1],
                                        opacity: isSpeaking ? 0.8 : 0.5
                                    }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                    className="absolute inset-0 bg-purple-500 rounded-full blur-xl"
                                />

                                {/* Core Orb - Compact */}
                                <div className="relative z-10 w-16 h-16 rounded-full bg-black border border-white/10 flex items-center justify-center overflow-hidden shadow-xl shadow-purple-900/50">
                                    <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 to-indigo-900/40" />

                                    {/* Inner Visualizer */}
                                    <div className="flex items-center justify-center gap-0.5">
                                        {[1, 2, 3, 4, 5].map((i) => (
                                            <motion.div
                                                key={i}
                                                animate={{
                                                    height: isSpeaking ? [12, 24, 12] : [6, 10, 6],
                                                    opacity: isSpeaking ? 1 : 0.5
                                                }}
                                                transition={{
                                                    duration: 0.8,
                                                    repeat: Infinity,
                                                    delay: i * 0.1,
                                                    ease: "easeInOut"
                                                }}
                                                className="w-1 bg-white rounded-full"
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Status Text - Compact */}
                            <div className="text-center space-y-1 mb-4">
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="text-sm font-medium text-white tracking-wide"
                                >
                                    {isSpeaking ? "Aura is speaking..." : userSpeaking ? "Listening to you..." : isConnected ? "Listening..." : "Connecting..."}
                                </motion.p>
                                <p className="text-xs text-indigo-300 font-medium">
                                    {activeUserName}
                                </p>
                            </div>

                            {/* Transcript/Captions - Compact */}
                            {transcript && (
                                <div className="w-full bg-white/5 rounded-lg p-3 mb-4 border border-white/10 min-h-[50px]">
                                    <p className="text-xs text-white/80 leading-relaxed text-center">
                                        "{transcript}"
                                    </p>
                                </div>
                            )}

                            {/* Controls - Compact */}
                            <div className="flex items-center gap-4 w-full justify-center">
                                <button
                                    onClick={() => handleClose()}
                                    className="px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white text-sm font-medium transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                                >
                                    <X size={14} />
                                    End Session
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Collapsed State - Dynamic Call Button */
                        <motion.div
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={isConnected ? handleClose : toggleExpanded}
                            className="group relative cursor-pointer"
                        >
                            {/* Card Container - Changes based on call state */}
                            <div className={`flex items-center justify-center p-3 backdrop-blur-md border rounded-full shadow-2xl transition-all duration-300 ${isConnected
                                ? 'bg-rose-950/90 border-rose-500/30 shadow-rose-900/40 hover:shadow-rose-900/60'
                                : 'bg-[#0a0a0a]/90 border-white/10 shadow-purple-900/20 hover:shadow-purple-900/40'
                                }`}>
                                {/* Breathing Glow Effect - Reactive */}
                                <motion.div
                                    animate={{
                                        opacity: isConnected ? [0.4, 0.6, 0.4] : [0.2, 0.4, 0.2],
                                        scale: isConnected ? [1, 1.1, 1] : 1
                                    }}
                                    transition={{ duration: isConnected ? 1 : 3, repeat: Infinity, ease: "easeInOut" }}
                                    className={`absolute inset-0 rounded-full blur-lg -z-10 ${isConnected
                                        ? 'bg-gradient-to-r from-rose-500/20 via-red-500/20 to-rose-500/20'
                                        : 'bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-purple-500/10'
                                        }`}
                                />
                                {/* Dynamic Icon */}
                                <div className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center">
                                    {isConnected ? (
                                        /* End Call State - Red Phone Off */
                                        <>
                                            <motion.div
                                                animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }}
                                                transition={{ duration: 1, repeat: Infinity }}
                                                className="absolute inset-0 bg-gradient-to-br from-rose-500 to-red-600 rounded-full blur-[2px]"
                                            />
                                            <div className="absolute inset-0.5 bg-rose-950 rounded-full flex items-center justify-center border border-rose-500/30">
                                                <PhoneOff className="w-5 h-5 text-rose-400" />
                                            </div>
                                            {/* Active call indicator */}
                                            <motion.span
                                                animate={{ opacity: [1, 0.5, 1] }}
                                                transition={{ duration: 0.8, repeat: Infinity }}
                                                className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-rose-500 border-2 border-black rounded-full z-10"
                                            />
                                        </>
                                    ) : (
                                        /* Start Call State - Purple Mic */
                                        <>
                                            <motion.div
                                                animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
                                                transition={{ duration: 2, repeat: Infinity }}
                                                className="absolute inset-0 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full blur-[2px]"
                                            />
                                            <div className="absolute inset-0.5 bg-black rounded-full flex items-center justify-center border border-white/10">
                                                <Mic className="w-5 h-5 text-purple-400" />
                                            </div>
                                            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-black rounded-full z-10" />
                                        </>
                                    )}
                                </div>
                            </div>
                            {/* Tooltip */}
                            <div className={`absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${isConnected ? 'bg-rose-900 text-rose-200' : 'bg-black/80 text-white/80'
                                }`}>
                                {isConnected ? 'End Call' : 'Talk to Aura'}
                            </div>
                        </motion.div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

"use client";
import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function OnboardingCompletePage() {
    const router = useRouter();
    const { profile } = useAuth();
    const role = profile?.role || 'agent';

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Ambience */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <div className="absolute top-[20%] left-[20%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full animate-pulse" />
            </div>

            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="max-w-md w-full text-center space-y-8 z-10"
            >
                <div className="flex justify-center mb-8">
                    <motion.div
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                        className="w-24 h-24 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                    >
                        <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                    </motion.div>
                </div>

                <div className="space-y-4">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="text-4xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-white/70"
                    >
                        Success!
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="text-lg text-white/60 leading-relaxed"
                    >
                        Your profile has been successfully configured. We are preparing your personalized dashboard.
                    </motion.p>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="pt-8"
                >
                    <Button
                        onClick={() => router.push(`/${role}`)}
                        className="bg-white text-black hover:bg-white/90 px-8 py-6 rounded-full text-lg font-bold transition-all hover:scale-105 active:scale-95 shadow-xl group"
                    >
                        Enter Dashboard
                        <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Button>
                    <p className="mt-6 text-[10px] uppercase tracking-widest text-white/30">
                        Stay tuned for more updates
                    </p>
                </motion.div>
            </motion.div>
        </div>
    );
}

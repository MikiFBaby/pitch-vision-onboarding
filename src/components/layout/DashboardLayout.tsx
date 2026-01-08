"use client";

import React from "react";
import { Sidebar } from "./Sidebar";
import { motion } from "framer-motion";
import { ChatWidget } from "@/components/chat/ChatWidget";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-[#050505] text-white flex overflow-hidden">
            {/* Background Effects */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full" />
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] pointer-events-none" />
            </div>

            {/* Sidebar */}
            <Sidebar />

            <ChatWidget />

            {/* Main Content */}
            <main className="flex-1 ml-72 relative z-10 overflow-y-auto">
                <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-black/20 backdrop-blur-sm sticky top-0 z-30">

                    <div className="flex items-center gap-4">
                        <div className="h-10 w-[300px] glass-dark rounded-full flex items-center px-4 gap-3">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[10px] text-white/60 font-medium tracking-wide">
                                SYSTEM STATUS: OPERATIONAL
                            </span>
                        </div>
                    </div>
                </header>

                <div className="p-8 pb-20">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        {children}
                    </motion.div>
                </div>
            </main>
        </div>
    );
}

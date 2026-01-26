"use client";

import { motion } from "framer-motion";

export function TypingBubble() {
    return (
        <div className="px-4 py-3 bg-white/10 border border-white/15 rounded-2xl rounded-bl-md w-fit">
            <div className="flex gap-1.5 h-5 items-center">
                <motion.div
                    className="w-2 h-2 bg-white/60 rounded-full"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        delay: 0
                    }}
                />
                <motion.div
                    className="w-2 h-2 bg-white/60 rounded-full"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        delay: 0.2
                    }}
                />
                <motion.div
                    className="w-2 h-2 bg-white/60 rounded-full"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        delay: 0.4
                    }}
                />
            </div>
        </div>
    );
}

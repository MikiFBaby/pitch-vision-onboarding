"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function OnboardingComplete() {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-[#8B5CF6] flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Glow Effect */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/20 blur-[120px] rounded-full pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center max-w-2xl text-center space-y-8">
                {/* Hero Image */}
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.6, ease: "backOut" }}
                    className="relative w-64 h-64 md:w-80 md:h-80"
                >
                    <Image
                        src="/assets/success-hero.png"
                        alt="Success"
                        fill
                        className="object-contain drop-shadow-2xl"
                        priority
                    />
                </motion.div>

                {/* Text Content */}
                <div className="space-y-4">
                    <motion.h1
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="text-4xl md:text-6xl font-black text-white leading-tight tracking-tight"
                    >
                        Success!
                        <br />
                        You&apos;re Registered.
                    </motion.h1>

                    <motion.p
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-white/90 text-lg md:text-xl font-medium leading-relaxed max-w-lg mx-auto"
                    >
                        Your profile has been created. You will be notified via email when the platform officially launches.
                    </motion.p>
                </div>

                {/* Action Button */}
                <motion.button
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ delay: 0.5 }}
                    onClick={() => router.push('/dashboard')}
                    className="bg-[#84cc16] hover:bg-[#65a30d] text-black font-bold text-lg px-8 py-4 rounded-full shadow-lg hover:shadow-xl transition-all"
                >
                    Enter Dashboard
                </motion.button>
            </div>

            {/* Footer / Copyright */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="absolute bottom-6 text-white/60 text-xs font-bold uppercase tracking-widest"
            >
                2026: Year of Vision
            </motion.div>
        </div>
    );
}

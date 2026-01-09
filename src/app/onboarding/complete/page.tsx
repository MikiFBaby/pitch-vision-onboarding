"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function OnboardingComplete() {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Image */}
            <div className="absolute inset-0 z-0">
                <Image
                    src="/hero-background.png"
                    alt="Background"
                    fill
                    className="object-cover opacity-60"
                    priority
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/60 to-black/90" />
            </div>

            {/* Background Glow Effect - Adjusted for dark theme */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none mix-blend-screen" />

            <div className="relative z-10 flex flex-col items-center max-w-2xl text-center space-y-8">
                {/* Hero Image */}
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.6, ease: "backOut" }}
                    className="relative w-64 h-64 md:w-80 md:h-80"
                >
                    <Image
                        src="/assets/voice-vision-hero.png"
                        alt="Success"
                        fill
                        className="object-contain drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                        priority
                    />
                </motion.div>

                {/* Text Content */}
                <div className="space-y-6">
                    <motion.h1
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="text-5xl md:text-7xl font-black text-white leading-tight tracking-tight drop-shadow-lg"
                    >
                        <span className="bg-clip-text text-transparent bg-gradient-to-b from-white to-white/80">
                            Success!
                        </span>
                        <br />
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-200">
                            You&apos;re Registered.
                        </span>
                    </motion.h1>

                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="space-y-4"
                    >
                        <p className="text-white/90 text-lg md:text-xl font-medium leading-relaxed max-w-lg mx-auto drop-shadow-md bg-black/20 p-4 rounded-2xl backdrop-blur-sm border border-white/10">
                            Your profile has been created. You will be notified via email when the platform officially launches.
                        </p>
                    </motion.div>
                </div>
            </div>

            {/* Footer / Copyright */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="absolute bottom-6 text-white/40 text-xs font-bold uppercase tracking-widest"
            >
                The year we turn voice to vision. Get ready.
            </motion.div>
        </div>
    );
}

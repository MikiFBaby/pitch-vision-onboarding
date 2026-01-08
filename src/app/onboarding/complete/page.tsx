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
                    transition={{ duration: 0.6, ease: "outBack" }}
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
                        Jump into
                        <br />
                        Employment OS.
                    </motion.h1>

                    <motion.p
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-white/90 text-lg md:text-xl font-medium leading-relaxed max-w-lg mx-auto"
                    >
                        Employment doesn&apos;t have to be hard. Streamline every step of the
                        employment lifecycle so you and your team can run ahead.
                    </motion.p>
                </div>

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
        </div >
    );
}

"use client";

import { Aperture } from 'lucide-react';
import { cn } from "@/lib/utils";

const PitchVisionLogo = ({ className }: { className?: string }) => (
    <div className={cn("flex items-center gap-5 group cursor-pointer select-none", className)}>


        {/* Modern "Squircle" Icon Container */}
        <div className="relative h-[60px] w-[60px]">
            {/* Outer Metallic Ring Gradient */}
            <div className="absolute inset-0 rounded-[18px] bg-gradient-to-b from-gray-700 via-gray-900 to-black p-[1px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)]">
                {/* Inner Dark Glass Surface */}
                <div className="h-full w-full rounded-[17px] bg-[#080808] relative flex items-center justify-center overflow-hidden">

                    {/* Top Glass Reflection Highlight */}
                    <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

                    {/* Ambient Glow */}
                    <div className="absolute inset-0 bg-indigo-500/10 blur-xl opacity-50 group-hover:opacity-100 transition-opacity duration-700" />

                    {/* The Aperture Icon (Lens) */}
                    <Aperture
                        size={32}
                        strokeWidth={1.5}
                        className="text-white/90 relative z-10 drop-shadow-[0_0_8px_rgba(255,255,255,0.2)] group-hover:text-white transition-all duration-700 group-hover:rotate-90"
                    />

                    {/* Central Energy Core (Pulsing Iris) */}
                    <div className="absolute w-1.5 h-1.5 bg-indigo-400 rounded-full z-20 shadow-[0_0_12px_rgba(99,102,241,1)] animate-pulse" />
                </div>
            </div>
        </div>

        {/* Typography */}
        <div className="flex flex-col justify-center gap-0.5">
            <h1 className="text-white font-bold text-[22px] leading-none tracking-tight font-sans drop-shadow-md">
                Pitch <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-300">Vision</span>
            </h1>

            {/* Futuristic Scanning Subtitle */}
            <div className="relative w-max">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] animate-text-scan">
                    Enterprise AI
                </p>
            </div>
        </div>
    </div>
);

export { PitchVisionLogo };

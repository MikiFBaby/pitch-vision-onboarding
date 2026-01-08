"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface RevealTextProps {
    text?: string;
    textColor?: string;
    overlayColor?: string;
    fontSize?: string;
    letterDelay?: number;
    overlayDelay?: number;
    overlayDuration?: number;
    springDuration?: number;
    letterImages?: string[];
    className?: string;
}

export function RevealText({
    text = "STUNNING",
    textColor = "text-white",
    overlayColor = "text-blue-500",
    fontSize = "text-[250px]",
    letterDelay = 0.08,
    overlayDelay = 0.05,
    overlayDuration = 0.4,
    springDuration = 600,
    letterImages = [
        "https://images.unsplash.com/photo-1620712943543-bcc4638d9980?auto=format&fit=crop&w=800&q=80", // AI Deep Tech
        "https://images.unsplash.com/photo-1620121692029-d088224efc74?auto=format&fit=crop&w=800&q=80", // Neural Network
        "https://images.unsplash.com/photo-1614741318230-2475a3424683?auto=format&fit=crop&w=800&q=80", // Digital HUD
        "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&w=800&q=80", // Data Connectivity
        "https://images.unsplash.com/photo-1605810230434-7631ac76ec81?auto=format&fit=crop&w=800&q=80", // Tech Collaboration
        "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80", // Abstract Wave
        "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80", // Cyber Earth
        "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80", // Circuitry
        "https://images.unsplash.com/photo-1558494949-ef010cbdcc51?auto=format&fit=crop&w=800&q=80", // Data Center
        "https://images.unsplash.com/photo-1535223289827-42f1e9919769?auto=format&fit=crop&w=800&q=80", // High Tech 
        "https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&w=800&q=80", // React/Code
        "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80", // Robotic Logic
    ],
    className
}: RevealTextProps) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [showRedText, setShowRedText] = useState(false);

    useEffect(() => {
        const lastLetterDelay = (text.length - 1) * letterDelay;
        const totalDelay = (lastLetterDelay * 1000) + springDuration;

        const timer = setTimeout(() => {
            setShowRedText(true);
        }, totalDelay);

        return () => clearTimeout(timer);
    }, [text.length, letterDelay, springDuration]);

    return (
        <div className={cn("flex items-center justify-center relative", className)}>
            <div className="flex flex-wrap justify-center">
                {text.split("").map((letter, index) => (
                    <motion.span
                        key={index}
                        onMouseEnter={() => setHoveredIndex(index)}
                        onMouseLeave={() => setHoveredIndex(null)}
                        className={`${fontSize} font-black tracking-tight cursor-pointer relative overflow-hidden inline-block`}
                        initial={{
                            scale: 0,
                            opacity: 0,
                        }}
                        animate={{
                            scale: 1,
                            opacity: 1,
                        }}
                        transition={{
                            delay: index * letterDelay,
                            type: "spring",
                            damping: 8,
                            stiffness: 200,
                            mass: 0.8,
                        }}
                    >
                        {/* Base text layer */}
                        <motion.span
                            className={cn("absolute inset-0", textColor)}
                            animate={{
                                opacity: hoveredIndex === index ? 0 : 1
                            }}
                            transition={{ duration: 0.1 }}
                        >
                            {letter === " " ? "\u00A0" : letter}
                        </motion.span>
                        {/* Image text layer with background panning */}
                        <motion.span
                            className="text-transparent bg-clip-text bg-cover bg-no-repeat"
                            animate={{
                                opacity: hoveredIndex === index ? 1 : 0,
                                backgroundPosition: hoveredIndex === index ? "10% center" : "0% center"
                            }}
                            transition={{
                                opacity: { duration: 0.1 },
                                backgroundPosition: {
                                    duration: 3,
                                    ease: "easeInOut"
                                }
                            }}
                            style={{
                                backgroundImage: `url('${letterImages[index % letterImages.length]}')`,
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                            }}
                        >
                            {letter === " " ? "\u00A0" : letter}
                        </motion.span>

                        {/* Overlay text layer that sweeps across each letter */}
                        {showRedText && (
                            <motion.span
                                className={cn("absolute inset-0 pointer-events-none", overlayColor)}
                                initial={{ opacity: 0 }}
                                animate={{
                                    opacity: [0, 1, 1, 0]
                                }}
                                transition={{
                                    delay: index * overlayDelay,
                                    duration: overlayDuration,
                                    times: [0, 0.1, 0.7, 1],
                                    ease: "easeInOut"
                                }}
                            >
                                {letter === " " ? "\u00A0" : letter}
                            </motion.span>
                        )}
                    </motion.span>
                ))}
            </div>
        </div>
    );
}

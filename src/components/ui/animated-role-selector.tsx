"use client";

import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { SymbolicIcon } from "./symbolic-icon";

type Role = {
    id: string;
    title: string;
    description: string;
    avatar: string;
    gradient: string;
    borderGradient: string;
};

export const AnimatedRoleSelector = ({
    roles,
    autoplay = false,
    className,
}: {
    roles: Role[];
    autoplay?: boolean;
    className?: string;
}) => {
    const [active, setActive] = useState(0);

    const handleNext = useCallback(() => {
        setActive((prev) => (prev + 1) % roles.length);
    }, [roles.length]);

    const handlePrev = () => {
        setActive((prev) => (prev - 1 + roles.length) % roles.length);
    };

    const isActive = (index: number) => {
        return index === active;
    };

    useEffect(() => {
        if (autoplay) {
            const interval = setInterval(handleNext, 5000);
            return () => clearInterval(interval);
        }
    }, [autoplay, handleNext]);

    const randomRotateY = () => {
        return Math.floor(Math.random() * 21) - 10;
    };

    return (
        <div className={cn("w-full max-w-6xl mx-auto px-4 md:px-8", className)}>
            <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                {/* Avatar Stack */}
                <div className="order-2 lg:order-1">
                    <div className="relative h-80 md:h-96 w-full">
                        <AnimatePresence>
                            {roles.map((role, index) => (
                                <motion.div
                                    key={role.id}
                                    initial={{
                                        opacity: 0,
                                        scale: 0.9,
                                        z: -100,
                                        rotate: randomRotateY(),
                                    }}
                                    animate={{
                                        opacity: isActive(index) ? 1 : 0.7,
                                        scale: isActive(index) ? 1 : 0.95,
                                        z: isActive(index) ? 0 : -100,
                                        rotate: isActive(index) ? 0 : randomRotateY(),
                                        zIndex: isActive(index)
                                            ? 999
                                            : roles.length + 2 - index,
                                        y: isActive(index) ? [0, -40, 0] : 0,
                                    }}
                                    exit={{
                                        opacity: 0,
                                        scale: 0.9,
                                        z: 100,
                                        rotate: randomRotateY(),
                                    }}
                                    transition={{
                                        duration: 0.4,
                                        ease: "easeInOut",
                                    }}
                                    className="absolute inset-0 origin-bottom flex items-center justify-center"
                                >
                                    <motion.div
                                        className="relative group perspective-1000"
                                        onMouseMove={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const x = (e.clientX - rect.left) / rect.width;
                                            const y = (e.clientY - rect.top) / rect.height;
                                            e.currentTarget.style.setProperty('--mouse-x', `${x * 100}%`);
                                            e.currentTarget.style.setProperty('--mouse-y', `${y * 100}%`);
                                            e.currentTarget.style.setProperty('--rotate-x', `${(y - 0.5) * -20}deg`);
                                            e.currentTarget.style.setProperty('--rotate-y', `${(x - 0.5) * 20}deg`);
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.setProperty('--rotate-x', '0deg');
                                            e.currentTarget.style.setProperty('--rotate-y', '0deg');
                                        }}
                                        style={{
                                            transform: 'rotateX(var(--rotate-x, 0deg)) rotateY(var(--rotate-y, 0deg))',
                                            transition: 'transform 0.2s ease-out',
                                            transformStyle: 'preserve-3d'
                                        }}
                                    >
                                        {/* HUD Overlay - Appearing on Hover */}
                                        <div className="absolute inset-[-20px] z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                                            {/* Tech Corners */}
                                            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/40" />
                                            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/40" />
                                            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/40" />
                                            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/40" />

                                            {/* Digital Scan Line */}
                                            <motion.div
                                                animate={{ top: ["0%", "100%", "0%"] }}
                                                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                                                className="absolute w-full h-[1px] bg-white/20 shadow-[0_0_10px_rgba(255,255,255,0.3)]"
                                            />

                                            {/* HUD Status Text */}
                                            <div className="absolute top-[-30px] left-0 text-[10px] items-center font-mono text-white/40 tracking-[0.2em] uppercase flex gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                                System.Ready_
                                            </div>
                                            <div className="absolute bottom-[-30px] right-0 text-[10px] font-mono text-white/40 tracking-[0.2em] uppercase">
                                                ID_{role.id.toUpperCase()}_773
                                            </div>
                                        </div>

                                        {/* Glare Effect */}
                                        <div className="absolute inset-0 z-20 pointer-events-none rounded-[40px] overflow-hidden">
                                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_var(--mouse-x,50%)_var(--mouse-y,50%),rgba(255,255,255,0.1),transparent_50%)]" />
                                        </div>

                                        {/* Symbolic Pedestal Shadow */}
                                        <div className={`
                                            absolute -bottom-8 left-1/2 -translate-x-1/2 w-48 h-12
                                            bg-gradient-to-r ${role.gradient} opacity-20 blur-3xl
                                            group-hover:opacity-40 transition-opacity duration-700
                                            ${isActive(index) ? 'scale-110 opacity-30' : 'scale-90'}
                                        `} />

                                        {/* The Icon Container */}
                                        <div className={`
                                            relative w-64 h-64 md:w-80 md:h-80 rounded-[40px] 
                                            overflow-hidden glass-card border-white/10
                                            shadow-[0_20px_80px_-15px_rgba(0,0,0,0.5)]
                                            group-hover:shadow-[0_40px_120px_-10px_rgba(0,0,0,0.8)]
                                            transition-all duration-700 ease-out
                                            backdrop-blur-3xl flex items-center justify-center
                                            transform-gpu
                                        `}>
                                            {/* Persona Image Background */}
                                            <div className="absolute inset-0 z-0">
                                                <Image
                                                    src={role.avatar}
                                                    alt={role.title}
                                                    fill
                                                    className="object-cover opacity-40 group-hover:opacity-60 transition-opacity duration-700 group-hover:scale-110 transition-transform"
                                                />
                                                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors duration-700" />
                                            </div>

                                            {/* Holographic "Flicker" Animation for Active Card */}
                                            <motion.div
                                                animate={isActive(index) ? {
                                                    opacity: [1, 0.8, 1, 0.9, 1],
                                                    filter: ["blur(0px)", "blur(1px)", "blur(0px)"]
                                                } : {}}
                                                transition={{ duration: 0.2, repeat: Infinity, repeatDelay: Math.random() * 5 }}
                                                className="w-full h-full flex items-center justify-center relative z-10"
                                            >
                                                <SymbolicIcon
                                                    roleId={role.id}
                                                    gradient={role.gradient}
                                                    className="scale-90 group-hover:scale-110 transition-transform duration-1000 ease-out"
                                                />
                                            </motion.div>

                                            {/* Internal Glass Highlight */}
                                            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent opacity-50 pointer-events-none z-20" />

                                            {/* Role Gradient Glow */}
                                            <div className={`absolute inset-0 bg-gradient-to-t ${role.gradient} opacity-5 group-hover:opacity-30 transition-opacity mix-blend-overlay z-20`} />
                                        </div>

                                        {/* Animated Orbital Rings */}
                                        {isActive(index) && (
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[-1]">
                                                <motion.div
                                                    animate={{ rotate: 360, scale: [1, 1.05, 1] }}
                                                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                                                    className="absolute w-[115%] h-[115%] border border-white/10 rounded-full"
                                                />
                                                <motion.div
                                                    animate={{ rotate: -360, scale: [1, 1.1, 1] }}
                                                    transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                                                    className="absolute w-[130%] h-[130%] border border-white/5 rounded-full border-dashed"
                                                />
                                            </div>
                                        )}
                                    </motion.div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Role Details */}
                <div className="order-1 lg:order-2 flex flex-col justify-center py-4">
                    <motion.div
                        key={active}
                        initial={{
                            y: 20,
                            opacity: 0,
                        }}
                        animate={{
                            y: 0,
                            opacity: 1,
                        }}
                        exit={{
                            y: -20,
                            opacity: 0,
                        }}
                        transition={{
                            duration: 0.2,
                            ease: "easeInOut",
                        }}
                        className="text-center lg:text-left"
                    >
                        <h3 className={`text-4xl md:text-5xl font-bold py-2 mb-4 leading-tight text-transparent bg-clip-text bg-gradient-to-r ${roles[active].gradient}`}>
                            {roles[active].title}
                        </h3>
                        <motion.p className="text-lg md:text-xl text-gray-300 mb-8 leading-relaxed">
                            {roles[active].description.split(" ").map((word, index) => (
                                <motion.span
                                    key={index}
                                    initial={{
                                        filter: "blur(10px)",
                                        opacity: 0,
                                        y: 5,
                                    }}
                                    animate={{
                                        filter: "blur(0px)",
                                        opacity: 1,
                                        y: 0,
                                    }}
                                    transition={{
                                        duration: 0.2,
                                        ease: "easeInOut",
                                        delay: 0.02 * index,
                                    }}
                                    className="inline-block"
                                >
                                    {word}&nbsp;
                                </motion.span>
                            ))}
                        </motion.p>

                        {/* Enter Portal Button */}
                        <Link
                            href={`/login?role=${roles[active].id}`}
                            className={`
                                inline-flex items-center gap-3 px-8 py-4 rounded-2xl
                                bg-gradient-to-r ${roles[active].gradient}
                                text-black font-semibold text-lg
                                transition-all duration-300
                                hover:scale-105 hover:shadow-[0_0_30px_-5px_rgba(255,255,255,0.4)]
                                group
                            `}
                        >
                            <span>Enter Portal</span>
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </motion.div>

                    {/* Navigation Controls */}
                    <div className="flex items-center justify-center lg:justify-start gap-4 mt-12">
                        <button
                            onClick={handlePrev}
                            className="h-12 w-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center group/button hover:bg-white/20 transition-colors"
                        >
                            <IconArrowLeft className="h-6 w-6 text-white group-hover/button:rotate-12 transition-transform duration-300" />
                        </button>

                        {/* Role Indicators */}
                        <div className="flex gap-2">
                            {roles.map((role, index) => (
                                <button
                                    key={role.id}
                                    onClick={() => setActive(index)}
                                    className={cn(
                                        "w-3 h-3 rounded-full transition-all duration-300",
                                        isActive(index)
                                            ? `bg-gradient-to-r ${role.gradient} scale-125`
                                            : "bg-white/30 hover:bg-white/50"
                                    )}
                                />
                            ))}
                        </div>

                        <button
                            onClick={handleNext}
                            className="h-12 w-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center group/button hover:bg-white/20 transition-colors"
                        >
                            <IconArrowRight className="h-6 w-6 text-white group-hover/button:-rotate-12 transition-transform duration-300" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

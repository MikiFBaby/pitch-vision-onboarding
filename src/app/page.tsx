"use client";

import { PitchVisionLogo } from "@/components/ui/pitch-vision-logo";
import { RevealText } from "@/components/ui/reveal-text";
import { AnimatedRoleSelector } from "@/components/ui/animated-role-selector";
import { motion } from "framer-motion";

export default function LandingPage() {
  const roles = [
    {
      id: "agent",
      title: "Agent",
      description: "View your performance, access training, and track your progress",
      avatar: "/images/avatar-agent-modern.png",
      gradient: "from-blue-400 to-cyan-300",
      borderGradient: "from-blue-500/0 via-blue-500/80 to-blue-500/0",
    },
    {
      id: "qa",
      title: "QA Team",
      description: "Review and validate analyzed calls, contribute to quality assurance",
      avatar: "/images/avatar-qa-modern.png",
      gradient: "from-purple-400 to-pink-300",
      borderGradient: "from-purple-500/0 via-purple-500/80 to-purple-500/0",
    },
    {
      id: "manager",
      title: "Manager",
      description: "Coach your team, monitor performance, and drive improvement",
      avatar: "/images/avatar-manager-modern.png",
      gradient: "from-indigo-400 to-violet-300",
      borderGradient: "from-indigo-500/0 via-indigo-500/80 to-indigo-500/0",
    },
    {
      id: "hr",
      title: "HR",
      description: "Manage team performance, recruitment, and employee development",
      avatar: "/images/avatar-hr-modern.png",
      gradient: "from-rose-400 to-fuchsia-300",
      borderGradient: "from-rose-500/0 via-rose-500/80 to-rose-500/0",
    },
    {
      id: "executive",
      title: "Executive",
      description: "Access company-wide analytics, insights, and strategic reports",
      avatar: "/images/avatar-executive-modern.png",
      gradient: "from-emerald-400 to-teal-300",
      borderGradient: "from-emerald-500/0 via-emerald-500/80 to-emerald-500/0",
    },
    {
      id: "partner",
      title: "Partners",
      description: "Collaborate on deals, access shared resources, and manage partnerships",
      avatar: "/images/avatar-partner-modern.png",
      gradient: "from-amber-400 to-orange-300",
      borderGradient: "from-amber-500/0 via-amber-500/80 to-amber-500/0",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden font-sans selection:bg-white/20">
      {/* Background Image - Restored */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://i.ibb.co/3K3j0PR/unnamed-3.png"
          alt="Background"
          className="w-full h-full object-cover scale-105 animate-slow-breathe"
        />
        {/* Gradient Overlays for Depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-black/20 to-black/90"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-black/40 to-black"></div>
      </div>

      {/* Header - Top Left Bar Restored */}
      <header className="absolute top-0 left-0 z-50 w-full h-24 bg-black border-b border-white/10 flex items-center px-8 shadow-2xl">
        <PitchVisionLogo />
      </header>

      {/* Main Content Area - Restored Layout */}
      <main className="relative z-10 flex-1 container mx-auto px-4 flex flex-col items-center pt-48 pb-20">

        {/* Hero Section */}
        <div className="text-center mb-16 mt-32 max-w-6xl opacity-0 animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}>
          <div className="mb-0 text-white leading-tight min-h-[120px] w-full flex items-center justify-center">
            <RevealText
              text="From Voice to Vision"
              textColor="text-white"
              overlayColor="text-cyan-400"
              fontSize="text-3xl md:text-7xl lg:text-8xl"
              letterDelay={0.04}
              overlayDelay={0.03}
              className="w-full"
            />
          </div>

          {/* "Select Your Role" CTA */}
          <div className="relative flex flex-col items-center justify-center gap-6 group cursor-default py-8">
            <h2 className="text-3xl md:text-5xl font-semibold tracking-[0.35em] uppercase text-transparent bg-clip-text bg-[linear-gradient(110deg,#d1d5db,45%,#ffffff,50%,#d1d5db)] bg-[length:250%_100%] animate-text-shimmer select-none drop-shadow-[0_0_25px_rgba(255,255,255,0.3)]">
              Select Your Role
            </h2>
            <h2 className="absolute top-[90%] left-0 right-0 text-3xl md:text-5xl font-semibold tracking-[0.35em] uppercase text-transparent bg-clip-text bg-gradient-to-b from-white/20 to-transparent scale-y-[-1] blur-[2px] select-none pointer-events-none transform origin-top opacity-40">
              Select Your Role
            </h2>
          </div>
        </div>

        {/* Animated Role Selector Carousel with "Improved Avatars" */}
        <AnimatedRoleSelector roles={roles} autoplay={false} />
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-8 text-center border-t border-white/5 bg-black/40 backdrop-blur-md">
        <div className="flex flex-col items-center justify-center space-y-2">
          <p className="text-white/40 text-xs tracking-[0.2em] uppercase font-light">
            Powered by
          </p>
          <p className="text-white/80 text-sm font-semibold tracking-widest uppercase hover:text-white transition-colors cursor-default drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
            Pitch Vision Enterprise AI
          </p>
          <p className="text-white/20 text-[10px] mt-2">
            © {new Date().getFullYear()} Pitch Vision Inc. All rights reserved.
          </p>
        </div>
      </footer>

      {/* Global Aesthetics */}
      <style jsx global>{`
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes text-shimmer {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        @keyframes slow-breathe {
          0%, 100% { transform: scale(1.05); filter: brightness(1); }
          50% { transform: scale(1.08); filter: brightness(1.15); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
        .animate-text-shimmer {
          animation: text-shimmer 3.5s linear infinite;
        }
        .animate-slow-breathe {
          animation: slow-breathe 15s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
}

"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Settings,
    LogOut,
    Users,
    FileText,
    BarChart3,
    ShieldCheck,
    Briefcase,
    Radio,
    AlertCircle,
    Plus,
    Calendar,
    Clock,
    MessageSquare,
    BrainCircuit,
    TrendingUp,
    FolderOpen,
    GraduationCap,
    FileBarChart
} from "lucide-react";
import { motion } from "framer-motion";
import { PitchVisionLogo } from "@/components/ui/pitch-vision-logo";
import { useAuth } from "@/context/AuthContext";
import { useQA } from "@/context/QAContext";
import { supabase } from "@/lib/supabase-client";
import Image from "next/image";
import { useSearchParams } from "next/navigation";

interface SidebarItemProps {
    href: string;
    icon: React.ReactNode;
    label: string;
    active?: boolean;
    badge?: number;
    suffix?: React.ReactNode;
}

const SidebarItem = ({ href, icon, label, active, badge, suffix }: SidebarItemProps) => (
    <Link
        href={href}
        className={cn(
            "relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group",
            active ? "text-white" : "text-white/60 hover:text-white"
        )}
    >
        {active && (
            <motion.div
                layoutId="active-pill"
                className="absolute inset-0 bg-white/10 rounded-xl border border-white/5 shadow-[0_4px_20px_rgba(0,0,0,0.3)] z-0"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
            />
        )}
        <div className={cn(
            "relative z-10 p-2 rounded-lg transition-colors",
            active ? "bg-indigo-500/20 text-indigo-400" : "group-hover:bg-white/5 text-white/60 group-hover:text-white"
        )}>
            {icon}
        </div>

        <div className="flex flex-col relative z-10">
            <span className="font-bold tracking-tight text-xs uppercase letter-spacing-[0.05em]">{label}</span>
            {suffix && (
                <div className="mt-0.5">
                    {suffix}
                </div>
            )}
        </div>

        {badge !== undefined && badge > 0 && (
            <div className="relative z-10 ml-auto flex items-center justify-center w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold shadow-[0_0_10px_rgba(244,63,94,0.5)] animate-pulse">
                {badge > 99 ? '99+' : badge}
            </div>
        )}

        {active && (
            <motion.div
                layoutId="active-dot"
                className="relative z-10 ml-auto w-1 h-4 rounded-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.8)]"
            />
        )}
    </Link>
);

export function SidebarInner() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentView = searchParams.get('view') || 'dashboard';

    const { logout, user, profile } = useAuth();

    // Custom avatar and name from user_settings table
    const [customAvatar, setCustomAvatar] = useState<string | null>(null);
    const [customName, setCustomName] = useState<string | null>(null);

    // Fetch custom settings from user_settings table
    // State for resolved Slack ID
    const [slackId, setSlackId] = useState<string | null>(null);

    // 1. Resolve Slack ID
    useEffect(() => {
        const resolveSlackId = async () => {
            const userEmail = profile?.email || user?.email;
            let resolvedId = 'dev-test-user'; // Default fallback

            if (userEmail) {
                try {
                    const { data: empData } = await supabase
                        .from('employee_directory')
                        .select('slack_user_id')
                        .eq('email', userEmail)
                        .single();

                    if (empData?.slack_user_id) {
                        resolvedId = empData.slack_user_id;
                    } else if (profile?.slack_user_id) {
                        resolvedId = profile.slack_user_id;
                    }
                } catch (e) {
                    // Use fallback
                }
            }
            setSlackId(resolvedId);
        };

        resolveSlackId();
    }, [profile, user]);

    // 2. Fetch Initial Data & Subscribe to Realtime Updates
    useEffect(() => {
        if (!slackId) return;

        let channel: any = null;

        const fetchInitial = async () => {
            try {
                const { data: settings } = await supabase
                    .from('user_settings')
                    .select('custom_avatar_url, custom_name')
                    .eq('slack_user_id', slackId)
                    .single();

                if (settings) {
                    setCustomAvatar(settings.custom_avatar_url);
                    setCustomName(settings.custom_name);
                }
            } catch (error) {
                // Silently fail
            }
        };

        const subscribeToRealtime = () => {
            channel = supabase
                .channel(`user-settings-${slackId}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'user_settings',
                        filter: `slack_user_id=eq.${slackId}`
                    },
                    (payload) => {
                        console.log('Realtime update received:', payload);
                        const newRecord = payload.new as any;
                        if (newRecord) {
                            setCustomAvatar(newRecord.custom_avatar_url);
                            setCustomName(newRecord.custom_name);
                        }
                    }
                )
                .subscribe();
        };

        fetchInitial();
        subscribeToRealtime();

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [slackId]);

    // Safety check for QA context availability (in case used outside provider)
    let reviewCount = 0;
    let setAnalyzerOpen: ((open: boolean) => void) | null = null;
    try {
        const qaContext = useQA();
        reviewCount = qaContext.reviewCount;
        setAnalyzerOpen = qaContext.setAnalyzerOpen;
    } catch (e) {
        // Silently fail if not in QA provider
    }

    // Determine which role we are in based on pathname
    const role = pathname.split('/')[1] || "agent";

    const getNavItems = () => {
        const commonItems = [
            { href: `/${role}`, icon: <LayoutDashboard size={20} />, label: "Dashboard" },
            { href: `/${role}/analytics`, icon: <BarChart3 size={20} />, label: "Analytics" },
            { href: `/${role}/settings`, icon: <Settings size={20} />, label: "Settings" },
        ];

        if (role === 'manager') {
            return [
                ...commonItems.slice(0, 1),
                { href: "/manager/team", icon: <Users size={20} />, label: "Team Performance" },
                ...commonItems.slice(1)
            ];
        }

        if (role === 'qa') {
            // Check if we are on the main QA page to handle view-based active states
            const isMainPage = pathname === '/qa';

            return [
                {
                    href: "/qa?view=dashboard",
                    icon: <LayoutDashboard size={20} />,
                    label: "Dashboard",
                    active: isMainPage && (currentView === 'dashboard' || !currentView)
                },
                {
                    href: "/qa?view=live",
                    icon: <Radio size={20} />,
                    label: "Live Feed",
                    active: isMainPage && currentView === 'live'
                },
                {
                    href: "/qa?view=review",
                    icon: <AlertCircle size={20} />,
                    label: "Review Queue",
                    badge: reviewCount,
                    active: isMainPage && currentView === 'review'
                },
                {
                    href: "/qa?view=agents",
                    icon: <TrendingUp size={20} />,
                    label: "Performance",
                    active: isMainPage && currentView === 'agents'
                },
                {
                    href: "/qa?view=reports",
                    icon: <FileText size={20} />,
                    label: "Reports",
                    active: isMainPage && currentView === 'reports'
                },
                {
                    href: "/qa?view=messages",
                    icon: <MessageSquare size={20} />,
                    label: "Messages",
                    active: isMainPage && currentView === 'messages',
                    suffix: (
                        <span className="text-[7px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1 py-px rounded ml-0 uppercase tracking-wider block w-fit">
                            Coming Soon
                        </span>
                    )
                },
                {
                    href: "/qa?view=aura",
                    icon: <BrainCircuit size={20} />,
                    label: "Aura AI",
                    active: isMainPage && currentView === 'aura'
                },
                {
                    href: "/qa?view=settings",
                    icon: <Settings size={20} />,
                    label: "Settings",
                    active: isMainPage && currentView === 'settings'
                },
            ];
        }

        if (role === 'partner') {
            return [
                ...commonItems.slice(0, 1),
                { href: "/partner/deals", icon: <Briefcase size={20} />, label: "Deals" },
                ...commonItems.slice(1)
            ];
        }

        if (role === 'hr') {
            return [
                { href: "/hr", icon: <LayoutDashboard size={20} />, label: "Dashboard" },
                { href: "/hr/directory", icon: <Users size={20} />, label: "Directory" },
                { href: "/hr/calendar", icon: <Calendar size={20} />, label: "Calendar" },
                { href: "/hr/schedule", icon: <Clock size={20} />, label: "Agent Schedule" },
                { href: "/hr/reports", icon: <FileBarChart size={20} />, label: "Reports" },
                ...commonItems.slice(1)
            ];
        }

        // Default agent items
        return [
            ...commonItems.slice(0, 1),
            { href: "/agent/calls", icon: <FileText size={20} />, label: "My Calls" },
            { href: "/agent/resources", icon: <FolderOpen size={20} />, label: "Resource Hub" },
            { href: "/agent/education", icon: <GraduationCap size={20} />, label: "Education" },
            ...commonItems.slice(1)
        ];
    };

    const navItems = getNavItems();

    // Helper function to determine if a sidebar item is active
    const isActive = (href: string, itemActive?: boolean) => {
        // If item.active is explicitly set (like for QA view-based items), use it
        if (itemActive !== undefined) {
            return itemActive;
        }
        // Otherwise, compare href with pathname
        return pathname === href;
    };

    return (
        <aside className="fixed left-0 top-0 h-screen w-72 bg-black/60 backdrop-blur-xl border-r border-white/5 z-50 flex flex-col p-8 overflow-hidden">
            {/* Shimmer Effect */}
            <div className="absolute inset-0 w-[500%] h-full bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-[100%] animate-shimmer pointer-events-none" />

            <div className="mb-8 relative z-10 transition-transform hover:scale-105 duration-500">
                <Link href="/" className="block">
                    <PitchVisionLogo />
                </Link>
            </div>



            <nav className="flex-1 flex flex-col gap-1 relative z-10">

                {navItems.map((item) => (
                    <SidebarItem
                        key={item.href}
                        {...item}
                        active={isActive(item.href, (item as any).active)}
                    />
                ))}
            </nav>

            <div className="mt-auto pt-8 border-t border-white/5 flex flex-col gap-6 relative z-10">
                <div className="flex items-center gap-4 px-4 group cursor-default">
                    <div className="relative">
                        {(customAvatar || profile?.avatar_url) ? (
                            <div className="w-12 h-12 rounded-2xl overflow-hidden border border-white/10 shadow-[0_0_20px_rgba(79,70,229,0.3)] group-hover:shadow-[0_0_30px_rgba(79,70,229,0.5)] transition-all duration-500 rotate-3 group-hover:rotate-0">
                                <Image
                                    src={customAvatar || profile?.avatar_url || ''}
                                    alt="Profile"
                                    width={48}
                                    height={48}
                                    className="object-cover w-full h-full"
                                    unoptimized
                                />
                            </div>
                        ) : (
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold text-xl shadow-[0_0_20px_rgba(79,70,229,0.3)] group-hover:shadow-[0_0_30px_rgba(79,70,229,0.5)] transition-all duration-500 rotate-3 group-hover:rotate-0">
                                {(customName || profile?.first_name)?.[0]?.toUpperCase() || user?.displayName?.[0] || user?.email?.[0] || "U"}
                            </div>
                        )}
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-black rounded-full" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-white tracking-tight truncate max-w-[140px]">
                            {customName || (profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : user?.displayName || (user?.email?.split('@')[0]) || "User")}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/50" />
                            <span className="text-[9px] text-white/60 uppercase font-bold tracking-[0.2em]">
                                {profile?.role || role} Identity
                            </span>
                        </div>
                    </div>

                </div>

                <div className="p-4 border-t border-white/5">
                    <button
                        onClick={logout}
                        className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300 group"
                    >
                        <div className="p-2 rounded-lg bg-white/5 group-hover:bg-red-500/20 transition-colors">
                            <LogOut size={20} />
                        </div>
                        <span className="font-bold tracking-tight text-xs uppercase">Sign Out</span>
                    </button>
                </div>
            </div>
        </aside>
    );
}

// Wrap the Sidebar in Suspense for useSearchParams compatibility with Next.js 16+
export function Sidebar() {
    return (
        <Suspense fallback={
            <aside className="fixed left-0 top-0 h-screen w-72 bg-black/60 backdrop-blur-xl border-r border-white/5 z-50 flex flex-col p-8">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-white/10 rounded w-32"></div>
                    <div className="h-4 bg-white/5 rounded w-24"></div>
                </div>
            </aside>
        }>
            <SidebarInner />
        </Suspense>
    );
}

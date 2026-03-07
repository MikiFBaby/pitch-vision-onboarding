"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useAgentDialedinStats } from "@/hooks/useAgentDialedinStats";
import { useIntradayData } from "@/hooks/useIntradayData";
import { useAgentEarnings } from "@/hooks/useAgentEarnings";
import { getTier, computeHotStreak } from "@/utils/agent-tiers";
import { LayoutDashboard, Trophy, DollarSign, Lightbulb, Eye, Loader2 } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AgentDashboardTab from "@/components/agent/AgentDashboardTab";
import AgentPerformanceTab from "@/components/agent/AgentPerformanceTab";
import AgentEarningsTab from "@/components/agent/AgentEarningsTab";
import AgentCoachingTab from "@/components/agent/AgentCoachingTab";
import { motion } from "framer-motion";

const ADMIN_EMAILS = ["miki@pitchperfectsolutions.net"];

const TABS = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "performance", label: "Performance", icon: Trophy },
    { id: "earnings", label: "Earnings", icon: DollarSign },
    { id: "coaching", label: "Coaching", icon: Lightbulb },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface AgentQA { avg_score: number; total_calls: number; auto_fail_count: number; pass_rate: number; manual_violation_count?: number }
interface RecentCall { id: number; call_date: string; phone_number: string; compliance_score: number | null; auto_fail_triggered: boolean; auto_fail_reasons?: unknown[] | null; risk_level: string; call_duration: string | null; product_type: string | null; recording_url?: string | null; compliance_checklist?: unknown[] | null }
interface ManualViolation { review_date: string; violation: string; reviewer?: string; campaign?: string; phone_number?: string }

export default function AgentDashboard() {
    const { user, profile } = useAuth();
    const searchParams = useSearchParams();
    const [pitchPoints, setPitchPoints] = useState<number | null>(null);
    const isAdmin = ADMIN_EMAILS.includes(user?.email?.toLowerCase() || "") || profile?.is_admin === true || profile?.role === "executive";
    const [simulatedAgent, setSimulatedAgent] = useState<string>("");
    const [agentList, setAgentList] = useState<string[]>([]);
    const [agentListLoading, setAgentListLoading] = useState(false);
    const urlTab = searchParams.get("tab") as TabId | null;
    const [activeTab, setActiveTab] = useState<TabId>(
        urlTab && ["dashboard", "performance", "earnings", "coaching"].includes(urlTab) ? urlTab : "dashboard"
    );

    // Sync tab state when URL param changes (e.g. sidebar click)
    useEffect(() => {
        if (urlTab && ["dashboard", "performance", "earnings", "coaching"].includes(urlTab)) {
            setActiveTab(urlTab);
        } else if (!urlTab) {
            setActiveTab("dashboard");
        }
    }, [urlTab]);

    // Fetch agent list for admin simulation dropdown (lightweight — names only)
    useEffect(() => {
        if (!isAdmin) return;
        setAgentListLoading(true);
        fetch("/api/agent/list")
            .then((r) => r.json())
            .then((d) => {
                if (d?.agents?.length) {
                    setAgentList(d.agents);
                    if (!simulatedAgent) setSimulatedAgent(d.agents[0]);
                }
            })
            .catch((err) => console.error("[AgentPortal] agent list error:", err))
            .finally(() => setAgentListLoading(false));
    }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

    // Resolve DialedIn name from employee_directory (handles name mismatches)
    // Admin mode uses names from /api/agent/list which already resolves dialedin_name
    const realAgentName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
    const [resolvedName, setResolvedName] = useState<string>("");

    useEffect(() => {
        if (isAdmin) return; // admin uses simulatedAgent from dropdown
        if (!user?.email) return;

        fetch(`/api/agent/resolve-name?email=${encodeURIComponent(user.email)}`)
            .then((r) => r.json())
            .then((d) => setResolvedName(d.name || realAgentName))
            .catch(() => setResolvedName(realAgentName));
    }, [user?.email, isAdmin, realAgentName]);

    // Effective agent name: admin uses simulated (already DialedIn names), real agents use resolved
    const agentName = (isAdmin && simulatedAgent) ? simulatedAgent : resolvedName;

    // Fetch real DialedIn stats
    const { latest, recentDays, averages, liveStatus, hasLiveData, loading: statsLoading } =
        useAgentDialedinStats(agentName);

    // Fetch intraday data for this agent (live scraper snapshots)
    const { data: intradayData, loading: intradayLoading } = useIntradayData({
        agent: agentName || undefined,
        includeRank: true,
        includeTrend: true,
        interval: 120_000,
        enabled: !!agentName && agentName.length >= 2,
    });

    // Also fetch team-wide intraday for leaderboard (without agent filter)
    const { data: teamIntradayData } = useIntradayData({
        team: intradayData?.agents?.[0]?.team || undefined,
        includeRank: true,
        includeTrend: false,
        interval: 300_000,
        enabled: activeTab === "performance" && !!intradayData?.agents?.[0]?.team,
    });

    // Earnings & Coaching hooks — only fetch when tab is active
    const { data: earningsData, loading: earningsLoading } = useAgentEarnings(
        activeTab === "earnings" ? agentName : undefined,
    );

    // Extract this agent's data from intraday response
    const intradayAgent = useMemo(() => {
        if (!intradayData?.agents?.length) return null;
        return intradayData.agents[0] ?? null;
    }, [intradayData]);

    // Determine break-even threshold from agent's team
    const agentBreakEven = useMemo(() => {
        if (!intradayAgent?.team || !intradayData?.break_even) return intradayData?.break_even?.aca ?? 2.5;
        const team = intradayAgent.team.toLowerCase();
        if (team.includes("aragon") || team.includes("medicare") || team.includes("whatif") || team.includes("elite") || team.includes("brandon")) {
            return intradayData.break_even.medicare;
        }
        return intradayData.break_even.aca;
    }, [intradayAgent, intradayData]);

    // QA stats + Recent calls — batch endpoint (single HTTP call)
    const [qaStats, setQaStats] = useState<AgentQA | null>(null);
    const [qaLoading, setQaLoading] = useState(true);
    const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
    const [manualViolations, setManualViolations] = useState<ManualViolation[]>([]);
    const [callsLoading, setCallsLoading] = useState(true);

    useEffect(() => {
        if (!agentName || agentName.length < 2) {
            setQaLoading(false);
            setCallsLoading(false);
            return;
        }
        setQaLoading(true);
        setCallsLoading(true);
        fetch(`/api/agent/dashboard?agent=${encodeURIComponent(agentName)}`)
            .then((r) => r.json())
            .then((d) => {
                setQaStats(d?.qa || null);
                setRecentCalls(d?.calls || []);
                setManualViolations(d?.manual_violations || []);
            })
            .catch(() => {
                setQaStats(null);
                setRecentCalls([]);
                setManualViolations([]);
            })
            .finally(() => {
                setQaLoading(false);
                setCallsLoading(false);
            });
    }, [agentName]);

    useEffect(() => {
        if (profile?.id) {
            fetch(`/api/pitch-points/balance?userId=${profile.id}`)
                .then(r => r.json())
                .then(data => {
                    if (data.success) setPitchPoints(data.balance.current_balance);
                })
                .catch(() => {});
        }
    }, [profile?.id]);

    const userName = (isAdmin && simulatedAgent)
        ? simulatedAgent.split(" ")[0]
        : (profile?.first_name || user?.displayName?.split(" ")[0] || "Agent");

    // Shared computed values for Performance + Earnings tabs
    const avgSlaHr = useMemo(() => {
        if (recentDays.length === 0) return 0;
        return recentDays.reduce((s, d) => s + Number(d.sla_hr), 0) / recentDays.length;
    }, [recentDays]);

    const currentTier = useMemo(() => getTier(avgSlaHr), [avgSlaHr]);

    const hotStreak = useMemo(() => {
        const dailySla = [...recentDays].reverse().map((d) => Number(d.sla_hr));
        return computeHotStreak(dailySla, agentBreakEven);
    }, [recentDays, agentBreakEven]);

    const qaScores = useMemo(() => {
        return recentCalls
            .filter((c) => c.compliance_score != null)
            .map((c) => c.compliance_score as number);
    }, [recentCalls]);

    // Extract recent violations for Coaching tab context
    const recentViolations = useMemo(() => {
        const violations: { code: string; violation: string; date: string }[] = [];
        for (const call of recentCalls) {
            if (!call.auto_fail_triggered || !call.auto_fail_reasons || !Array.isArray(call.auto_fail_reasons)) continue;
            for (const r of call.auto_fail_reasons) {
                const reason = r as { code?: string; violation?: string };
                if (reason?.code) {
                    violations.push({
                        code: reason.code,
                        violation: reason.violation || reason.code,
                        date: call.call_date ? new Date(call.call_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "",
                    });
                }
            }
        }
        return violations;
    }, [recentCalls]);

    return (
        <DashboardLayout>
            <div className="space-y-6">
                {/* Admin Agent Simulation Banner */}
                {isAdmin && (
                    <div className="px-4 py-3 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center gap-3">
                        <Eye size={14} className="text-purple-400 shrink-0" />
                        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest shrink-0">View as</span>
                        {agentListLoading ? (
                            <div className="flex items-center gap-2 text-xs text-white/50">
                                <Loader2 size={12} className="animate-spin" />
                                Loading agents...
                            </div>
                        ) : (
                            <select
                                value={simulatedAgent}
                                onChange={(e) => setSimulatedAgent(e.target.value)}
                                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500/50 min-w-[220px] appearance-auto"
                            >
                                {agentList.length === 0 && (
                                    <option value="">No agents loaded</option>
                                )}
                                {agentList.map((name) => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                        )}
                        <span className="text-[10px] text-white/30 ml-auto shrink-0">
                            {agentList.length} agents
                        </span>
                    </div>
                )}

                {/* Page Header + Tabs */}
                <div className="flex flex-col gap-4">
                    <h2 className="text-3xl font-bold tracking-tight text-white">
                        Agent Portal
                        <span className="inline-block ml-2 w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    </h2>

                    {/* Tab Strip */}
                    <div className="flex gap-1 bg-white/5 rounded-xl p-1">
                        {TABS.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all flex-1 justify-center ${
                                        isActive
                                            ? "text-white"
                                            : "text-white/40 hover:text-white/60"
                                    }`}
                                >
                                    {isActive && (
                                        <motion.div
                                            layoutId="activeTab"
                                            className="absolute inset-0 bg-white/10 rounded-lg"
                                            transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                                        />
                                    )}
                                    <Icon size={14} className="relative z-10" />
                                    <span className="relative z-10 hidden sm:inline">{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Tab Content */}
                {activeTab === "dashboard" && (
                    <AgentDashboardTab
                        userName={userName}
                        agentEmail={user?.email || ""}
                        intradayAgent={intradayAgent}
                        intradayData={intradayData}
                        intradayLoading={intradayLoading}
                        liveStatus={liveStatus}
                        hasLiveData={hasLiveData}
                        recentDays={recentDays}
                        averages={averages}
                        latest={latest}
                        qaStats={qaStats}
                        recentCalls={recentCalls}
                        manualViolations={manualViolations}
                        callsLoading={callsLoading}
                        statsLoading={statsLoading}
                        qaLoading={qaLoading}
                        agentBreakEven={agentBreakEven}
                        pitchPoints={pitchPoints}
                    />
                )}

                {activeTab === "performance" && (
                    <AgentPerformanceTab
                        agentName={agentName}
                        recentDays={recentDays}
                        intradayAgents={teamIntradayData?.agents || intradayData?.agents || []}
                        agentBreakEven={agentBreakEven}
                        qaScores={qaScores}
                        currentTier={currentTier}
                        avgSlaHr={avgSlaHr}
                        hotStreak={hotStreak}
                        qaStats={qaStats}
                    />
                )}

                {activeTab === "earnings" && (
                    <AgentEarningsTab
                        agentName={agentName}
                        intradayAgent={intradayAgent}
                        earningsData={earningsData}
                        earningsLoading={earningsLoading}
                        recentDays={recentDays}
                        tier={currentTier}
                        avgSlaHr={avgSlaHr}
                    />
                )}

                {activeTab === "coaching" && (
                    <AgentCoachingTab
                        agentName={agentName}
                        agentEmail={user?.email || ""}
                        loading={statsLoading || callsLoading}
                        recentViolations={recentViolations}
                        recentDays={recentDays}
                        qaStats={qaStats}
                        agentBreakEven={agentBreakEven}
                        productType={intradayAgent?.team || ""}
                        recentCalls={recentCalls}
                    />
                )}
            </div>
        </DashboardLayout>
    );
}

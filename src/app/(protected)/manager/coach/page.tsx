"use client";
import { useMemo, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import WatchListPanel from "@/components/manager/WatchListPanel";
import CoachingActionLog from "@/components/manager/CoachingActionLog";
import AICoachingDrafts from "@/components/manager/AICoachingDrafts";
import AgentScoutingCard from "@/components/manager/AgentScoutingCard";
import { useWatchList } from "@/hooks/useWatchList";
import { useCoachingLog } from "@/hooks/useCoachingLog";
import { useIntradayData } from "@/hooks/useIntradayData";
import { GraduationCap } from "lucide-react";
import {
    getCampaignsForManager,
    getAllManagerNames,
    getTeamFilterForManager,
    CAMPAIGN_TO_TEAM_SUBSTRING,
} from "@/lib/campaign-config";
import { getBreakEvenTPH } from "@/utils/dialedin-revenue";

const ADMIN_EMAILS = ["miki@pitchperfectsolutions.net"];

export default function CoachCornerPage() {
    const { user, profile } = useAuth();
    const managerName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
    const isAdmin = ADMIN_EMAILS.includes(user?.email?.toLowerCase() || "") || profile?.role === "executive";

    const ownCampaigns = useMemo(() => getCampaignsForManager(managerName), [managerName]);
    const allManagerNames = useMemo(() => getAllManagerNames(), []);

    // Simulation state: admin can pick a manager to "view as"
    const [simulatedManager, setSimulatedManager] = useState<string>("__all__");

    // Derive effective campaigns and team filter based on simulation
    const { teamFilter } = useMemo(() => {
        if (!isAdmin) {
            const substrings = ownCampaigns.map((c) => CAMPAIGN_TO_TEAM_SUBSTRING[c]).filter(Boolean);
            return { teamFilter: substrings.join(",") };
        }
        if (simulatedManager === "__all__") {
            return { teamFilter: "" };
        }
        return { teamFilter: getTeamFilterForManager(simulatedManager) };
    }, [isAdmin, simulatedManager, ownCampaigns]);

    const isManager = isAdmin || ownCampaigns.length > 0;

    // Data hooks — all fire in parallel
    const { data: watchData, loading: watchLoading } = useWatchList({
        team: teamFilter || undefined,
        enabled: isManager,
    });

    const { events: coachingEvents, loading: coachingLoading, refetch: refetchCoaching } = useCoachingLog({
        enabled: isManager,
    });

    const { data: intradayData } = useIntradayData({
        team: teamFilter || undefined,
        includeRank: true,
        enabled: isManager,
    });

    // Scouting card state
    const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

    // Team averages for scouting card context
    const teamStats = useMemo(() => {
        const agents = intradayData?.agents || [];
        const working = agents.filter((a) => a.hours_worked > 0);
        if (!working.length) return { avgConvRate: 0, avgDialsPerHour: 0, avgSlaHr: 0, totalAgents: 0 };
        return {
            avgConvRate: working.reduce((s, a) => s + a.conversion_rate_pct, 0) / working.length,
            avgDialsPerHour: working.reduce((s, a) => s + (a.dialed / Math.max(a.hours_worked, 0.01)), 0) / working.length,
            avgSlaHr: working.reduce((s, a) => s + a.sla_hr, 0) / working.length,
            totalAgents: working.length,
        };
    }, [intradayData]);

    // Log coaching handler
    const handleLogCoaching = useCallback(async (data: { agent_name: string; event_type: string; notes: string }) => {
        try {
            const res = await fetch("/api/dialedin/coaching", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    agent_name: data.agent_name,
                    event_type: data.event_type,
                    notes: data.notes,
                    coach_name: managerName || null,
                    event_date: new Date().toISOString().split("T")[0],
                }),
            });
            if (res.ok) refetchCoaching();
        } catch (err) {
            console.error("[CoachCorner] log coaching error:", err);
        }
    }, [managerName, refetchCoaching]);

    // AI draft → coaching notes handler
    const handleUseAsNotes = useCallback((agentName: string, notes: string) => {
        handleLogCoaching({ agent_name: agentName, event_type: "coaching", notes });
    }, [handleLogCoaching]);

    if (!isManager) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center min-h-[50vh]">
                    <p className="text-white/40 text-sm">You do not have manager access.</p>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            {/* Admin Simulation Banner */}
            {isAdmin && (
                <div className="mb-6 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3">
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Simulating</span>
                    <select
                        value={simulatedManager}
                        onChange={(e) => setSimulatedManager(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500/50"
                    >
                        <option value="__all__">All Teams</option>
                        {allManagerNames.map((m) => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <GraduationCap size={20} className="text-purple-400" />
                <h1 className="text-lg font-bold text-white tracking-tight">Coach&apos;s Corner</h1>
                <div className="flex items-center gap-1.5 ml-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] text-white/30 font-mono">
                        {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                </div>
            </div>

            {/* Row 1: Watch List + Coaching Log */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <WatchListPanel
                    agents={watchData?.agents || []}
                    loading={watchLoading}
                    onAgentClick={setSelectedAgent}
                    onCoachAgent={(name) => {
                        // Pre-fill coaching log form for this agent
                        handleLogCoaching({ agent_name: name, event_type: "coaching", notes: "" });
                    }}
                />
                <CoachingActionLog
                    events={coachingEvents}
                    loading={coachingLoading}
                    onAgentClick={setSelectedAgent}
                    onLogCoaching={handleLogCoaching}
                />
            </div>

            {/* Row 2: AI Coaching Drafts */}
            <AICoachingDrafts
                agents={watchData?.agents || []}
                onUseAsNotes={handleUseAsNotes}
            />

            {/* Agent Scouting Card Drawer */}
            <AgentScoutingCard
                isOpen={!!selectedAgent}
                onClose={() => setSelectedAgent(null)}
                agentName={selectedAgent}
                intradayAgent={null}
                yesterdayData={null}
                qaPerAgent={null}
                declineAlert={null}
                attentionFlags={null}
                breakEven={getBreakEvenTPH("Jade ACA Team")}
                teamStats={teamStats}
                agentNames={watchData?.agents.map((a) => a.name) || []}
                onNavigate={setSelectedAgent}
            />
        </DashboardLayout>
    );
}

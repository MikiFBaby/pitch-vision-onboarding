"use client";
import { useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useIntradayData } from "@/hooks/useIntradayData";
import { useYesterdayComparison } from "@/hooks/useYesterdayComparison";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ManagerKpiStrip from "@/components/manager/ManagerKpiStrip";
import TeamAgentTable from "@/components/manager/TeamAgentTable";
import AttentionPanel, { type AttentionFlag, type ActionAgent } from "@/components/manager/AttentionPanel";
import HourlyChart from "@/components/manager/HourlyChart";
import SlaVelocity from "@/components/manager/SlaVelocity";
import YesterdayComparisonBar from "@/components/manager/YesterdayComparisonBar";
import EodProjection from "@/components/manager/EodProjection";
import QAComplianceSummary from "@/components/manager/QAComplianceSummary";
import DeclineAlertPanel from "@/components/manager/DeclineAlertPanel";
import AgentScoutingCard from "@/components/manager/AgentScoutingCard";
import { useManagerQAStats } from "@/hooks/useManagerQAStats";
import { useManagerDeclineAlerts } from "@/hooks/useManagerDeclineAlerts";
import { AlertTriangle, X, Eye } from "lucide-react";
import {
    getCampaignsForManager,
    getAllManagerNames,
    getTeamFilterForManager,
    CAMPAIGN_MANAGERS,
    CAMPAIGN_TO_TEAM_SUBSTRING,
} from "@/lib/campaign-config";
import { getBreakEvenTPH } from "@/utils/dialedin-revenue";

const ADMIN_EMAILS = ["miki@pitchperfectsolutions.net"];

export default function ManagerDashboard() {
    const { user, profile } = useAuth();
    const managerName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
    const isAdmin = ADMIN_EMAILS.includes(user?.email?.toLowerCase() || "") || profile?.role === "executive";

    const ownCampaigns = useMemo(() => getCampaignsForManager(managerName), [managerName]);
    const allManagerNames = useMemo(() => getAllManagerNames(), []);

    // Simulation state: admin can pick a manager to "view as"
    const [simulatedManager, setSimulatedManager] = useState<string>("__all__");

    // Derive effective campaigns and team filter based on simulation
    const { campaigns, teamFilter, effectiveManagerName } = useMemo(() => {
        if (!isAdmin) {
            // Regular manager — use their own campaigns
            const substrings = ownCampaigns.map((c) => CAMPAIGN_TO_TEAM_SUBSTRING[c]).filter(Boolean);
            return {
                campaigns: ownCampaigns,
                teamFilter: substrings.join(","),
                effectiveManagerName: managerName,
            };
        }
        if (simulatedManager === "__all__") {
            // Admin viewing all campaigns
            return {
                campaigns: Object.keys(CAMPAIGN_MANAGERS),
                teamFilter: "",
                effectiveManagerName: null,
            };
        }
        // Admin simulating a specific manager
        const simCampaigns = getCampaignsForManager(simulatedManager);
        const simTeam = getTeamFilterForManager(simulatedManager);
        return {
            campaigns: simCampaigns,
            teamFilter: simTeam,
            effectiveManagerName: simulatedManager,
        };
    }, [isAdmin, simulatedManager, ownCampaigns, managerName]);

    const isManager = isAdmin || ownCampaigns.length > 0;

    const { data, loading, stale } = useIntradayData({
        team: teamFilter || undefined,
        includeRank: true,
        includeTrend: true,
        interval: 120_000,
        enabled: isManager,
    });

    const { data: yesterdayData, loading: yesterdayLoading } = useYesterdayComparison({
        team: teamFilter || undefined,
        enabled: isManager,
    });

    // Fire QA + decline hooks immediately with team filter — no waterfall
    const { data: qaData, loading: qaLoading } = useManagerQAStats({
        team: teamFilter || undefined,
        enabled: isManager,
    });

    const { alerts: declineAlerts, loading: declineLoading } = useManagerDeclineAlerts({
        team: teamFilter || undefined,
        enabled: isManager,
    });

    // Break-even for the primary campaign type
    const primaryBE = useMemo(() => {
        if (!campaigns.length) return 2.5;
        const first = campaigns[0];
        if (first.includes("Medicare") || first.includes("WhatIF")) return getBreakEvenTPH("Aragon Team A");
        return getBreakEvenTPH("Jade ACA Team");
    }, [campaigns]);

    // Agent list with break-even annotations
    const agents = useMemo(() => {
        if (!data?.agents) return [];
        return data.agents.map((a) => {
            const team = a.team?.toLowerCase() || "";
            const isMedicare = team.includes("aragon") || team.includes("medicare") || team.includes("whatif") || team.includes("elite") || team.includes("brandon");
            const be = isMedicare ? (data.break_even?.medicare ?? 3.5) : (data.break_even?.aca ?? 2.5);
            return { ...a, be, aboveBE: a.sla_hr >= be };
        });
    }, [data]);

    // Attention needed: agents below B/E with >1hr worked
    const attentionNeeded = useMemo(
        () => agents.filter((a) => !a.aboveBE && a.hours_worked >= 1).sort((a, b) => a.sla_hr - b.sla_hr),
        [agents],
    );

    const aboveBECount = useMemo(() => agents.filter((a) => a.aboveBE && a.hours_worked > 0).length, [agents]);

    // Scouting card state
    const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

    // Team averages for "vs team" comparisons in scouting card
    const teamStats = useMemo(() => {
        const working = agents.filter((a) => a.hours_worked > 0);
        if (!working.length) return { avgConvRate: 0, avgDialsPerHour: 0, avgSlaHr: 0, totalAgents: 0 };
        return {
            avgConvRate: working.reduce((s, a) => s + a.conversion_rate_pct, 0) / working.length,
            avgDialsPerHour: working.reduce((s, a) => s + (a.dialed / Math.max(a.hours_worked, 0.01)), 0) / working.length,
            avgSlaHr: working.reduce((s, a) => s + a.sla_hr, 0) / working.length,
            totalAgents: working.length,
        };
    }, [agents]);

    // Hidden Gems: below B/E but above-avg conversion (Moneyball undervalued closers)
    const hiddenGems = useMemo(() => {
        const gems = new Set<string>();
        if (teamStats.avgConvRate <= 0) return gems;
        for (const a of agents) {
            if (!a.aboveBE && a.conversion_rate_pct > teamStats.avgConvRate && a.hours_worked >= 1) {
                gems.add(a.name);
            }
        }
        return gems;
    }, [agents, teamStats]);

    // Action Center: multi-signal flagging for agents needing attention
    const actionAgents = useMemo((): ActionAgent[] => {
        const SEVERITY_WEIGHT = { critical: 3, warning: 2, info: 1 } as const;
        return attentionNeeded.map((a) => {
            const flags: AttentionFlag[] = [];
            const beDelta = a.sla_hr - a.be;
            flags.push({ type: "below_be", label: `${beDelta.toFixed(1)} B/E`, severity: beDelta < -1.5 ? "critical" : "warning" });
            if (a.momentum === "down") {
                flags.push({ type: "declining", label: "Declining", severity: "warning" });
            }
            const qaAgent = qaData?.per_agent?.[a.name];
            if (qaAgent && qaAgent.auto_fail_count > 0) {
                flags.push({ type: "qa_issue", label: `AF: ${qaAgent.auto_fail_count}`, severity: qaAgent.auto_fail_count >= 3 ? "critical" : "warning" });
            }
            const decline = declineAlerts?.find((d) => d.agent_name === a.name);
            if (decline) {
                flags.push({ type: "decline_streak", label: `${decline.consecutive_decline_days}d streak`, severity: decline.severity });
            }
            if (a.is_new_hire && a.sla_hr < a.be * 0.5) {
                flags.push({ type: "new_hire_struggling", label: "New hire", severity: "info" });
            }
            return {
                name: a.name, sla_hr: a.sla_hr, transfers: a.transfers,
                hours_worked: a.hours_worked, be: a.be, flags,
                priority: flags.reduce((s, f) => s + SEVERITY_WEIGHT[f.severity], 0),
            };
        }).sort((a, b) => b.priority - a.priority);
    }, [attentionNeeded, qaData, declineAlerts]);

    // Hourly deltas for chart
    const hourlyDeltas = useMemo(() => {
        const trend = data?.hourly_trend;
        if (!trend || trend.length === 0) return [];
        return trend.map((h, i) => ({
            hour: h.hour,
            sla_delta: i === 0 ? h.sla_total : h.sla_total - trend[i - 1].sla_total,
            sla_total: h.sla_total,
            agent_count: h.agent_count,
        }));
    }, [data]);

    // SLA Velocity: compare avg SLA/hr of last 2 hours vs prior 2 hours
    const velocity = useMemo(() => {
        if (hourlyDeltas.length < 3) return null;
        const recent = hourlyDeltas.slice(-2);
        const prior = hourlyDeltas.slice(-4, -2);
        const recentAvg = recent.reduce((s, d) => s + d.sla_delta, 0) / recent.length;
        const priorAvg = prior.length > 0 ? prior.reduce((s, d) => s + d.sla_delta, 0) / prior.length : recentAvg;
        return recentAvg - priorAvg;
    }, [hourlyDeltas]);

    // Yesterday delta: today's SLA total vs yesterday at the same time
    const yesterdayDelta = useMemo(() => {
        if (!yesterdayData?.same_time_yesterday || !data?.totals) return null;
        return (data.totals.sla_total ?? 0) - yesterdayData.same_time_yesterday.total_transfers;
    }, [yesterdayData, data]);

    const userName = profile?.first_name || "Manager";
    const totals = data?.totals;
    const isSimulating = isAdmin && simulatedManager !== "__all__";

    if (!isManager) {
        return (
            <DashboardLayout>
                <div className="space-y-8">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-3xl font-bold tracking-tight text-white">Team Hub</h2>
                        <p className="text-white/50 text-sm font-medium">
                            Welcome, <span className="text-white font-bold">{userName}</span>.
                        </p>
                    </div>
                    <div className="glass-card p-8 rounded-2xl border-white/5 text-center">
                        <AlertTriangle className="mx-auto mb-3 text-amber-400" size={32} />
                        <p className="text-white/70 text-sm">You are not currently assigned as a campaign manager.</p>
                        <p className="text-white/40 text-xs mt-1">If this is an error, contact HR to update your campaign assignment.</p>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-8">
                {/* Simulation Banner */}
                {isSimulating && (
                    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                        <Eye size={14} className="text-indigo-400 shrink-0" />
                        <span className="text-xs text-indigo-300 font-medium">
                            Viewing as: <span className="text-white font-bold">{simulatedManager}</span>
                            <span className="text-indigo-400/60 ml-1">({campaigns.join(", ")})</span>
                        </span>
                        <button
                            onClick={() => setSimulatedManager("__all__")}
                            className="ml-auto p-1 rounded hover:bg-white/10 transition-colors"
                            title="Clear simulation"
                        >
                            <X size={12} className="text-indigo-400" />
                        </button>
                    </div>
                )}

                {/* Header */}
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                        <h2 className="text-3xl font-bold tracking-tight text-white group cursor-default">
                            Team Hub
                            {!loading && data && (
                                <span className={`inline-block ml-2 w-2 h-2 rounded-full ${stale ? "bg-amber-500" : "bg-emerald-500 animate-pulse"}`} />
                            )}
                        </h2>
                        {isAdmin && (
                            <select
                                value={simulatedManager}
                                onChange={(e) => setSimulatedManager(e.target.value)}
                                className="bg-white/5 border border-white/10 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500/50"
                            >
                                <option value="__all__" className="bg-[#0d1117]">All Campaigns (Admin)</option>
                                <option disabled className="bg-[#0d1117]">── Simulate Manager ──</option>
                                {allManagerNames.map((m) => (
                                    <option key={m} value={m} className="bg-[#0d1117]">{m}</option>
                                ))}
                            </select>
                        )}
                    </div>
                    <p className="text-white/50 text-sm font-medium">
                        Welcome, <span className="text-white font-bold">{userName}</span>.{" "}
                        <span className="text-white/40">
                            {isAdmin && !isSimulating ? "Viewing all campaigns" : campaigns.join(", ")}
                        </span>
                        {data?.latest_snapshot_at && (
                            <span className="text-white/30 ml-2 text-xs font-mono">
                                {new Date(data.latest_snapshot_at).toLocaleTimeString("en-US", {
                                    timeZone: "America/New_York",
                                    hour: "numeric",
                                    minute: "2-digit",
                                })} ET
                                {stale && <span className="text-amber-400 ml-1">(stale)</span>}
                            </span>
                        )}
                    </p>
                </div>

                {/* KPI Cards */}
                <ManagerKpiStrip
                    loading={loading}
                    totals={totals}
                    primaryBE={primaryBE}
                    attentionCount={attentionNeeded.length}
                    campaignLabel={campaigns[0] || ""}
                    velocity={velocity}
                    yesterdayDelta={yesterdayDelta}
                    yesterdaySameTimeSla={yesterdayData?.same_time_yesterday?.total_transfers ?? null}
                    aboveBECount={aboveBECount}
                    totalAgentCount={agents.filter((a) => a.hours_worked > 0).length}
                />

                {/* Velocity + Yesterday + EOD Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <SlaVelocity deltas={hourlyDeltas} />
                    <YesterdayComparisonBar
                        todaySla={totals?.sla_total ?? 0}
                        yesterdaySameTimeSla={yesterdayData?.same_time_yesterday?.total_transfers ?? null}
                        yesterdayFinalSla={yesterdayData?.yesterday?.total_transfers ?? 0}
                        loading={loading || yesterdayLoading}
                    />
                    <EodProjection
                        currentSla={totals?.sla_total ?? 0}
                        hoursElapsed={yesterdayData?.eod_projection?.hours_elapsed ?? 0}
                        hoursRemaining={yesterdayData?.eod_projection?.hours_remaining ?? 0}
                        totalBusinessHours={yesterdayData?.eod_projection?.total_business_hours ?? 9}
                        confidence={yesterdayData?.eod_projection?.confidence ?? "low"}
                        breakEvenTarget={primaryBE}
                        activeAgents={totals?.active_agents ?? 0}
                        historicContext={yesterdayData?.eod_projection?.historic_context}
                    />
                </div>

                {/* Agent Table + Attention Panel */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <TeamAgentTable agents={agents} loading={loading} agentYesterday={yesterdayData?.agent_yesterday} onAgentClick={setSelectedAgent} hiddenGems={hiddenGems} />
                    <AttentionPanel agents={actionAgents} loading={loading} onAgentClick={setSelectedAgent} />
                </div>

                {/* Hourly Chart */}
                <HourlyChart deltas={hourlyDeltas} loading={loading} />

                {/* QA Compliance + Decline Alerts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <QAComplianceSummary data={qaData} loading={qaLoading} onAgentClick={setSelectedAgent} />
                    <DeclineAlertPanel alerts={declineAlerts} loading={declineLoading} onAgentClick={setSelectedAgent} />
                </div>
            </div>

            {/* Agent Scouting Card Drawer */}
            <AgentScoutingCard
                isOpen={!!selectedAgent}
                onClose={() => setSelectedAgent(null)}
                agentName={selectedAgent}
                intradayAgent={agents.find((a) => a.name === selectedAgent) ?? null}
                yesterdayData={selectedAgent ? yesterdayData?.agent_yesterday?.[selectedAgent] ?? null : null}
                qaPerAgent={selectedAgent ? qaData?.per_agent?.[selectedAgent] ?? null : null}
                declineAlert={selectedAgent ? declineAlerts?.find((d) => d.agent_name === selectedAgent) ?? null : null}
                attentionFlags={selectedAgent ? actionAgents.find((a) => a.name === selectedAgent)?.flags ?? null : null}
                breakEven={agents.find((a) => a.name === selectedAgent)?.be ?? primaryBE}
                teamStats={teamStats}
                agentNames={agents.map((a) => a.name)}
                onNavigate={setSelectedAgent}
            />
        </DashboardLayout>
    );
}

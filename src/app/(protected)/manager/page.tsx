"use client";
import { useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useIntradayData } from "@/hooks/useIntradayData";
import DashboardLayout from "@/components/layout/DashboardLayout";
import StatsCard from "@/components/dashboard/StatsCard";
import { Users, Target, Zap, TrendingUp, AlertTriangle } from "lucide-react";
import { getCampaignsForManager, CAMPAIGN_MANAGERS, CAMPAIGN_TO_TEAM_SUBSTRING } from "@/lib/campaign-config";
import { getBreakEvenTPH } from "@/utils/dialedin-revenue";

// Admins/executives can view all teams with a campaign selector
const ADMIN_EMAILS = ["miki@pitchperfectsolutions.net"];

export default function ManagerDashboard() {
    const { user, profile } = useAuth();
    const managerName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
    const isAdmin = ADMIN_EMAILS.includes(user?.email?.toLowerCase() || "") || profile?.role === "executive";

    const ownCampaigns = useMemo(() => getCampaignsForManager(managerName), [managerName]);
    const allCampaignNames = useMemo(() => Object.keys(CAMPAIGN_MANAGERS), []);
    const [selectedCampaign, setSelectedCampaign] = useState<string>("all");

    // Admin sees all teams (or selected campaign); managers see their own
    const campaigns = isAdmin
        ? (selectedCampaign === "all" ? allCampaignNames : [selectedCampaign])
        : ownCampaigns;

    const teamFilter = useMemo(() => {
        if (isAdmin && selectedCampaign === "all") return ""; // empty = all teams
        if (isAdmin && selectedCampaign !== "all") return CAMPAIGN_TO_TEAM_SUBSTRING[selectedCampaign] || "";
        // For regular managers, build team filter from their campaigns
        const substrings = ownCampaigns.map(c => CAMPAIGN_TO_TEAM_SUBSTRING[c]).filter(Boolean);
        return substrings.join(",");
    }, [isAdmin, selectedCampaign, ownCampaigns]);

    const isManager = isAdmin || ownCampaigns.length > 0;

    const { data, loading, stale } = useIntradayData({
        team: teamFilter || undefined,
        includeRank: true,
        includeTrend: true,
        interval: 120_000,
        enabled: isManager,
    });

    // Break-even for the manager's primary campaign type
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

    const userName = profile?.first_name || user?.displayName?.split(" ")[0] || "Manager";
    const totals = data?.totals;

    if (!isManager) {
        return (
            <DashboardLayout>
                <div className="space-y-8">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-3xl font-bold tracking-tight text-white">
                            Manager Overview
                        </h2>
                        <p className="text-white/50 text-sm font-medium">
                            Welcome, <span className="text-white font-bold">{userName}</span>.
                        </p>
                    </div>
                    <div className="glass-card p-8 rounded-2xl border-white/5 text-center">
                        <AlertTriangle className="mx-auto mb-3 text-amber-400" size={32} />
                        <p className="text-white/70 text-sm">
                            You are not currently assigned as a campaign manager.
                        </p>
                        <p className="text-white/40 text-xs mt-1">
                            If this is an error, contact HR to update your campaign assignment.
                        </p>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-8">
                {/* Header */}
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                        <h2 className="text-3xl font-bold tracking-tight text-white group cursor-default">
                            Manager Overview
                            {!loading && data && (
                                <span className={`inline-block ml-2 w-2 h-2 rounded-full ${stale ? "bg-amber-500" : "bg-emerald-500 animate-pulse"}`} />
                            )}
                        </h2>
                        {isAdmin && (
                            <select
                                value={selectedCampaign}
                                onChange={(e) => setSelectedCampaign(e.target.value)}
                                className="bg-white/5 border border-white/10 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500/50"
                            >
                                <option value="all" className="bg-[#0d1117]">All Campaigns</option>
                                {allCampaignNames.map((c) => (
                                    <option key={c} value={c} className="bg-[#0d1117]">{c}</option>
                                ))}
                            </select>
                        )}
                    </div>
                    <p className="text-white/50 text-sm font-medium">
                        Welcome, <span className="text-white font-bold">{userName}</span>.{" "}
                        <span className="text-white/40">
                            {isAdmin && selectedCampaign === "all" ? "Viewing all campaigns" : campaigns.join(", ")}
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
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <StatsCard
                        index={0}
                        title="Team SLA Today"
                        value={loading ? "—" : String(totals?.sla_total ?? 0)}
                        trend="neutral"
                        trendValue={totals ? `${totals.production_hours.toFixed(1)}h` : ""}
                        icon={<Zap size={18} />}
                    />
                    <StatsCard
                        index={1}
                        title="Active Agents"
                        value={loading ? "—" : String(totals?.active_agents ?? 0)}
                        trend="neutral"
                        trendValue={attentionNeeded.length > 0 ? `${attentionNeeded.length} need attention` : "all ok"}
                        icon={<Users size={18} />}
                    />
                    <StatsCard
                        index={2}
                        title="Team Avg SLA/hr"
                        value={loading ? "—" : (totals?.avg_sla_hr?.toFixed(2) ?? "—")}
                        trend={totals ? (totals.avg_sla_hr >= primaryBE ? "up" : "down") : "neutral"}
                        trendValue={`B/E: ${primaryBE}`}
                        icon={<Target size={18} />}
                    />
                    <StatsCard
                        index={3}
                        title="vs Break-Even"
                        value={loading ? "—" : `${((totals?.avg_sla_hr ?? 0) - primaryBE >= 0 ? "+" : "")}${((totals?.avg_sla_hr ?? 0) - primaryBE).toFixed(2)}`}
                        trend={totals ? ((totals.avg_sla_hr ?? 0) >= primaryBE ? "up" : "down") : "neutral"}
                        trendValue={campaigns[0] || ""}
                        icon={<TrendingUp size={18} />}
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Team Agent Table */}
                    <div className="lg:col-span-2 glass-card p-6 rounded-2xl border-white/5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-white uppercase tracking-widest">Team Agents</h3>
                            <span className="text-[10px] text-white/40 font-mono">{agents.length} agents</span>
                        </div>
                        {loading ? (
                            <div className="space-y-2">
                                {[1, 2, 3, 4].map((i) => (
                                    <div key={i} className="h-10 bg-white/5 rounded animate-pulse" />
                                ))}
                            </div>
                        ) : agents.length === 0 ? (
                            <p className="text-white/40 text-sm italic">No agents found for your team today.</p>
                        ) : (
                            <div className="overflow-y-auto max-h-[400px]">
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-[#0d1117]">
                                        <tr className="text-white/50 uppercase tracking-wider">
                                            <th className="text-left py-2 pr-3">#</th>
                                            <th className="text-left py-2 pr-3">Agent</th>
                                            <th className="text-right py-2 pr-3">SLA/hr</th>
                                            <th className="text-right py-2 pr-3">SLAs</th>
                                            <th className="text-right py-2 pr-3">Hours</th>
                                            <th className="text-right py-2">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {agents.map((a) => (
                                            <tr key={a.name} className="hover:bg-white/5 transition-colors">
                                                <td className="py-2 pr-3 text-white/40 tabular-nums">{a.rank ?? "—"}</td>
                                                <td className="py-2 pr-3 text-white/90 font-medium">
                                                    {a.name}
                                                    {a.is_new_hire && (
                                                        <span className="ml-1.5 text-[9px] font-bold bg-blue-500/20 text-blue-400 px-1 py-0.5 rounded">NEW</span>
                                                    )}
                                                </td>
                                                <td className={`py-2 pr-3 text-right font-mono font-bold tabular-nums ${a.aboveBE ? "text-emerald-400" : "text-red-400"}`}>
                                                    {a.sla_hr.toFixed(2)}
                                                </td>
                                                <td className="py-2 pr-3 text-right text-white/70 tabular-nums">{a.transfers}</td>
                                                <td className="py-2 pr-3 text-right text-white/50 tabular-nums">{a.hours_worked.toFixed(1)}</td>
                                                <td className="py-2 text-right">
                                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${a.aboveBE ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                                                        {a.aboveBE ? "OK" : "BELOW"}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Attention Needed Panel */}
                    <div className="glass-card p-6 rounded-2xl border-white/5">
                        <div className="flex items-center gap-2 mb-4">
                            <AlertTriangle size={14} className="text-amber-400" />
                            <h3 className="text-sm font-bold text-white uppercase tracking-widest">Attention Needed</h3>
                        </div>
                        {loading ? (
                            <div className="space-y-2">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="h-14 bg-white/5 rounded animate-pulse" />
                                ))}
                            </div>
                        ) : attentionNeeded.length === 0 ? (
                            <div className="text-center py-8">
                                <span className="text-emerald-400 text-2xl">&#10003;</span>
                                <p className="text-white/50 text-sm mt-2">All agents performing above break-even.</p>
                            </div>
                        ) : (
                            <div className="space-y-2 overflow-y-auto max-h-[360px]">
                                {attentionNeeded.map((a) => (
                                    <div key={a.name} className="bg-red-500/5 border border-red-500/10 rounded-lg p-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-white/90 text-xs font-medium truncate">{a.name}</span>
                                            <span className="text-red-400 text-xs font-mono font-bold tabular-nums">{a.sla_hr.toFixed(2)}</span>
                                        </div>
                                        <div className="flex items-center justify-between mt-1">
                                            <span className="text-white/40 text-[10px]">{a.transfers} SLAs in {a.hours_worked.toFixed(1)}h</span>
                                            <span className="text-red-400/70 text-[10px] font-mono">{(a.sla_hr - a.be).toFixed(2)} vs B/E</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Hourly SLA Bar Chart */}
                {!loading && hourlyDeltas.length > 1 && (
                    <div className="glass-card p-6 rounded-2xl border-white/5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-white uppercase tracking-widest">Hourly SLA Production</h3>
                            <span className="text-[10px] text-white/40 font-mono">{hourlyDeltas.length} hours</span>
                        </div>
                        <div className="flex items-end gap-1 h-[120px]">
                            {hourlyDeltas.map((h) => {
                                const maxDelta = Math.max(...hourlyDeltas.map((d) => d.sla_delta), 1);
                                const label = `${h.hour > 12 ? h.hour - 12 : h.hour}${h.hour >= 12 ? "PM" : "AM"}`;
                                return (
                                    <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full group">
                                        <div className="text-[9px] text-white/0 group-hover:text-white/60 transition-colors mb-1 tabular-nums">
                                            +{h.sla_delta}
                                        </div>
                                        <div
                                            className="w-full max-w-[28px] bg-indigo-500/50 hover:bg-indigo-400/70 rounded-t transition-colors"
                                            style={{ height: `${Math.max((h.sla_delta / maxDelta) * 100, 5)}%` }}
                                            title={`${label}: +${h.sla_delta} SLA (${h.sla_total} total, ${h.agent_count} agents)`}
                                        />
                                        <span className="text-[9px] text-white/30 mt-1">{label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}

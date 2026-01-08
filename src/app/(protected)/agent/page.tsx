"use client";
import React from "react";
import StatsCard from "@/components/dashboard/StatsCard";
import RecentCallsTable from "@/components/dashboard/RecentCallsTable";
import InteractiveChart from "@/components/dashboard/InteractiveChart";
import VoiceTrainingAgent from "@/components/dashboard/VoiceTrainingAgent";
import { getAgentStats } from "@/lib/mock-data";
import { useAuth } from "@/context/AuthContext";
import { CheckCircle, Clock, Trophy, TrendingUp, Phone, DollarSign, Gift, BarChart2 } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";

export default function AgentDashboard() {
    const { user, profile } = useAuth();
    const stats = getAgentStats();

    // Get dynamic time-of-day greeting
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 17) return "Good afternoon";
        return "Good evening";
    };

    // Get user's display name from profile (Supabase) or Firebase
    const userName = profile?.first_name || user?.displayName?.split(" ")[0] || "Agent";

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="flex flex-col gap-1">
                    <h2 className="text-3xl font-bold tracking-tight text-white group cursor-default">
                        Dashboard
                        <span className="inline-block ml-2 w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    </h2>
                    <p className="text-white/50 text-sm font-medium">
                        {getGreeting()}, <span className="text-white font-bold">{userName}</span>. Here's your performance summary.
                    </p>
                </div>

                {/* Stats Cards - Row 1 */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <StatsCard
                        index={0}
                        title="Compliance Score"
                        value={`${stats.complianceScore}%`}
                        trend={stats.complianceTrend as "up" | "down"}
                        trendValue="2%"
                        icon={<CheckCircle size={18} />}
                    />
                    <StatsCard
                        index={1}
                        title="Calls Analyzed"
                        value={stats.callsAnalyzed}
                        trend="up"
                        trendValue="12"
                        icon={<TrendingUp size={18} />}
                    />
                    <StatsCard
                        index={2}
                        title="Calls Made"
                        value={stats.callsMade}
                        trend="up"
                        trendValue="23"
                        icon={<Phone size={18} />}
                    />
                    <StatsCard
                        index={3}
                        title="Avg SLA / Hour"
                        value={`${stats.avgSlaByHour}%`}
                        trend="up"
                        trendValue="3%"
                        icon={<BarChart2 size={18} />}
                    />
                </div>

                {/* Stats Cards - Row 2 */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <StatsCard
                        index={4}
                        title={`Base Pay (${stats.payPeriod})`}
                        value={`$${stats.basePay.toLocaleString()}`}
                        trend="neutral"
                        trendValue="hourly"
                        icon={<DollarSign size={18} />}
                    />
                    <StatsCard
                        index={5}
                        title={`Bonus (${stats.payPeriod})`}
                        value={`$${stats.bonusPay.toLocaleString()}`}
                        trend="up"
                        trendValue="$85"
                        icon={<Gift size={18} />}
                    />
                    <StatsCard
                        index={6}
                        title="SLA Adherence"
                        value={`${stats.slaScore}%`}
                        trend={stats.slaTrend as "up" | "down"}
                        trendValue="4%"
                        icon={<Clock size={18} />}
                    />
                    <StatsCard
                        index={7}
                        title="Global Rank"
                        value={`#${stats.rank}`}
                        trend="neutral"
                        trendValue="0"
                        icon={<Trophy size={18} />}
                    />
                </div>

                {/* AI Voice Training Agent */}
                <VoiceTrainingAgent scenariosAvailable={3} />

                {/* Performance Chart */}
                <div className="glass-card p-6 rounded-2xl border-white/5">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-white uppercase tracking-widest">Performance History</h3>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">LAST 7 DAYS</span>
                        </div>
                    </div>
                    <InteractiveChart
                        data={[
                            { label: "01", value: 78 },
                            { label: "02", value: 82 },
                            { label: "03", value: 80 },
                            { label: "04", value: 85 },
                            { label: "05", value: 88 },
                            { label: "06", value: 91 },
                            { label: "07", value: 92 },
                        ]}
                        color="#38bdf8"
                        height={120}
                    />
                </div>

                {/* Recent Calls */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold tracking-tight text-white uppercase tracking-[0.1em]">Recent Analyzed Calls</h3>
                        <button className="text-[10pt] font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-widest">
                            View All Calls →
                        </button>
                    </div>
                    <RecentCallsTable />
                </div>
            </div>
        </DashboardLayout>
    );
}


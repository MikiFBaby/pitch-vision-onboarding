"use client";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import StatsCard from "@/components/dashboard/StatsCard";
import InteractiveChart from "@/components/dashboard/InteractiveChart";
import { Users, Target, Zap, TrendingUp } from "lucide-react";

export default function ManagerDashboard() {
    const { user } = useAuth();

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="flex flex-col gap-1">
                    <h2 className="text-3xl font-bold tracking-tight text-white group cursor-default">
                        Manager Overview
                        <span className="inline-block ml-2 w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    </h2>
                    <p className="text-white/50 text-sm font-medium">
                        Welcome back, <span className="text-white font-bold">{user?.displayName || "Manager"}</span>. Here is your team's current standing.
                    </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <StatsCard
                        index={0}
                        title="Team Compliance"
                        value="91.4%"
                        trend="up"
                        trendValue="1.2%"
                        icon={<Target size={18} />}
                    />
                    <StatsCard
                        index={1}
                        title="Active Agents"
                        value="24 / 28"
                        trend="neutral"
                        trendValue="0"
                        icon={<Users size={18} />}
                    />
                    <StatsCard
                        index={2}
                        title="Average SLA"
                        value="94%"
                        trend="up"
                        trendValue="3%"
                        icon={<Zap size={18} />}
                    />
                    <StatsCard
                        index={3}
                        title="Weekly Growth"
                        value="+12%"
                        trend="up"
                        trendValue="5%"
                        icon={<TrendingUp size={18} />}
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="glass-card p-6 rounded-2xl border-white/5">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-white uppercase tracking-wider">Team Performance Trend</h3>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded">+4.2%</span>
                            </div>
                        </div>
                        <InteractiveChart
                            data={[
                                { label: "Mon", value: 82 },
                                { label: "Tue", value: 85 },
                                { label: "Wed", value: 84 },
                                { label: "Thu", value: 89 },
                                { label: "Fri", value: 91 },
                                { label: "Sat", value: 92 },
                                { label: "Sun", value: 94 },
                            ]}
                            color="#6366f1"
                            height={150}
                        />
                    </div>

                    <div className="glass-card p-6 rounded-2xl border-white/5">
                        <h3 className="text-lg font-bold text-white mb-6 uppercase tracking-wider">Top Performing Teams</h3>
                        <div className="space-y-4">
                            {[
                                { name: "Team Alpha", score: "96%", status: "Exceeding" },
                                { name: "Team Beta", score: "92%", status: "Meeting" },
                                { name: "Team Gamma", score: "89%", status: "Meeting" },
                            ].map((team) => (
                                <div key={team.name} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-indigo-500/30 transition-all cursor-default group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-1.5 h-8 bg-indigo-500 rounded-full opacity-50 group-hover:opacity-100 transition-opacity" />
                                        <span className="font-semibold text-white/80">{team.name}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-white">{team.score}</div>
                                        <div className="text-[10px] text-white/40 uppercase font-bold tracking-tighter">{team.status}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}

"use client";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import StatsCard from "@/components/dashboard/StatsCard";
import InteractiveChart from "@/components/dashboard/InteractiveChart";
import { BarChart3, Globe, PieChart, TrendingUp, Building2, User as UserIcon } from "lucide-react";

export default function ExecutiveDashboard() {
    const { user } = useAuth();

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="flex flex-col gap-1">
                    <h2 className="text-3xl font-bold tracking-tight text-white group cursor-default">
                        Strategic Overview
                        <span className="inline-block ml-2 w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    </h2>
                    <p className="text-white/50 text-sm font-medium">
                        Good afternoon, <span className="text-white font-bold">{user?.displayName || "Executive"}</span>. Here is the enterprise-wide performance summary.
                    </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <StatsCard
                        index={0}
                        title="Annual Contract Value"
                        value="$2.4M"
                        trend="up"
                        trendValue="$400k"
                        icon={<Building2 size={18} />}
                    />
                    <StatsCard
                        index={1}
                        title="Market Share"
                        value="14.2%"
                        trend="up"
                        trendValue="0.5%"
                        icon={<Globe size={18} />}
                    />
                    <StatsCard
                        index={2}
                        title="Global Compliance"
                        value="96.8%"
                        trend="up"
                        trendValue="1.2%"
                        icon={<PieChart size={18} />}
                    />
                    <StatsCard
                        index={3}
                        title="Operational Efficiency"
                        value="88%"
                        trend="down"
                        trendValue="2%"
                        icon={<TrendingUp size={18} />}
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 glass-card p-8 rounded-2xl border-white/5">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-lg font-bold text-white uppercase tracking-widest">Enterprise Revenue Growth</h3>
                            <div className="flex gap-2">
                                <div className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-bold">ANNUAL</div>
                            </div>
                        </div>

                        <InteractiveChart
                            data={[
                                { label: "2019", value: 45 },
                                { label: "2020", value: 52 },
                                { label: "2021", value: 68 },
                                { label: "2022", value: 74 },
                                { label: "2023", value: 89 },
                                { label: "2024", value: 92 },
                                { label: "2025 (Proj)", value: 98 },
                            ]}
                            color="#10b981"
                            height={250}
                        />
                    </div>

                    <div className="glass-card p-8 rounded-2xl border-white/5 flex flex-col justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-white mb-2 uppercase tracking-widest">Strategy AI</h3>
                            <p className="text-white/30 text-xs mb-8">AI-generated recommendations for Q1 scaling.</p>

                            <div className="space-y-4">
                                <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 text-indigo-200/80 text-xs italic">
                                    "Focus on APAC expansion in the FinTech sector based on current compliance trends."
                                </div>
                                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-emerald-200/80 text-xs italic">
                                    "Reduce operational overhead in Europe by 8% through automated QA spot checks."
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 mt-8">
                            <button className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors uppercase text-[10px] tracking-[0.3em] shadow-lg flex items-center justify-center gap-2" onClick={() => window.location.href = '/admin/employees'}>
                                <UserIcon size={14} />
                                Manage Employees
                            </button>
                            <button className="w-full py-4 bg-indigo-500 text-white font-bold rounded-xl hover:bg-indigo-400 transition-colors uppercase text-[10px] tracking-[0.3em] shadow-[0_10px_30px_-10px_rgba(99,102,241,0.5)]">
                                Generate Full Report
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}

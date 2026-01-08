"use client";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import StatsCard from "@/components/dashboard/StatsCard";
import InteractiveChart from "@/components/dashboard/InteractiveChart";
import { Briefcase, Handshake, MessageSquare, ShieldCheck, Heart } from "lucide-react";

export default function PartnerDashboard() {
    const { user } = useAuth();

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="flex flex-col gap-1">
                    <h2 className="text-3xl font-bold tracking-tight text-white group cursor-default">
                        Partner Hub
                        <span className="inline-block ml-2 w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    </h2>
                    <p className="text-white/50 text-sm font-medium">
                        Welcome, <span className="text-white font-bold">{user?.displayName || "Partner"}</span>. Here are your active collaborations and performance.
                    </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <StatsCard
                        index={0}
                        title="Active Deals"
                        value="8"
                        trend="up"
                        trendValue="2"
                        icon={<Briefcase size={18} />}
                    />
                    <StatsCard
                        index={1}
                        title="Shared Revenue"
                        value="$142k"
                        trend="up"
                        trendValue="$12k"
                        icon={<Handshake size={18} />}
                    />
                    <StatsCard
                        index={2}
                        title="Team Adherence"
                        value="98.5%"
                        trend="neutral"
                        trendValue="0"
                        icon={<ShieldCheck size={18} />}
                    />
                    <StatsCard
                        index={3}
                        title="Partner Health"
                        value="Excellent"
                        icon={<Heart size={18} className="text-red-400" />}
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="glass-card p-6 rounded-2xl border-white/5">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-white uppercase tracking-widest">Active Collaboration</h3>
                            <button className="p-2 rounded-lg bg-white/5 text-white/40 hover:text-white transition-colors">
                                <MessageSquare size={18} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {[
                                { partner: "Global Tech Solutions", project: "Project Vision", progress: 85, status: "Nearly Done" },
                                { partner: "Acme Analytics", project: "Call-Insight 2.0", progress: 42, status: "Mid-phase" },
                                { partner: "Horizon Partners", project: "Compliance Shield", progress: 12, status: "Just Started" },
                            ].map((p) => (
                                <div key={p.partner} className="p-4 rounded-xl bg-white/5 border border-white/5 hover:border-indigo-500/20 transition-all">
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <div className="font-bold text-white text-sm">{p.partner}</div>
                                            <div className="text-[10px] text-white/40 uppercase font-bold tracking-tighter">{p.project}</div>
                                        </div>
                                        <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded uppercase">{p.status}</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500 opacity-60" style={{ width: `${p.progress}%` }}></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="glass-card p-6 rounded-2xl border-white/5">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-white uppercase tracking-widest">Collaboration Volume</h3>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">QUARTERLY</span>
                            </div>
                        </div>
                        <InteractiveChart
                            data={[
                                { label: "Q1", value: 45 },
                                { label: "Q2", value: 62 },
                                { label: "Q3", value: 58 },
                                { label: "Q4", value: 74 },
                            ]}
                            color="#f59e0b"
                            height={150}
                        />
                    </div>
                </div>

                <div className="glass-card p-8 rounded-2xl border-white/5 bg-gradient-to-br from-indigo-500/10 via-transparent to-purple-500/5 relative overflow-hidden">
                    <div className="relative z-10">
                        <h3 className="text-xl font-bold text-white mb-4">Partner Success Resources</h3>
                        <p className="text-white/40 text-sm mb-8 leading-relaxed">
                            Access the latest marketing assets, technical documentation, and partnership guidelines to help your team succeed.
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                            <button className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-left group">
                                <div className="text-white font-bold text-xs mb-1 group-hover:text-indigo-400 transition-colors">Digital Assets</div>
                                <div className="text-[10px] text-white/30 uppercase tracking-tighter">Logos & Banners</div>
                            </button>
                            <button className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-left group">
                                <div className="text-white font-bold text-xs mb-1 group-hover:text-indigo-400 transition-colors">API Keys</div>
                                <div className="text-[10px] text-white/30 uppercase tracking-tighter">Connection Hub</div>
                            </button>
                            <button className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-left group">
                                <div className="text-white font-bold text-xs mb-1 group-hover:text-indigo-400 transition-colors">Training Doc</div>
                                <div className="text-[10px] text-white/30 uppercase tracking-tighter">Onboarding Guide</div>
                            </button>
                            <button className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-left group">
                                <div className="text-white font-bold text-xs mb-1 group-hover:text-indigo-400 transition-colors">Support</div>
                                <div className="text-[10px] text-white/30 uppercase tracking-tighter">Priority Ticket</div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}

"use client";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import HRGaugeCluster from "@/components/hr/HRGaugeCluster";
import HRTrendsAnalytics from "@/components/hr/HRTrendsAnalytics";
import HRWorkforceOverview from "@/components/hr/HRWorkforceOverview";
import HRAttendanceWatchList from "@/components/hr/HRAttendanceWatchList";
import AttritionKnowledgeGraph from "@/components/hr/AttritionKnowledgeGraph";
import NetGrowthTrendChart from "@/components/hr/NetGrowthTrendChart";

import HRAbsenceHeatmap from "@/components/hr/HRAbsenceHeatmap";

export default function HRDashboard() {
    const { user, profile } = useAuth();
    const [dateRange, setDateRange] = useState<'daily' | 'weekly' | '30d' | '90d'>('daily');

    return (
        <DashboardLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-4xl xl:text-5xl font-bold tracking-tight text-white group cursor-default">
                            HR Dashboard
                            <span className="inline-block ml-2 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                        </h2>
                        <p className="text-white/50 text-base xl:text-lg font-medium">
                            Welcome back, <span className="text-white font-bold text-lg xl:text-xl capitalize">{profile?.name || user?.displayName || user?.email?.split('@')[0] || "HR Team"}</span>. Here's your workforce overview.
                        </p>
                    </div>

                    {/* Date Range Filter */}
                    <div className="bg-white/5 p-1 rounded-lg flex items-center border border-white/10">
                        {(['daily', 'weekly', '30d', '90d'] as const).map((range) => (
                            <button
                                key={range}
                                onClick={() => setDateRange(range)}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${dateRange === range
                                    ? 'bg-rose-500 text-white shadow-lg'
                                    : 'text-white/50 hover:text-white hover:bg-white/10'
                                    }`}
                            >
                                {range === 'daily' ? 'Today' : range === 'weekly' ? '7 Days' : range.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Section 1: Workforce Overview (from Agent Schedule) */}
                <HRWorkforceOverview dateRange={dateRange} />

                {/* Section 2: Key Metrics Gauges */}
                <HRGaugeCluster dateRange={dateRange} />

                {/* Section 3: Net Growth Trend (own date filter) */}
                <NetGrowthTrendChart />

                {/* Section 4: Absence Patterns + Attendance Watch List (Side by Side) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <HRAbsenceHeatmap />
                    <HRAttendanceWatchList />
                </div>

                {/* Section 5: Trends & Charts */}
                <HRTrendsAnalytics />

                {/* Section 7: Attrition Knowledge Graph */}
                <AttritionKnowledgeGraph />
            </div>
        </DashboardLayout>
    );
}

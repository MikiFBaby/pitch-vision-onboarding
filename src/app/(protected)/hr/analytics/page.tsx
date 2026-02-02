"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import HRAdvancedAnalytics from "@/components/hr/HRAdvancedAnalytics";

export default function HRAnalyticsPage() {
    return (
        <DashboardLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col gap-1">
                    <h2 className="text-4xl xl:text-5xl font-bold tracking-tight text-white group cursor-default">
                        HR Analytics
                        <span className="inline-block ml-2 w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    </h2>
                    <p className="text-white/50 text-base xl:text-lg font-medium">
                        Advanced workforce insights and retention intelligence.
                    </p>
                </div>

                {/* Analytics Dashboard */}
                <HRAdvancedAnalytics />
            </div>
        </DashboardLayout>
    );
}

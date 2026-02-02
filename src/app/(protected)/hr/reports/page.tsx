"use client";

import React from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import HRReports from "@/components/hr/HRReports";
import { FileBarChart } from "lucide-react";

export default function HRReportsPage() {
    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-xl">
                            <FileBarChart className="w-8 h-8 text-indigo-400" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-bold tracking-tight text-white">HR Reports</h1>
                            <p className="text-white/50 text-lg">
                                Executive workforce analytics with real-time data
                            </p>
                        </div>
                    </div>
                </div>

                <HRReports />
            </div>
        </DashboardLayout>
    );
}

"use client";

import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase-client";
import { motion } from "framer-motion";
import {
    FileText, Download, RefreshCw, Users, UserMinus, Calendar,
    TrendingUp, Building2, AlertTriangle, Clock, CheckCircle2, XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    calculateWeeklyHours,
    categorizeWorkforce,
    getWeekDateRange,
    getTodayISO,
    formatFullName,
    FULL_TIME_HOURS_THRESHOLD
} from "@/lib/hr-utils";

interface ReportData {
    weekLabel: string;
    startDate: string;
    endDate: string;
    hires: any[];
    terminations: any[];
    bookedOff: any[];
    unbookedOff: any[];
    activeAgents: any[];
    fullTimeAgents: any[];
    partTimeAgents: any[];
    campaigns: { name: string; count: number }[];
}

export default function HRReports() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [weekOffset, setWeekOffset] = useState(0);
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

    const weekRange = useMemo(() => getWeekDateRange(weekOffset), [weekOffset]);

    const fetchReportData = async () => {
        setRefreshing(true);
        try {
            const { startStr, endStr, weekLabel } = weekRange;

            // Fetch hires within date range
            const { data: hires } = await supabase
                .from("HR Hired")
                .select("*")
                .gte("Hire Date", startStr)
                .lte("Hire Date", endStr);

            // Fetch terminations within date range
            const { data: terminations } = await supabase
                .from("HR Fired")
                .select("*")
                .gte("Termination Date", startStr)
                .lte("Termination Date", endStr);

            // Fetch absences within date range
            const { data: bookedOff } = await supabase
                .from("Booked Days Off")
                .select("*")
                .gte("Date", startStr)
                .lte("Date", endStr);

            const { data: unbookedOff } = await supabase
                .from("Non Booked Days Off")
                .select("*")
                .gte("Date", startStr)
                .lte("Date", endStr);

            // Fetch active agents from schedule
            const { data: activeAgents } = await supabase
                .from("Agent Schedule")
                .select("*")
                .eq("is_active", true);

            // Categorize by full-time/part-time using 30-hour threshold
            const { fullTime, partTime } = categorizeWorkforce(activeAgents || []);

            // Get campaign breakdown from employee directory
            const { data: employees } = await supabase
                .from("employee_directory")
                .select("campaign");

            const campaignCounts: Record<string, number> = {};
            (employees || []).forEach((e) => {
                const camp = e.campaign || "Unknown";
                campaignCounts[camp] = (campaignCounts[camp] || 0) + 1;
            });

            const campaigns = Object.entries(campaignCounts)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);

            setReportData({
                weekLabel,
                startDate: startStr,
                endDate: endStr,
                hires: hires || [],
                terminations: terminations || [],
                bookedOff: bookedOff || [],
                unbookedOff: unbookedOff || [],
                activeAgents: activeAgents || [],
                fullTimeAgents: fullTime,
                partTimeAgents: partTime,
                campaigns
            });

            setLastUpdated(new Date());
        } catch (error) {
            console.error("Error fetching report data:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchReportData();

        // Real-time subscriptions
        const channels = [
            supabase.channel("reports_hires").on("postgres_changes", { event: "*", schema: "public", table: "HR Hired" }, fetchReportData).subscribe(),
            supabase.channel("reports_fires").on("postgres_changes", { event: "*", schema: "public", table: "HR Fired" }, fetchReportData).subscribe(),
            supabase.channel("reports_booked").on("postgres_changes", { event: "*", schema: "public", table: "Booked Days Off" }, fetchReportData).subscribe(),
            supabase.channel("reports_schedule").on("postgres_changes", { event: "*", schema: "public", table: "Agent Schedule" }, fetchReportData).subscribe(),
        ];

        return () => { channels.forEach(c => supabase.removeChannel(c)); };
    }, [weekOffset]);

    const exportCSV = (reportType: string) => {
        if (!reportData) return;
        let content = "";
        let filename = "";

        switch (reportType) {
            case "headcount":
                content = "Type,Name,Date,Campaign,Details\n";
                reportData.hires.forEach(h => {
                    content += `HIRE,"${h["Agent Name"]}",${h["Hire Date"]},"${h.Campaign || ""}","New Hire"\n`;
                });
                reportData.terminations.forEach(t => {
                    content += `TERM,"${t["Agent Name"]}",${t["Termination Date"]},"${t.Campaign || ""}","${t["Reason for Termination"] || ""}"\n`;
                });
                filename = `headcount_report_${reportData.startDate}_${reportData.endDate}.csv`;
                break;
            case "eligibility":
                content = "Name,Weekly Hours,Status,Commission Eligible\n";
                reportData.fullTimeAgents.forEach(a => {
                    content += `"${formatFullName(a["First Name"], a["Last Name"])}",${a.weeklyHours},Full-time,Yes\n`;
                });
                reportData.partTimeAgents.forEach(a => {
                    content += `"${formatFullName(a["First Name"], a["Last Name"])}",${a.weeklyHours},Part-time,No\n`;
                });
                filename = `workforce_eligibility_${reportData.startDate}.csv`;
                break;
            case "attendance":
                content = "Agent,Date,Type,Reason\n";
                reportData.bookedOff.forEach(b => {
                    content += `"${b["Agent Name"]}",${b.Date},Booked,"${b["Reason for the Day Off"] || ""}"\n`;
                });
                reportData.unbookedOff.forEach(u => {
                    content += `"${u["Agent Name"]}",${u.Date},Unplanned,"${u.Reason || ""}"\n`;
                });
                filename = `attendance_report_${reportData.startDate}_${reportData.endDate}.csv`;
                break;
        }

        const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) {
        return (
            <div className="space-y-6">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-48 bg-white/5 rounded-2xl animate-pulse" />
                ))}
            </div>
        );
    }

    if (!reportData) return null;

    const netChange = reportData.hires.length - reportData.terminations.length;
    const totalAbsences = reportData.bookedOff.length + reportData.unbookedOff.length;
    const fullTimePercent = reportData.activeAgents.length > 0
        ? Math.round((reportData.fullTimeAgents.length / reportData.activeAgents.length) * 100)
        : 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white">Management Reports</h2>
                    <p className="text-white/50">
                        Real-time workforce analytics • Updated {lastUpdated.toLocaleTimeString()}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white/5 rounded-lg border border-white/10">
                        <button
                            onClick={() => setWeekOffset(w => w - 1)}
                            className="px-3 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-l-lg transition"
                        >
                            ←
                        </button>
                        <span className="px-4 py-2 text-sm text-white font-medium">
                            {reportData.weekLabel}
                        </span>
                        <button
                            onClick={() => setWeekOffset(w => Math.min(0, w + 1))}
                            disabled={weekOffset >= 0}
                            className="px-3 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-r-lg transition disabled:opacity-30"
                        >
                            →
                        </button>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchReportData}
                        disabled={refreshing}
                        className="border-white/10 text-white hover:bg-white/10"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Report Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Weekly Headcount Summary */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 to-teal-500/10"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-500/20 rounded-lg">
                                <TrendingUp className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Weekly Headcount Summary</h3>
                                <p className="text-xs text-white/50">{reportData.weekLabel}</p>
                            </div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => exportCSV("headcount")} className="text-white/70 hover:text-white">
                            <Download className="w-4 h-4" />
                        </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-4 bg-white/5 rounded-xl">
                            <Users className="w-6 h-6 mx-auto mb-2 text-green-400" />
                            <div className="text-2xl font-bold text-green-400">{reportData.hires.length}</div>
                            <div className="text-xs text-white/50">New Hires</div>
                        </div>
                        <div className="text-center p-4 bg-white/5 rounded-xl">
                            <UserMinus className="w-6 h-6 mx-auto mb-2 text-red-400" />
                            <div className="text-2xl font-bold text-red-400">{reportData.terminations.length}</div>
                            <div className="text-xs text-white/50">Terminations</div>
                        </div>
                        <div className="text-center p-4 bg-white/5 rounded-xl">
                            <TrendingUp className="w-6 h-6 mx-auto mb-2 text-blue-400" />
                            <div className={`text-2xl font-bold ${netChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {netChange >= 0 ? "+" : ""}{netChange}
                            </div>
                            <div className="text-xs text-white/50">Net Change</div>
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/10">
                        <div className="flex justify-between text-sm">
                            <span className="text-white/70">Active Workforce</span>
                            <span className="text-white font-semibold">{reportData.activeAgents.length} agents</span>
                        </div>
                    </div>
                </motion.div>

                {/* Workforce Eligibility Report */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="glass-card p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/10 to-purple-500/10"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/20 rounded-lg">
                                <Clock className="w-5 h-5 text-indigo-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Workforce Eligibility</h3>
                                <p className="text-xs text-white/50">≥{FULL_TIME_HOURS_THRESHOLD}h/week = Commission Eligible</p>
                            </div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => exportCSV("eligibility")} className="text-white/70 hover:text-white">
                            <Download className="w-4 h-4" />
                        </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-4 bg-white/5 rounded-xl">
                            <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-emerald-400" />
                            <div className="text-2xl font-bold text-emerald-400">{reportData.fullTimeAgents.length}</div>
                            <div className="text-xs text-white/50">Full-time (≥30h)</div>
                            <div className="text-xs text-emerald-400/70 mt-1">Commission Eligible</div>
                        </div>
                        <div className="text-center p-4 bg-white/5 rounded-xl">
                            <XCircle className="w-6 h-6 mx-auto mb-2 text-amber-400" />
                            <div className="text-2xl font-bold text-amber-400">{reportData.partTimeAgents.length}</div>
                            <div className="text-xs text-white/50">Part-time (&lt;30h)</div>
                            <div className="text-xs text-amber-400/70 mt-1">Not Eligible</div>
                        </div>
                    </div>
                    {/* Distribution Bar */}
                    <div className="mt-4">
                        <div className="h-3 bg-white/10 rounded-full overflow-hidden flex">
                            <div
                                className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-full transition-all"
                                style={{ width: `${fullTimePercent}%` }}
                            />
                            <div
                                className="bg-gradient-to-r from-amber-500 to-amber-400 h-full transition-all"
                                style={{ width: `${100 - fullTimePercent}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-xs text-white/40 mt-1">
                            <span>{fullTimePercent}% Full-time</span>
                            <span>{100 - fullTimePercent}% Part-time</span>
                        </div>
                    </div>
                </motion.div>

                {/* Attendance Compliance Report */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="glass-card p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-amber-500/10 to-orange-500/10"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-500/20 rounded-lg">
                                <Calendar className="w-5 h-5 text-amber-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Attendance Compliance</h3>
                                <p className="text-xs text-white/50">{reportData.weekLabel}</p>
                            </div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => exportCSV("attendance")} className="text-white/70 hover:text-white">
                            <Download className="w-4 h-4" />
                        </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-4 bg-white/5 rounded-xl">
                            <Calendar className="w-6 h-6 mx-auto mb-2 text-blue-400" />
                            <div className="text-2xl font-bold text-blue-400">{reportData.bookedOff.length}</div>
                            <div className="text-xs text-white/50">Booked Off</div>
                        </div>
                        <div className="text-center p-4 bg-white/5 rounded-xl">
                            <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-400" />
                            <div className="text-2xl font-bold text-red-400">{reportData.unbookedOff.length}</div>
                            <div className="text-xs text-white/50">Unplanned</div>
                        </div>
                        <div className="text-center p-4 bg-white/5 rounded-xl">
                            <Users className="w-6 h-6 mx-auto mb-2 text-white/70" />
                            <div className="text-2xl font-bold text-white">{totalAbsences}</div>
                            <div className="text-xs text-white/50">Total Absences</div>
                        </div>
                    </div>
                </motion.div>

                {/* Campaign Staffing Snapshot */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="glass-card p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-rose-500/10 to-pink-500/10"
                >
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-rose-500/20 rounded-lg">
                            <Building2 className="w-5 h-5 text-rose-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Campaign Staffing</h3>
                            <p className="text-xs text-white/50">Active agents by campaign</p>
                        </div>
                    </div>
                    <div className="space-y-3 max-h-48 overflow-y-auto">
                        {reportData.campaigns.slice(0, 6).map((camp, i) => {
                            const totalEmployees = reportData.campaigns.reduce((a, c) => a + c.count, 0);
                            const percent = totalEmployees > 0 ? Math.round((camp.count / totalEmployees) * 100) : 0;
                            return (
                                <div key={i} className="flex items-center gap-3">
                                    <div className="flex-1">
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-white/80 truncate">{camp.name}</span>
                                            <span className="text-white font-semibold">{camp.count}</span>
                                        </div>
                                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-rose-500 to-pink-500"
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}

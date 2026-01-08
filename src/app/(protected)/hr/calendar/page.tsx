"use client";

import React, { useState } from 'react';
import DashboardLayout from "@/components/layout/DashboardLayout";
import HRCalendar from "@/components/hr/HRCalendar";
import { Button } from "@/components/ui/button";
import { Download, FileText, Calendar as CalendarIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';

export default function HRCalendarPage() {
    const [downloading, setDownloading] = useState(false);

    const generateReport = async () => {
        setDownloading(true);
        try {
            // Fetch relevant data
            const { data: hires } = await supabase.from('HR Hired').select('*').limit(100);
            const { data: fires } = await supabase.from('HR Fired').select('*').limit(100);

            // Simple CSV generation
            const hireRows = (hires || []).map(h => `HIRE,${h['Agent Name']},${h['Hire Date']},${h['Campaign']}`);
            const fireRows = (fires || []).map(f => `TERM,${f['Agent Name']},${f['Termination Date']},${f['Reason for Termination']}`);

            const csvContent = "Type,Name,Date,Details\n" + [...hireRows, ...fireRows].join("\n");

            // Trigger download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `hr_report_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error("Export failed:", error);
            alert("Failed to generate report.");
        } finally {
            setDownloading(false);
        }
    };

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-4xl font-bold tracking-tight text-white">HR Calendar & Reporting</h2>
                        <p className="text-white/50 text-lg">Manage schedules and export workforce analytics.</p>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" className="border-white/10 text-white hover:bg-white/10">
                            <CalendarIcon className="mr-2 h-4 w-4" /> Sync Calendar
                        </Button>
                        <Button onClick={generateReport} disabled={downloading}>
                            {downloading ? (
                                <span className="animate-spin mr-2">⏳</span>
                            ) : (
                                <Download className="mr-2 h-4 w-4" />
                            )}
                            Export Weekly Report
                        </Button>
                    </div>
                </div>

                {/* Calendar Component */}
                <HRCalendar />

                {/* Report Preview Section (Optional) */}
                <div className="glass-card p-6 rounded-2xl border-white/5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                            <FileText className="text-blue-400 w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Automated Reports</h3>
                            <p className="text-sm text-white/50">Weekly summaries are auto-generated every Friday.</p>
                        </div>
                    </div>
                    <div className="bg-black/20 rounded-lg p-4 border border-white/5">
                        <div className="text-sm text-white/70 font-mono">
                            Latest Report: Week 42 (Oct 16 - Oct 22)<br />
                            - New Hires: 3<br />
                            - Terminations: 1<br />
                            - Interviews Scheduled: 8
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}

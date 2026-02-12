"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    BarChart, Bar, Legend, Cell, Area, AreaChart, ReferenceLine
} from "recharts";
import { supabase } from "@/lib/supabase-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { TrendingUp, Activity } from "lucide-react";
import { deduplicateBookedOff, deduplicateUnplannedOff } from '@/lib/hr-utils';

type TrendRange = '7d' | '30d' | '60d' | '90d';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function HRTrendsAnalytics() {
    const [loading, setLoading] = useState(true);
    const [absenceTrendData, setAbsenceTrendData] = useState<any[]>([]);
    const [reasonData, setReasonData] = useState<any[]>([]);
    const [attendanceData, setAttendanceData] = useState<any[]>([]);
    const [dateRange, setDateRange] = useState<TrendRange>('30d');

    const getStartDate = useCallback(() => {
        const now = new Date();
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);

        switch (dateRange) {
            case '7d': start.setDate(now.getDate() - 7); break;
            case '30d': start.setDate(now.getDate() - 30); break;
            case '60d': start.setDate(now.getDate() - 60); break;
            case '90d': start.setDate(now.getDate() - 90); break;
        }
        return start;
    }, [dateRange]);

    const formatDateKey = (date: Date) => {
        return date.toLocaleDateString('en-CA');
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        const startDate = getStartDate();
        const startIso = formatDateKey(startDate);

        try {
            // Fetch absences
            const [bookedRes, nonBookedRes, employeeRes] = await Promise.all([
                supabase.from('Booked Days Off').select('"Agent Name", Date').gte('Date', startIso).order('Date', { ascending: true }),
                supabase.from('Non Booked Days Off').select('"Agent Name", Date, Reason').gte('Date', startIso).order('Date', { ascending: true }),
                supabase.from('employee_directory').select('first_name, last_name').eq('employee_status', 'Active').eq('role', 'Agent'),
            ]);

            const booked = deduplicateBookedOff(bookedRes.data || []);
            const nonBooked = deduplicateUnplannedOff(nonBookedRes.data || []);

            // Fetch all schedule pages
            let allSchedules: any[] = [];
            let from = 0;
            const PAGE_SIZE = 1000;
            while (true) {
                const { data: page } = await supabase.from('Agent Schedule').select('*').range(from, from + PAGE_SIZE - 1);
                if (!page || page.length === 0) break;
                allSchedules = allSchedules.concat(page);
                if (page.length < PAGE_SIZE) break;
                from += PAGE_SIZE;
            }

            // Build set of active employee keys
            const activeKeys = new Set(
                (employeeRes.data || []).map(e =>
                    `${(e.first_name || '').trim().toLowerCase()} ${(e.last_name || '').trim().toLowerCase()}`
                )
            );

            // Pre-compute scheduled counts per day of week
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const scheduledPerDay: Record<string, number> = {};

            for (const day of dayNames) {
                const seen = new Set<string>();
                let count = 0;
                allSchedules.forEach(agent => {
                    const key = `${(agent['First Name'] || '').trim().toLowerCase()} ${(agent['Last Name'] || '').trim().toLowerCase()}`;
                    const shift = agent[day];
                    if (activeKeys.has(key) && !seen.has(key) && shift && shift.trim() !== '' && shift.trim().toLowerCase() !== 'off') {
                        seen.add(key);
                        count++;
                    }
                });
                scheduledPerDay[day] = count;
            }

            processAbsenceData(booked, nonBooked, startDate);
            processReasonData(nonBooked);
            processAttendanceData(booked, nonBooked, startDate, scheduledPerDay, dayNames);

        } catch (error) {
            console.error("Error fetching analytics:", error);
        } finally {
            setLoading(false);
        }
    }, [getStartDate]);

    useEffect(() => {
        fetchData();

        const channels = [
            supabase.channel('hr_trends_booked').on('postgres_changes', { event: '*', schema: 'public', table: 'Booked Days Off' }, fetchData).subscribe(),
            supabase.channel('hr_trends_nonbooked').on('postgres_changes', { event: '*', schema: 'public', table: 'Non Booked Days Off' }, fetchData).subscribe(),
        ];

        return () => {
            channels.forEach(channel => supabase.removeChannel(channel));
        };
    }, [fetchData]);

    const processAbsenceData = (booked: any[], nonBooked: any[], startDate: Date) => {
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);

        const data = [];
        let loopDate = new Date(startDate);

        while (loopDate <= endDate) {
            const dateStr = formatDateKey(loopDate);
            const bookedCount = booked.filter(b => b.Date === dateStr).length;
            const nonBookedCount = nonBooked.filter(nb => nb.Date === dateStr).length;

            data.push({
                date: loopDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                booked: bookedCount,
                unplanned: nonBookedCount
            });
            loopDate.setDate(loopDate.getDate() + 1);
        }

        setAbsenceTrendData(data);
    };

    const processReasonData = (nonBooked: any[]) => {
        const counts: Record<string, number> = {};
        nonBooked.forEach(item => {
            const rawReason = (item.Reason || '').trim();
            if (!rawReason) return;
            const reason = rawReason.charAt(0).toUpperCase() + rawReason.slice(1).toLowerCase();
            counts[reason] = (counts[reason] || 0) + 1;
        });

        const data = Object.entries(counts).map(([name, value]) => ({ name, value }));
        data.sort((a, b) => b.value - a.value);
        setReasonData(data.slice(0, 10));
    };

    const processAttendanceData = (
        booked: any[], nonBooked: any[], startDate: Date,
        scheduledPerDay: Record<string, number>, dayNames: string[]
    ) => {
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);

        const data: any[] = [];
        let loopDate = new Date(startDate);

        while (loopDate <= endDate) {
            const jsDay = loopDate.getDay();
            // Skip weekends
            if (jsDay !== 0 && jsDay !== 6) {
                const dateStr = formatDateKey(loopDate);
                const dayName = dayNames[jsDay];
                const scheduled = scheduledPerDay[dayName] || 0;

                // Count unique absent agents for this date
                const bookedNames = new Set(
                    booked.filter(b => b.Date === dateStr).map(b => (b['Agent Name'] || '').trim().toLowerCase())
                );
                const unplannedNames = new Set<string>();
                nonBooked.filter(nb => nb.Date === dateStr).forEach(nb => {
                    const name = (nb['Agent Name'] || '').trim().toLowerCase();
                    if (!bookedNames.has(name)) unplannedNames.add(name);
                });
                const totalAbsent = bookedNames.size + unplannedNames.size;

                const rate = scheduled > 0
                    ? Math.round(((scheduled - totalAbsent) / scheduled) * 100)
                    : 100;

                data.push({
                    date: loopDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    rate: Math.max(0, Math.min(100, rate)),
                    absent: totalAbsent,
                    scheduled,
                });
            }
            loopDate.setDate(loopDate.getDate() + 1);
        }

        setAttendanceData(data);
    };

    if (loading) {
        return <div className="space-y-6">
            <Skeleton className="h-[350px] w-full rounded-2xl" />
            <Skeleton className="h-[350px] w-full rounded-2xl" />
            <Skeleton className="h-[350px] w-full rounded-2xl" />
        </div>;
    }

    return (
        <div className="space-y-6">
            {/* Absence Trends */}
            <Card className="bg-white/5 border-white/10 text-white overflow-hidden">
                <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <CardTitle className="text-lg font-medium flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-indigo-400" />
                            Absence Trends
                        </CardTitle>
                        {/* Date Range Filter */}
                        <div className="bg-white/5 p-0.5 rounded-lg flex items-center border border-white/10">
                            {(['7d', '30d', '60d', '90d'] as TrendRange[]).map((range) => (
                                <button
                                    key={range}
                                    onClick={() => setDateRange(range)}
                                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                                        dateRange === range
                                            ? 'bg-indigo-500 text-white shadow-lg'
                                            : 'text-white/50 hover:text-white hover:bg-white/10'
                                    }`}
                                >
                                    {range.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={absenceTrendData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                <XAxis dataKey="date" stroke="#aaa" fontSize={13} tickLine={false} axisLine={false} />
                                <YAxis stroke="#aaa" fontSize={13} tickLine={false} axisLine={false} />
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: '#1a1a1a', border: 'none', borderRadius: '8px' }}
                                    labelStyle={{ color: '#888' }}
                                />
                                <Legend />
                                <Line type="monotone" dataKey="booked" name="Booked" stroke="#6366f1" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                                <Line type="monotone" dataKey="unplanned" name="Unplanned" stroke="#f43f5e" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Attendance Rate Timeline */}
            <Card className="bg-white/5 border-white/10 text-white overflow-hidden">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-medium flex items-center gap-2">
                        <Activity className="w-5 h-5 text-emerald-400" />
                        Attendance Rate Timeline
                    </CardTitle>
                    <div className="mt-2 px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/10">
                        <p className="text-sm text-white/90 leading-relaxed">
                            <strong className="text-white">How to read this chart:</strong> Each point shows what percentage of scheduled agents actually showed up that day. For example, if 400 agents were scheduled and 20 were absent, the rate is <span className="text-emerald-400 font-medium">95%</span>. Higher is better. The dashed yellow line marks the <span className="text-amber-400 font-medium">90% target</span>.
                        </p>
                        <p className="text-xs text-white/70 mt-1.5">
                            Data sources: Agent Schedule (who&apos;s scheduled) + Booked Days Off + Non Booked Days Off (who was absent)
                        </p>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="h-[280px] w-full">
                        {attendanceData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={attendanceData}>
                                    <defs>
                                        <linearGradient id="attendanceGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                    <XAxis dataKey="date" stroke="#aaa" fontSize={13} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#aaa" fontSize={13} tickLine={false} axisLine={false} domain={[60, 100]} tickFormatter={(v) => `${v}%`} />
                                    <RechartsTooltip
                                        contentStyle={{ backgroundColor: '#1a1a1a', border: 'none', borderRadius: '8px' }}
                                        labelStyle={{ color: '#888' }}
                                        formatter={(value: number, name: string) => {
                                            if (name === 'Attendance') return [`${value}%`, name];
                                            return [value, name];
                                        }}
                                    />
                                    <ReferenceLine y={90} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.6} />
                                    <Legend />
                                    <Area
                                        type="monotone"
                                        dataKey="rate"
                                        name="Attendance"
                                        stroke="#10b981"
                                        strokeWidth={3}
                                        fill="url(#attendanceGradient)"
                                        dot={false}
                                        activeDot={{ r: 6, fill: '#10b981' }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-white/60">
                                No attendance data for this period
                            </div>
                        )}
                    </div>
                    {attendanceData.length > 0 && (
                        <div className="flex items-center justify-between mt-3 text-sm text-white/90 px-1">
                            <span>Avg: <strong className="text-white">{Math.round(attendanceData.reduce((s: number, d: any) => s + d.rate, 0) / attendanceData.length)}%</strong></span>
                            <span>Weekdays only &bull; Dashed line = 90% target</span>
                            <span>Low: <strong className="text-white">{Math.min(...attendanceData.map((d: any) => d.rate))}%</strong> &bull; High: <strong className="text-white">{Math.max(...attendanceData.map((d: any) => d.rate))}%</strong></span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Absence Reasons Bar Chart */}
            <Card className="bg-white/5 border-white/10 text-white">
                <CardHeader>
                    <CardTitle className="text-lg font-medium">Unplanned Absence Reasons</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[350px] w-full">
                        {reasonData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={reasonData} layout="vertical" margin={{ left: 20, top: 10, right: 20, bottom: 10 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                                    <XAxis type="number" stroke="#aaa" fontSize={13} tickLine={false} axisLine={false} />
                                    <YAxis dataKey="name" type="category" stroke="#d4d4d8" fontSize={14} tickLine={false} axisLine={false} width={140} />
                                    <RechartsTooltip
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        contentStyle={{ backgroundColor: '#1a1a1a', border: 'none', borderRadius: '8px' }}
                                    />
                                    <Bar dataKey="value" name="Occurrences" radius={[0, 4, 4, 0]}>
                                        {reasonData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-white/60">
                                No data available for this period
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

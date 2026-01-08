"use client";

import React, { useEffect, useState } from "react";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    LineChart, Line, BarChart, Bar, Legend, Cell
} from "recharts";
import { supabase } from "@/lib/supabase-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

interface HRTrendsAnalyticsProps {
    dateRange: 'daily' | 'weekly' | '30d' | '90d';
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function HRTrendsAnalytics({ dateRange }: HRTrendsAnalyticsProps) {
    const [loading, setLoading] = useState(true);
    const [headcountData, setHeadcountData] = useState<any[]>([]);
    const [absenceTrendData, setAbsenceTrendData] = useState<any[]>([]);
    const [reasonData, setReasonData] = useState<any[]>([]);

    // const supabase = createClient(); // Use the imported singleton instead

    useEffect(() => {
        fetchData();

        // Realtime subscriptions
        const channels = [
            supabase.channel('hr_trends_hired').on('postgres_changes', { event: '*', schema: 'public', table: 'HR Hired' }, fetchData).subscribe(),
            supabase.channel('hr_trends_fired').on('postgres_changes', { event: '*', schema: 'public', table: 'HR Fired' }, fetchData).subscribe(),
            supabase.channel('hr_trends_booked').on('postgres_changes', { event: '*', schema: 'public', table: 'Booked Days Off' }, fetchData).subscribe(),
            supabase.channel('hr_trends_nonbooked').on('postgres_changes', { event: '*', schema: 'public', table: 'Non Booked Days Off' }, fetchData).subscribe(),
        ];

        return () => {
            channels.forEach(channel => supabase.removeChannel(channel));
        };
    }, [dateRange]);

    const getStartDate = () => {
        const now = new Date();
        const start = new Date(now);
        // Reset to start of day to avoid timezone/time shift issues
        start.setHours(0, 0, 0, 0);

        switch (dateRange) {
            // For 'daily', we want to show a bit of context, maybe just today and yesterday? 
            // Or if it means "Trend for the day", maybe hourly? 
            // For consistency with other views, let's show last 7 days even for 'daily' selection or strictly 24h
            // But user selected "Daily" (which commonly means "Today" in this app's context).
            // Let's stick to the previous logic but aligned to midnight.
            case 'daily': start.setDate(now.getDate() - 6); break; // Show last week for context on daily view
            case 'weekly': start.setDate(now.getDate() - 7); break;
            case '30d': start.setDate(now.getDate() - 30); break;
            case '90d': start.setDate(now.getDate() - 90); break;
        }
        return start;
    };

    const formatDateKey = (date: Date) => {
        // Returns YYYY-MM-DD in local time
        return date.toLocaleDateString('en-CA');
    };

    const fetchData = async () => {
        setLoading(true);
        const startDate = getStartDate();
        const startIso = formatDateKey(startDate); // Use local date string comparison

        try {
            // 1. Headcount Data
            const { data: allHires } = await supabase.from('HR Hired').select('created_at');
            const { data: allFires } = await supabase.from('HR Fired').select('created_at');

            // 2. Absence Data
            const { data: booked } = await supabase
                .from('Booked Days Off')
                .select('Date')
                .gte('Date', startIso)
                .order('Date', { ascending: true });

            const { data: nonBooked } = await supabase
                .from('Non Booked Days Off')
                .select('Date, Reason')
                .gte('Date', startIso)
                .order('Date', { ascending: true });

            processHeadcountData(allHires || [], allFires || [], startDate);
            processAbsenceData(booked || [], nonBooked || [], startDate);
            processReasonData(nonBooked || []);

        } catch (error) {
            console.error("Error fetching analytics:", error);
        } finally {
            setLoading(false);
        }
    };

    const processHeadcountData = (hires: any[], fires: any[], startDate: Date) => {
        const events = [
            ...hires.map(h => ({ date: h.created_at?.split('T')[0], change: 1 })),
            ...fires.map(f => ({ date: f.created_at?.split('T')[0], change: -1 }))
        ].sort((a, b) => (a.date > b.date ? 1 : -1));

        const chartData = [];
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999); // Include all of today

        let loopDate = new Date(startDate);

        // Calculate baseline count before start date
        let runningCount = 0;
        const startStr = formatDateKey(startDate);
        events.filter(e => e.date < startStr).forEach(e => runningCount += e.change);

        while (loopDate <= endDate) {
            const dateStr = formatDateKey(loopDate);
            // Add changes for THIS day
            const daysEvents = events.filter(e => e.date === dateStr);
            daysEvents.forEach(e => runningCount += e.change);

            chartData.push({
                date: loopDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                headcount: runningCount
            });
            loopDate.setDate(loopDate.getDate() + 1);
        }

        setHeadcountData(chartData);
    };

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
            const reason = item.Reason || "Unspecified";
            counts[reason] = (counts[reason] || 0) + 1;
        });

        const data = Object.entries(counts).map(([name, value]) => ({ name, value }));
        // Sort by value descending
        data.sort((a, b) => b.value - a.value);
        setReasonData(data);
    };

    if (loading) {
        return <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-[300px] w-full rounded-2xl" />
            <Skeleton className="h-[300px] w-full rounded-2xl" />
        </div>;
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Absence Trends */}
                <Card className="bg-white/5 border-white/10 text-white overflow-hidden">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium">Absence Trends</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={absenceTrendData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                    <XAxis dataKey="date" stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
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

                {/* Headcount Trend */}
                <Card className="bg-white/5 border-white/10 text-white overflow-hidden">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium">Headcount Growth</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={headcountData}>
                                    <defs>
                                        <linearGradient id="colorHeadcount" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                    <XAxis dataKey="date" stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#666" fontSize={12} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                                    <RechartsTooltip
                                        contentStyle={{ backgroundColor: '#1a1a1a', border: 'none', borderRadius: '8px' }}
                                        labelStyle={{ color: '#888' }}
                                    />
                                    <Area type="monotone" dataKey="headcount" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorHeadcount)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Absence Reasons Bar Chart */}
            <Card className="bg-white/5 border-white/10 text-white">
                <CardHeader>
                    <CardTitle className="text-lg font-medium">Unplanned Absence Reasons</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[250px] w-full">
                        {reasonData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={reasonData} layout="vertical" margin={{ left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                                    <XAxis type="number" stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis dataKey="name" type="category" stroke="#888" fontSize={12} tickLine={false} axisLine={false} width={100} />
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
                            <div className="h-full flex items-center justify-center text-white/30">
                                No data available for this period
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

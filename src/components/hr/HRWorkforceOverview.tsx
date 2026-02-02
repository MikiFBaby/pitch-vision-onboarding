"use client";

import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Clock, CalendarCheck, AlertTriangle } from "lucide-react";
import { calculateWeeklyHours, FULL_TIME_HOURS_THRESHOLD } from "@/lib/hr-utils";

interface HRWorkforceOverviewProps {
    dateRange: 'daily' | 'weekly' | '30d' | '90d';
}

interface ShiftData {
    firstName: string;
    lastName: string;
    shiftStart: string | null;
    shiftEnd: string | null;
    isWorking: boolean;
}

export default function HRWorkforceOverview({ dateRange }: HRWorkforceOverviewProps) {
    const [loading, setLoading] = useState(true);
    const [scheduleData, setScheduleData] = useState<any[]>([]);
    const [absenceCount, setAbsenceCount] = useState(0);
    const [todayStats, setTodayStats] = useState({
        totalScheduled: 0,
        fullTime: 0,
        partTime: 0,
        absent: 0,
        netAvailable: 0
    });

    const dayOfWeek = useMemo(() => {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[new Date().getDay()];
    }, []);

    useEffect(() => {
        fetchData();

        const channels = [
            supabase.channel('workforce_schedule').on('postgres_changes', { event: '*', schema: 'public', table: 'Agent Schedule' }, fetchData).subscribe(),
            supabase.channel('workforce_booked').on('postgres_changes', { event: '*', schema: 'public', table: 'Booked Days Off' }, fetchData).subscribe(),
            supabase.channel('workforce_nonbooked').on('postgres_changes', { event: '*', schema: 'public', table: 'Non Booked Days Off' }, fetchData).subscribe(),
        ];

        return () => { channels.forEach(c => supabase.removeChannel(c)); };
    }, [dateRange]);

    const fetchData = async () => {
        setLoading(true);

        try {
            // Get today's schedule - ONLY ACTIVE employees (matched against employee directory)
            const { data: schedules } = await supabase
                .from('Agent Schedule')
                .select('*')
                .eq('is_active', true);

            // Get today's absences - use ISO date format for DATE column comparison
            const todayISO = new Date().toISOString().split('T')[0]; // "2026-01-29" format

            const { data: bookedOff, error: bookedError } = await supabase
                .from('Booked Days Off')
                .select('"Agent Name"')
                .eq('Date', todayISO);

            const { data: unplannedOff, error: unplannedError } = await supabase
                .from('Non Booked Days Off')
                .select('"Agent Name"')
                .eq('Date', todayISO);

            // Debug logging
            if (bookedError) console.error('Booked Off query error:', bookedError);
            if (unplannedError) console.error('Unplanned Off query error:', unplannedError);

            const absentAgents = new Set([
                ...(bookedOff || []).map(b => b['Agent Name']),
                ...(unplannedOff || []).map(u => u['Agent Name'])
            ]);

            // Parse schedules for today - COUNT UNIQUE AGENTS ONLY
            const seenAgents = new Set<string>();
            let totalScheduled = 0;
            let fullTime = 0;
            let partTime = 0;

            schedules?.forEach(agent => {
                const agentKey = `${agent['First Name']?.trim().toLowerCase()} ${agent['Last Name']?.trim().toLowerCase()}`;
                const todayShift = agent[dayOfWeek];

                // Only count each agent once (skip duplicates)
                if (!seenAgents.has(agentKey) && todayShift && todayShift.trim() !== '' && todayShift.toLowerCase() !== 'off') {
                    seenAgents.add(agentKey);
                    totalScheduled++;
                    // Use accurate 30-hour threshold for full-time classification
                    const weeklyHours = calculateWeeklyHours(agent);
                    if (weeklyHours >= FULL_TIME_HOURS_THRESHOLD) {
                        fullTime++;
                    } else {
                        partTime++;
                    }
                }
            });

            const absent = absentAgents.size;
            const netAvailable = Math.max(0, totalScheduled - absent);

            setTodayStats({ totalScheduled, fullTime, partTime, absent, netAvailable });
            setAbsenceCount(absent);
            setScheduleData(schedules || []);

        } catch (error) {
            console.error("Error fetching workforce data:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <Skeleton className="h-[140px] w-full rounded-2xl" />;
    }

    const attendanceRate = todayStats.totalScheduled > 0
        ? Math.round((todayStats.netAvailable / todayStats.totalScheduled) * 100)
        : 100;

    return (
        <Card className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border-white/10 text-white overflow-hidden">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-400" />
                    Today's Workforce
                    <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full ml-2">{dayOfWeek}</span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Total Scheduled */}
                    <div className="bg-white/5 rounded-xl p-4 text-center">
                        <CalendarCheck className="w-6 h-6 mx-auto mb-2 text-indigo-400" />
                        <div className="text-3xl font-bold">{todayStats.totalScheduled}</div>
                        <div className="text-xs text-white/50 mt-1">Scheduled</div>
                    </div>

                    {/* Net Available */}
                    <div className="bg-white/5 rounded-xl p-4 text-center">
                        <Users className="w-6 h-6 mx-auto mb-2 text-green-400" />
                        <div className="text-3xl font-bold text-green-400">{todayStats.netAvailable}</div>
                        <div className="text-xs text-white/50 mt-1">Available</div>
                    </div>

                    {/* Absent */}
                    <div className="bg-white/5 rounded-xl p-4 text-center">
                        <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-amber-400" />
                        <div className="text-3xl font-bold text-amber-400">{todayStats.absent}</div>
                        <div className="text-xs text-white/50 mt-1">Absent</div>
                    </div>

                    {/* Attendance Rate */}
                    <div className="bg-white/5 rounded-xl p-4 text-center">
                        <Clock className="w-6 h-6 mx-auto mb-2 text-blue-400" />
                        <div className={`text-3xl font-bold ${attendanceRate >= 90 ? 'text-green-400' : attendanceRate >= 75 ? 'text-amber-400' : 'text-red-400'}`}>
                            {attendanceRate}%
                        </div>
                        <div className="text-xs text-white/50 mt-1">Attendance</div>
                    </div>
                </div>

                {/* Shift Distribution Mini-Bar */}
                <div className="mt-4 h-2 bg-white/10 rounded-full overflow-hidden flex">
                    <div
                        className="bg-indigo-500 h-full transition-all"
                        style={{ width: `${(todayStats.fullTime / Math.max(1, todayStats.totalScheduled)) * 100}%` }}
                        title={`Full-time: ${todayStats.fullTime}`}
                    />
                    <div
                        className="bg-purple-500 h-full transition-all"
                        style={{ width: `${(todayStats.partTime / Math.max(1, todayStats.totalScheduled)) * 100}%` }}
                        title={`Part-time: ${todayStats.partTime}`}
                    />
                </div>
                <div className="flex justify-between text-xs text-white/40 mt-1">
                    <span>Full-time: {todayStats.fullTime}</span>
                    <span>Part-time: {todayStats.partTime}</span>
                </div>
            </CardContent>
        </Card>
    );
}

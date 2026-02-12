"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Clock, CalendarCheck, AlertTriangle } from "lucide-react";
import { deduplicateBookedOff, deduplicateUnplannedOff } from '@/lib/hr-utils';

interface HRWorkforceOverviewProps {
    dateRange: 'daily' | 'weekly' | '30d' | '90d';
}

/** Compute the effective working day + ISO date. Weekends roll back to last Friday. */
function getEffectiveWorkDay() {
    const now = new Date();
    const jsDay = now.getDay(); // 0=Sun, 6=Sat
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const isWeekend = jsDay === 0 || jsDay === 6;

    const target = new Date(now);
    if (jsDay === 0) target.setDate(target.getDate() - 2); // Sun → Fri
    if (jsDay === 6) target.setDate(target.getDate() - 1); // Sat → Fri

    const dayOfWeek = isWeekend ? 'Friday' : days[jsDay];
    const effectiveDate = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;

    return { dayOfWeek, effectiveDate, isWeekend };
}

export default function HRWorkforceOverview({ dateRange }: HRWorkforceOverviewProps) {
    const [loading, setLoading] = useState(true);
    const [todayStats, setTodayStats] = useState({
        totalActive: 0,
        totalScheduled: 0,
        absent: 0,
        bookedOff: 0,
        unplannedOff: 0,
    });

    const { dayOfWeek, effectiveDate, isWeekend } = useMemo(() => getEffectiveWorkDay(), []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const { dayOfWeek: day, effectiveDate: date } = getEffectiveWorkDay();

        try {
            // 1. Active agents from employee_directory (for the Active Agents card)
            const { data: employees, error: empErr } = await supabase
                .from('employee_directory')
                .select('first_name, last_name')
                .eq('employee_status', 'Active')
                .eq('role', 'Agent');

            if (empErr) console.error('employee_directory error:', empErr);

            const activeEmployeeKeys = new Set(
                (employees || []).map(e =>
                    `${(e.first_name || '').trim().toLowerCase()} ${(e.last_name || '').trim().toLowerCase()}`
                )
            );

            const totalActive = (employees || []).length;

            // 2. All schedules (paginated — Supabase caps at 1000/request)
            let allSchedules: any[] = [];
            let from = 0;
            const PAGE_SIZE = 1000;
            while (true) {
                const { data: page } = await supabase
                    .from('Agent Schedule')
                    .select('*')
                    .range(from, from + PAGE_SIZE - 1);
                if (!page || page.length === 0) break;
                allSchedules = allSchedules.concat(page);
                if (page.length < PAGE_SIZE) break;
                from += PAGE_SIZE;
            }

            // 3. Absences for the effective working date (Google Sheets = source of truth)
            const [bookedRes, unplannedRes] = await Promise.all([
                supabase.from('Booked Days Off').select('*').eq('Date', date),
                supabase.from('Non Booked Days Off').select('*').eq('Date', date),
            ]);

            if (bookedRes.error) console.error('Booked Days Off error:', bookedRes.error);
            if (unplannedRes.error) console.error('Non Booked Days Off error:', unplannedRes.error);

            const bookedOff = deduplicateBookedOff(bookedRes.data || []);
            const unplannedOff = deduplicateUnplannedOff(unplannedRes.data || []);

            const normalize = (name: string) => (name || '').trim().toLowerCase();

            // 4. Scheduled count: Active employees with a shift today
            const seenAgents = new Set<string>();
            let totalScheduled = 0;

            allSchedules.forEach(agent => {
                const agentKey = `${(agent['First Name'] || '').trim().toLowerCase()} ${(agent['Last Name'] || '').trim().toLowerCase()}`;
                const shift = agent[day];

                if (
                    activeEmployeeKeys.has(agentKey) &&
                    !seenAgents.has(agentKey) &&
                    shift && shift.trim() !== '' && shift.trim().toLowerCase() !== 'off'
                ) {
                    seenAgents.add(agentKey);
                    totalScheduled++;
                }
            });

            // 5. Absences: Google Sheets = source of truth. Count ALL unique names directly.
            //    If an agent is on both lists, count them as booked (not double-counted).
            const bookedNames = new Set(bookedOff.map(b => normalize(b['Agent Name'])));
            const bookedCount = bookedNames.size;

            let unplannedCount = 0;
            const countedUnplanned = new Set<string>();
            unplannedOff.forEach(u => {
                const name = normalize(u['Agent Name']);
                if (!bookedNames.has(name) && !countedUnplanned.has(name)) {
                    countedUnplanned.add(name);
                    unplannedCount++;
                }
            });

            const totalAbsent = bookedCount + unplannedCount;

            console.log('[Workforce]', {
                effectiveDate: date,
                dayOfWeek: day,
                totalActive,
                totalScheduled,
                bookedCount,
                unplannedCount,
                totalAbsent,
            });

            setTodayStats({
                totalActive,
                totalScheduled,
                absent: totalAbsent,
                bookedOff: bookedCount,
                unplannedOff: unplannedCount,
            });

        } catch (error) {
            console.error("Error fetching workforce data:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();

        const channels = [
            supabase.channel('workforce_schedule').on('postgres_changes', { event: '*', schema: 'public', table: 'Agent Schedule' }, () => fetchData()).subscribe(),
            supabase.channel('workforce_booked').on('postgres_changes', { event: '*', schema: 'public', table: 'Booked Days Off' }, () => fetchData()).subscribe(),
            supabase.channel('workforce_nonbooked').on('postgres_changes', { event: '*', schema: 'public', table: 'Non Booked Days Off' }, () => fetchData()).subscribe(),
            supabase.channel('workforce_directory').on('postgres_changes', { event: '*', schema: 'public', table: 'employee_directory' }, () => fetchData()).subscribe(),
        ];

        return () => { channels.forEach(c => supabase.removeChannel(c)); };
    }, [fetchData]);

    if (loading) {
        return <Skeleton className="h-[140px] w-full rounded-2xl" />;
    }

    const attendanceRate = todayStats.totalScheduled > 0
        ? Math.round(((todayStats.totalScheduled - todayStats.absent) / todayStats.totalScheduled) * 100)
        : 100;

    const totalAbsent = todayStats.bookedOff + todayStats.unplannedOff;

    return (
        <Card className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border-white/10 text-white overflow-hidden">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-400" />
                    Today's Workforce
                    <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full ml-2">{dayOfWeek} {effectiveDate}</span>
                    {isWeekend && (
                        <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
                            Weekend - Showing Last Friday
                        </span>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Total Active Agents */}
                    <div className="bg-white/5 rounded-xl p-4 text-center">
                        <Users className="w-6 h-6 mx-auto mb-2 text-indigo-400" />
                        <div className="text-3xl font-bold">{todayStats.totalActive}</div>
                        <div className="text-sm text-white/90 mt-1 font-semibold tracking-wide">Active Agents</div>
                    </div>

                    {/* Scheduled Today */}
                    <div className="bg-white/5 rounded-xl p-4 text-center">
                        <CalendarCheck className="w-6 h-6 mx-auto mb-2 text-green-400" />
                        <div className="text-3xl font-bold text-green-400">{todayStats.totalScheduled}</div>
                        <div className="text-sm text-white/90 mt-1 font-semibold tracking-wide">Scheduled</div>
                    </div>

                    {/* Absent */}
                    <div className="bg-white/5 rounded-xl p-4 text-center">
                        <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-amber-400" />
                        <div className="text-3xl font-bold text-amber-400">{todayStats.absent}</div>
                        <div className="text-sm text-white/90 mt-1 font-semibold tracking-wide">Absent</div>
                    </div>

                    {/* Attendance Rate */}
                    <div className="bg-white/5 rounded-xl p-4 text-center">
                        <Clock className="w-6 h-6 mx-auto mb-2 text-blue-400" />
                        <div className={`text-3xl font-bold ${attendanceRate >= 90 ? 'text-green-400' : attendanceRate >= 75 ? 'text-amber-400' : 'text-red-400'}`}>
                            {attendanceRate}%
                        </div>
                        <div className="text-sm text-white/90 mt-1 font-semibold tracking-wide">Attendance</div>
                    </div>
                </div>

                {/* Absence Breakdown Bar (Booked vs Unplanned) */}
                {totalAbsent > 0 ? (
                    <>
                        <div className="mt-4 h-4 bg-white/10 rounded-full overflow-hidden flex">
                            <div
                                className="bg-blue-400 h-full transition-all"
                                style={{ width: `${(todayStats.bookedOff / Math.max(1, totalAbsent)) * 100}%` }}
                                title={`Booked Time Off: ${todayStats.bookedOff}`}
                            />
                            <div
                                className="bg-rose-500 h-full transition-all"
                                style={{ width: `${(todayStats.unplannedOff / Math.max(1, totalAbsent)) * 100}%` }}
                                title={`Unplanned Absence: ${todayStats.unplannedOff}`}
                            />
                        </div>
                        <div className="flex justify-between text-sm text-white/80 mt-2 font-medium">
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full bg-blue-400 inline-block" />
                                Booked Time Off: {todayStats.bookedOff}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />
                                Unplanned Absence: {todayStats.unplannedOff}
                            </span>
                        </div>
                    </>
                ) : (
                    <div className="mt-4 text-xs text-white/60 text-center">No absences today</div>
                )}
            </CardContent>
        </Card>
    );
}

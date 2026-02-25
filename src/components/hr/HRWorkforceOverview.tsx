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

/** Format "13 Feb 2026" from Sheets to "2026-02-13" for comparison */
function parseDateDMonYYYY(s: string): string {
    const months: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    const parts = (s || '').trim().split(/\s+/);
    if (parts.length === 3 && months[parts[1]]) {
        return `${parts[2]}-${months[parts[1]]}-${parts[0].padStart(2, '0')}`;
    }
    return s;
}

export default function HRWorkforceOverview({ dateRange }: HRWorkforceOverviewProps) {
    const [loading, setLoading] = useState(true);
    const [todayStats, setTodayStats] = useState({
        totalActive: 0,
        totalScheduled: 0,
        absent: 0,
        bookedOff: 0,
        unplannedOff: 0,
        lateCount: 0,
        earlyLeaveCount: 0,
        noShowCount: 0,
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

            // Normalize: strip periods, suffixes, hyphens for comparison
            const normName = (s: string) => s.replace(/\./g, '').replace(/\b(jr|sr|ii|iii|iv)\b/gi, '').replace(/-/g, '').replace(/\s+/g, ' ').trim();

            // Build fuzzy match keys for active employees
            const activeEmployeeKeys = new Set<string>();
            const activeFirstToLasts = new Map<string, string[]>();
            (employees || []).forEach(e => {
                const fn = (e.first_name || '').trim().toLowerCase();
                const ln = (e.last_name || '').trim().toLowerCase();
                const fnN = normName(fn), lnN = normName(ln);
                const fnFirst = fn.split(/\s+/)[0];
                const fnFirstN = normName(fnFirst);
                const lnParts = ln.split(/[\s-]+/);
                const lnLast = lnParts[lnParts.length - 1];
                const lnFirst = lnParts[0];
                [
                    `${fn} ${ln}`, `${fnN} ${lnN}`,
                    `${fnFirst} ${ln}`, `${fnFirstN} ${lnN}`,
                    `${fn} ${lnLast}`, `${fn} ${lnFirst}`,
                    `${fnFirst} ${lnLast}`, `${fnFirstN} ${normName(lnLast)}`,
                ].forEach(k => activeEmployeeKeys.add(k));
                if (!activeFirstToLasts.has(fnFirst)) activeFirstToLasts.set(fnFirst, []);
                activeFirstToLasts.get(fnFirst)!.push(lnN);
            });

            const isActiveMatch = (firstName: string, lastName: string) => {
                const fn = firstName.trim().toLowerCase();
                const ln = lastName.trim().toLowerCase();
                const fnN = normName(fn), lnN = normName(ln);
                const fnFirst = fn.split(/\s+/)[0];
                const fnFirstN = normName(fnFirst);
                const lnParts = ln.split(/[\s-]+/);
                const lnLast = lnParts[lnParts.length - 1];
                const lnFirst = lnParts[0];
                if (activeEmployeeKeys.has(`${fn} ${ln}`)
                    || activeEmployeeKeys.has(`${fnN} ${lnN}`)
                    || activeEmployeeKeys.has(`${fnFirst} ${ln}`)
                    || activeEmployeeKeys.has(`${fnFirstN} ${lnN}`)
                    || activeEmployeeKeys.has(`${fn} ${lnLast}`)
                    || activeEmployeeKeys.has(`${fn} ${lnFirst}`)
                    || activeEmployeeKeys.has(`${fnFirst} ${lnLast}`)
                    || activeEmployeeKeys.has(`${fnFirstN} ${normName(lnLast)}`)) return true;
                const dirLns = activeFirstToLasts.get(fnFirst) || activeFirstToLasts.get(fnFirstN) || [];
                return dirLns.some(d => lnN.startsWith(d) || d.startsWith(lnN) || lnN.includes(d) || d.includes(lnN));
            };

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

            // 3. Absences + Attendance Events for the effective date
            // Merge both sources for cohesive data (matches heatmap logic):
            // - Booked Days Off = Google Sheets for planned PTO
            // - Non Booked Days Off = Google Sheets historical unplanned
            // - Attendance Events = Sam bot for current unplanned + late/early_leave
            const [bookedRes, nbRes, attendanceRes] = await Promise.all([
                supabase.from('Booked Days Off').select('*').eq('Date', date),
                supabase.from('Non Booked Days Off').select('"Agent Name", "Date"').eq('Date', date),
                supabase.from('Attendance Events').select('"Agent Name", "Event Type", "Date"'),
            ]);

            if (bookedRes.error) console.error('Booked Days Off error:', bookedRes.error);
            if (nbRes.error) console.error('Non Booked Days Off error:', nbRes.error);
            if (attendanceRes.error) console.error('Attendance Events error:', attendanceRes.error);

            const bookedOff = deduplicateBookedOff(bookedRes.data || []);
            const nbOff = deduplicateUnplannedOff(nbRes.data || []);

            const normalize = (name: string) => (name || '').trim().toLowerCase();

            // 4. Build unplanned set from Non Booked Days Off first (historical source)
            const seenUnplannedAgents = new Set<string>();
            nbOff.forEach((u: any) => {
                const name = normalize(u['Agent Name']);
                if (name) seenUnplannedAgents.add(name);
            });

            // 5. Attendance Events for today — adds unplanned not in NB, plus late/early_leave
            const todayAttendanceEvents = ((attendanceRes.data || []) as any[]).filter((ae: any) => {
                const aeDate = ae['Date'] || '';
                const normalized = aeDate.includes('-') ? aeDate : parseDateDMonYYYY(aeDate);
                return normalized === date;
            });

            const attendanceByType = { late: new Set<string>(), early_leave: new Set<string>() };
            todayAttendanceEvents.forEach((ae: any) => {
                const name = normalize(ae['Agent Name']);
                const eventType = (ae['Event Type'] || '').toLowerCase();
                if (eventType === 'planned') return;
                if (eventType === 'late') attendanceByType.late.add(name);
                else if (eventType === 'early_leave') attendanceByType.early_leave.add(name);
                else {
                    // unplanned, no_show, absent — add if not already from NB Days Off
                    if (name) seenUnplannedAgents.add(name);
                }
            });

            const lateCount = attendanceByType.late.size;
            const earlyLeaveCount = attendanceByType.early_leave.size;
            const noShowCount = 0;

            // 5. Scheduled count: Active employees with a shift today
            const seenAgents = new Set<string>();
            let totalScheduled = 0;

            allSchedules.forEach(agent => {
                const fn = (agent['First Name'] || '').trim();
                const ln = (agent['Last Name'] || '').trim();
                const agentKey = `${fn.toLowerCase()} ${ln.toLowerCase()}`;
                const shift = agent[day];

                if (
                    isActiveMatch(fn, ln) &&
                    !seenAgents.has(agentKey) &&
                    shift && shift.trim() !== '' && shift.trim().toLowerCase() !== 'off'
                ) {
                    seenAgents.add(agentKey);
                    totalScheduled++;
                }
            });

            // 6. Absences: Booked (Sheets) + Attendance Events (Sam bot)
            const bookedNames = new Set(bookedOff.map(b => normalize(b['Agent Name'])));
            const bookedCount = bookedNames.size;

            // Unplanned = unique agents from NB Days Off + Attendance Events, excluding Booked
            let unplannedCount = 0;
            seenUnplannedAgents.forEach((name: string) => {
                if (!bookedNames.has(name)) unplannedCount++;
            });

            const totalAbsent = bookedCount + unplannedCount;

            setTodayStats({
                totalActive,
                totalScheduled,
                absent: totalAbsent,
                bookedOff: bookedCount,
                unplannedOff: unplannedCount,
                lateCount,
                earlyLeaveCount,
                noShowCount,
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
            supabase.channel('workforce_attendance').on('postgres_changes', { event: '*', schema: 'public', table: 'Attendance Events' }, () => fetchData()).subscribe(),
        ];

        // 15-minute polling backup for reliable real-time data
        const pollInterval = setInterval(fetchData, 15 * 60 * 1000);

        return () => {
            channels.forEach(c => supabase.removeChannel(c));
            clearInterval(pollInterval);
        };
    }, [fetchData]);

    if (loading) {
        return <Skeleton className="h-[140px] w-full rounded-2xl" />;
    }

    const attendanceRate = todayStats.totalScheduled > 0
        ? Math.round(((todayStats.totalScheduled - todayStats.absent) / todayStats.totalScheduled) * 100)
        : 100;

    const totalAbsent = todayStats.absent;
    const otherUnplanned = todayStats.unplannedOff - todayStats.lateCount - todayStats.earlyLeaveCount;

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

                {/* Absence Breakdown Bar — all segments total to absent count */}
                {totalAbsent > 0 ? (
                    <>
                        <div className="mt-4 h-4 bg-white/10 rounded-full overflow-hidden flex">
                            {todayStats.bookedOff > 0 && (
                                <div
                                    className="bg-blue-400 h-full transition-all"
                                    style={{ width: `${(todayStats.bookedOff / totalAbsent) * 100}%` }}
                                    title={`Booked Time Off: ${todayStats.bookedOff}`}
                                />
                            )}
                            {todayStats.lateCount > 0 && (
                                <div
                                    className="bg-yellow-400 h-full transition-all"
                                    style={{ width: `${(todayStats.lateCount / totalAbsent) * 100}%` }}
                                    title={`Late: ${todayStats.lateCount}`}
                                />
                            )}
                            {todayStats.earlyLeaveCount > 0 && (
                                <div
                                    className="bg-orange-400 h-full transition-all"
                                    style={{ width: `${(todayStats.earlyLeaveCount / totalAbsent) * 100}%` }}
                                    title={`Early Leave: ${todayStats.earlyLeaveCount}`}
                                />
                            )}
                            {otherUnplanned > 0 && (
                                <div
                                    className="bg-rose-500 h-full transition-all"
                                    style={{ width: `${(otherUnplanned / totalAbsent) * 100}%` }}
                                    title={`Unplanned Absence: ${otherUnplanned}`}
                                />
                            )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/80 mt-2 font-medium">
                            {todayStats.bookedOff > 0 && (
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-full bg-blue-400 inline-block" />
                                    Booked: {todayStats.bookedOff}
                                </span>
                            )}
                            {todayStats.lateCount > 0 && (
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />
                                    Late: {todayStats.lateCount}
                                </span>
                            )}
                            {todayStats.earlyLeaveCount > 0 && (
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" />
                                    Early Leave: {todayStats.earlyLeaveCount}
                                </span>
                            )}
                            {otherUnplanned > 0 && (
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />
                                    Unplanned: {otherUnplanned}
                                </span>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="mt-4 text-xs text-white/60 text-center">No absences today</div>
                )}
            </CardContent>
        </Card>
    );
}

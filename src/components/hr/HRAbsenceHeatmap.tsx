"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import { deduplicateBookedOff, deduplicateUnplannedOff } from '@/lib/hr-utils';

interface DayData {
    day: string;
    shortDay: string;
    dow: number;
    booked: number;
    unplanned: number;
    total: number;
    isToday: boolean;
    todayBooked: number;
    todayUnplanned: number;
    avgBooked: number;
    avgUnplanned: number;
    histDays: number;
    overallAvgUnplanned: number;
    overallAvgBooked: number;
}

export default function HRAbsenceHeatmap() {
    const [loading, setLoading] = useState(true);
    const [dayData, setDayData] = useState<DayData[]>([]);
    const [peakDay, setPeakDay] = useState<string>("");

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [bookedRes, unplannedRes] = await Promise.all([
                supabase.from('Booked Days Off').select('"Date", "Agent Name"'),
                supabase.from('Non Booked Days Off').select('"Date", "Agent Name", "Reason"'),
            ]);

            const booked = deduplicateBookedOff(bookedRes.data || []);
            const unplanned = deduplicateUnplannedOff(unplannedRes.data || []);

            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const shortNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

            // Today's info for comparison
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const todayDow = now.getDay();

            const bookedByDow: Record<number, number> = {};
            const unplannedByDow: Record<number, number> = {};
            const bookedDatesByDow: Record<number, Set<string>> = {};
            const unplannedDatesByDow: Record<number, Set<string>> = {};
            let todayBookedCount = 0;
            let todayUnplannedCount = 0;

            booked.forEach((b: any) => {
                if (!b['Date'] || !b['Agent Name']?.trim()) return;
                const dateStr = (b['Date'] || '').toString().trim();
                const d = new Date(dateStr + 'T00:00:00');
                const dow = d.getDay();
                if (dow >= 1 && dow <= 5) {
                    bookedByDow[dow] = (bookedByDow[dow] || 0) + 1;
                    if (!bookedDatesByDow[dow]) bookedDatesByDow[dow] = new Set();
                    bookedDatesByDow[dow].add(dateStr);
                    if (dateStr === todayStr) todayBookedCount++;
                }
            });

            unplanned.forEach((u: any) => {
                if (!u['Date'] || !u['Agent Name']?.trim()) return;
                const dateStr = (u['Date'] || '').toString().trim();
                const d = new Date(dateStr + 'T00:00:00');
                const dow = d.getDay();
                if (dow >= 1 && dow <= 5) {
                    unplannedByDow[dow] = (unplannedByDow[dow] || 0) + 1;
                    if (!unplannedDatesByDow[dow]) unplannedDatesByDow[dow] = new Set();
                    unplannedDatesByDow[dow].add(dateStr);
                    if (dateStr === todayStr) todayUnplannedCount++;
                }
            });

            const data: DayData[] = [];
            for (let dow = 1; dow <= 5; dow++) {
                const b = bookedByDow[dow] || 0;
                const u = unplannedByDow[dow] || 0;
                const isToday = dow === todayDow;

                // Historical average: exclude today to avoid self-comparison bias
                const uDates = unplannedDatesByDow[dow]?.size || 0;
                const bDates = bookedDatesByDow[dow]?.size || 0;
                const uHasToday = unplannedDatesByDow[dow]?.has(todayStr) || false;
                const bHasToday = bookedDatesByDow[dow]?.has(todayStr) || false;

                const histUDays = uDates - (uHasToday ? 1 : 0);
                const histBDays = bDates - (bHasToday ? 1 : 0);
                const histUTotal = u - (isToday ? todayUnplannedCount : 0);
                const histBTotal = b - (isToday ? todayBookedCount : 0);

                const avgU = histUDays > 0 ? Math.round((histUTotal / histUDays) * 10) / 10 : 0;
                const avgB = histBDays > 0 ? Math.round((histBTotal / histBDays) * 10) / 10 : 0;

                // Overall average (including today) for the day cards
                const oAvgU = uDates > 0 ? Math.round((u / uDates) * 10) / 10 : 0;
                const oAvgB = bDates > 0 ? Math.round((b / bDates) * 10) / 10 : 0;

                data.push({
                    day: dayNames[dow],
                    shortDay: shortNames[dow],
                    dow,
                    booked: b,
                    unplanned: u,
                    total: b + u,
                    isToday,
                    todayBooked: isToday ? todayBookedCount : 0,
                    todayUnplanned: isToday ? todayUnplannedCount : 0,
                    avgBooked: avgB,
                    avgUnplanned: avgU,
                    histDays: Math.max(histUDays, histBDays),
                    overallAvgUnplanned: oAvgU,
                    overallAvgBooked: oAvgB,
                });
            }

            // Peak detection uses per-day averages (not totals) for accuracy
            const peakUnplanned = data.reduce((max, d) => d.overallAvgUnplanned > max.overallAvgUnplanned ? d : max, data[0]);
            setPeakDay(peakUnplanned.day);
            setDayData(data);
        } catch (error) {
            console.error("Error fetching absence heatmap data:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();

        const channels = [
            supabase.channel('heatmap_booked').on('postgres_changes', { event: '*', schema: 'public', table: 'Booked Days Off' }, () => fetchData()).subscribe(),
            supabase.channel('heatmap_unplanned').on('postgres_changes', { event: '*', schema: 'public', table: 'Non Booked Days Off' }, () => fetchData()).subscribe(),
        ];

        return () => { channels.forEach(c => supabase.removeChannel(c)); };
    }, [fetchData]);

    if (loading) {
        return <Skeleton className="h-[300px] w-full rounded-2xl" />;
    }

    // Average of per-day averages (used for card color thresholds)
    const avgOfAvgs = dayData.length > 0
        ? dayData.reduce((sum, d) => sum + d.overallAvgUnplanned, 0) / dayData.length
        : 0;

    const getCardStyle = (avgVal: number, isPeak: boolean) => {
        const ratio = avgVal / Math.max(avgOfAvgs, 1);
        if (ratio >= 1.5) return {
            bg: 'from-red-500/25 to-red-600/15',
            border: 'border-red-400/40',
            text: 'text-red-300',
            glow: isPeak ? 'shadow-red-500/20 shadow-lg' : '',
        };
        if (ratio >= 1.2) return {
            bg: 'from-orange-500/20 to-orange-600/10',
            border: 'border-orange-400/35',
            text: 'text-orange-300',
            glow: '',
        };
        if (ratio >= 0.8) return {
            bg: 'from-amber-500/15 to-amber-600/8',
            border: 'border-amber-400/30',
            text: 'text-amber-300',
            glow: '',
        };
        return {
            bg: 'from-emerald-500/15 to-emerald-600/8',
            border: 'border-emerald-400/30',
            text: 'text-emerald-300',
            glow: '',
        };
    };

    return (
        <Card className="bg-white/5 border-white/10 text-white overflow-hidden">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-violet-400" />
                    Absence Patterns by Day
                </CardTitle>
                <p className="text-sm text-white/70 mt-1">
                    Average absences per weekday to identify highest-risk days
                </p>
                <div className="mt-2 px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/10">
                    <p className="text-sm text-white/90 leading-relaxed">
                        <strong className="text-white">What this shows:</strong> The average number of absences per weekday, calculated from running totals across all recorded history. <span className="text-rose-400 font-medium">Unplanned</span> = call-offs and no-shows (from Non Booked Days Off). <span className="text-blue-300 font-medium">Booked</span> = pre-approved time off (from Booked Days Off). Use this to spot which days are most likely to face staffing gaps.
                    </p>
                </div>
            </CardHeader>
            <CardContent>
                {dayData.length === 0 ? (
                    <div className="h-[180px] flex items-center justify-center text-white/40">
                        No absence data available
                    </div>
                ) : (
                    <>
                        {/* Today vs Historical Average */}
                        {(() => {
                            const today = dayData.find(d => d.isToday);
                            if (!today || today.dow < 1 || today.dow > 5) return null;
                            if (today.todayUnplanned === 0 && today.todayBooked === 0 && today.histDays === 0) return null;

                            const getDelta = (current: number, avg: number) =>
                                avg > 0 ? Math.round(((current / avg) - 1) * 100) : null;

                            const uDelta = getDelta(today.todayUnplanned, today.avgUnplanned);
                            const bDelta = getDelta(today.todayBooked, today.avgBooked);
                            const totalToday = today.todayUnplanned + today.todayBooked;
                            const totalAvg = today.avgUnplanned + today.avgBooked;
                            const tDelta = getDelta(totalToday, totalAvg);

                            const deltaColor = (d: number | null) => {
                                if (d === null) return 'text-white/50';
                                if (d > 30) return 'text-red-400';
                                if (d > 0) return 'text-amber-400';
                                return 'text-emerald-400';
                            };
                            const deltaLabel = (d: number | null) => {
                                if (d === null) return 'N/A';
                                const arrow = d > 0 ? '\u25B2' : d < 0 ? '\u25BC' : '\u2014';
                                return `${arrow} ${Math.abs(d)}%`;
                            };

                            return (
                                <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-violet-500/10 to-blue-500/10 border border-violet-400/20">
                                    <div className="flex items-center justify-between mb-2.5">
                                        <h3 className="text-sm font-semibold text-white/90 flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                                            Today vs {today.day} Average
                                        </h3>
                                        {today.histDays > 0 && (
                                            <span className="text-[11px] text-white/40">
                                                Based on {today.histDays} previous {today.day}{today.histDays !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="text-center p-2.5 rounded-lg bg-rose-500/10 border border-rose-400/15">
                                            <div className="text-xs text-rose-300 mb-1.5 font-semibold uppercase tracking-wider">Unplanned</div>
                                            <div className="text-3xl font-extrabold text-rose-400 leading-none">{today.todayUnplanned}</div>
                                            <div className="text-sm text-white/70 mt-1.5 font-medium">avg <span className="text-rose-300/80 font-bold">{today.avgUnplanned}</span></div>
                                            <div className={`text-xs font-bold mt-1 ${deltaColor(uDelta)}`}>
                                                {deltaLabel(uDelta)}
                                            </div>
                                        </div>
                                        <div className="text-center p-2.5 rounded-lg bg-blue-500/10 border border-blue-400/15">
                                            <div className="text-xs text-blue-300 mb-1.5 font-semibold uppercase tracking-wider">Booked</div>
                                            <div className="text-3xl font-extrabold text-blue-300 leading-none">{today.todayBooked}</div>
                                            <div className="text-sm text-white/70 mt-1.5 font-medium">avg <span className="text-blue-300/80 font-bold">{today.avgBooked}</span></div>
                                            <div className={`text-xs font-bold mt-1 ${deltaColor(bDelta)}`}>
                                                {deltaLabel(bDelta)}
                                            </div>
                                        </div>
                                        <div className="text-center p-2.5 rounded-lg bg-white/[0.06] border border-white/10">
                                            <div className="text-xs text-white/70 mb-1.5 font-semibold uppercase tracking-wider">Total</div>
                                            <div className="text-3xl font-extrabold text-white leading-none">{totalToday}</div>
                                            <div className="text-sm text-white/70 mt-1.5 font-medium">avg <span className="text-white/80 font-bold">{Math.round(totalAvg * 10) / 10}</span></div>
                                            <div className={`text-xs font-bold mt-1 ${deltaColor(tDelta)}`}>
                                                {deltaLabel(tDelta)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Day-of-week cards */}
                        <div className="grid grid-cols-5 gap-3 mb-4">
                            {dayData.map((d, i) => {
                                const isPeak = d.day === peakDay;
                                const style = getCardStyle(d.overallAvgUnplanned, isPeak);
                                const pctVsAvg = avgOfAvgs > 0 ? Math.round(((d.overallAvgUnplanned / avgOfAvgs) - 1) * 100) : 0;
                                const aboveBelow = pctVsAvg > 0 ? `\u25B2 ${pctVsAvg}%` : pctVsAvg < 0 ? `\u25BC ${Math.abs(pctVsAvg)}%` : '\u2014 avg';
                                return (
                                    <motion.div
                                        key={d.shortDay}
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.4, delay: i * 0.07 }}
                                        whileHover={{ scale: 1.04, y: -2 }}
                                        className={`relative rounded-xl border p-3 text-center bg-gradient-to-b ${style.bg} ${style.border} ${style.glow} ${isPeak ? 'ring-1 ring-red-400/50' : ''} ${d.isToday ? 'ring-1 ring-violet-400/60' : ''} cursor-default transition-shadow duration-200 hover:shadow-lg hover:shadow-white/5`}
                                    >
                                        <div className="text-lg font-bold text-white/90 mb-1.5 tracking-wide">
                                            {d.shortDay}
                                            {d.isToday && (
                                                <span className="ml-1 text-[9px] font-semibold text-violet-300 uppercase tracking-widest align-top">today</span>
                                            )}
                                        </div>

                                        <div className={`text-2xl font-extrabold ${style.text} leading-none`}>
                                            {d.overallAvgUnplanned}
                                        </div>
                                        <div className="text-[10px] text-white/50 mt-1 font-medium">avg unplanned</div>

                                        <div className={`text-xs font-bold mt-1.5 ${style.text}`}>
                                            {aboveBelow}
                                        </div>

                                        {isPeak && (
                                            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-400 rounded-full animate-pulse ring-2 ring-red-400/30" />
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>

                        {/* Insight line */}
                        <div className="pt-3 border-t border-white/10 flex items-center gap-2 text-sm text-white/80">
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0" />
                            {avgOfAvgs > 0 ? (
                                <span><strong>{peakDay}</strong> averages <strong>{dayData.find(d => d.day === peakDay)?.overallAvgUnplanned}</strong> unplanned absences/day, <strong>{Math.round(((dayData.find(d => d.day === peakDay)?.overallAvgUnplanned || 0) / avgOfAvgs - 1) * 100)}%</strong> above the weekday average ({Math.round(avgOfAvgs * 10) / 10})</span>
                            ) : (
                                <span>No unplanned absences recorded for the current period</span>
                            )}
                        </div>

                        {/* Legend */}
                        <div className="mt-3 flex items-center gap-4 text-xs text-white/70">
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                                Above 1.5x avg
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                                Above avg
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                                Below avg
                            </span>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}

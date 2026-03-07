"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, AlertCircle, CalendarDays } from "lucide-react";

interface AttendanceEvent {
    id: string;
    agentName: string;
    eventType: 'planned' | 'unplanned';
    date: string;
    reason: string | null;
    reportedBy: string;
    reportedAt: string;
}

const EVENT_CONFIG: Record<string, { icon: typeof CalendarDays; color: string; bgColor: string; borderColor: string; dotColor: string; label: string }> = {
    planned: { icon: CalendarDays, color: 'text-sky-300', bgColor: 'bg-sky-500/15', borderColor: 'border-sky-400/20', dotColor: 'bg-sky-400', label: 'Planned' },
    unplanned: { icon: AlertCircle, color: 'text-rose-300', bgColor: 'bg-rose-500/15', borderColor: 'border-rose-400/20', dotColor: 'bg-rose-400', label: 'Unplanned' },
};

/** Parse "13 Feb 2026" to ISO */
function parseDateDMonYYYY(s: string): string {
    const months: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    const parts = (s || '').trim().split(/\s+/);
    if (parts.length === 3 && months[parts[1]]) {
        return `${parts[2]}-${months[parts[1]]}-${parts[0].padStart(2, '0')}`;
    }
    return s;
}

/** Format a timestamp to just the time portion (e.g., "8:29 AM") for the today-scoped feed */
function formatTime(raw: string): string {
    if (!raw) return '';
    try {
        const d = new Date(raw);
        if (isNaN(d.getTime())) return raw;
        return d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch { return raw; }
}

export default function HRAttendanceFeed() {
    const [loading, setLoading] = useState(true);
    const [events, setEvents] = useState<AttendanceEvent[]>([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

            // Fetch unplanned absences only (Non Booked Days Off)
            const { data: unbookedData } = await supabase
                .from('Non Booked Days Off')
                .select('*')
                .eq('Date', todayStr);

            const merged: AttendanceEvent[] = [];

            (unbookedData || []).forEach((row: any) => {
                merged.push({
                    id: row.id,
                    agentName: row['Agent Name'] || '',
                    eventType: 'unplanned',
                    date: row['Date'] || '',
                    reason: (row['Reason'] || '').toString().trim() || null,
                    reportedBy: (row['Reported By'] || '').toString().trim(),
                    reportedAt: '',
                });
            });

            // Dedup by agent name + date (case-insensitive)
            const seen = new Set<string>();
            const deduped = merged.filter(e => {
                const key = `${e.agentName.toLowerCase()}|${e.date}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            // Sort by name
            deduped.sort((a, b) => a.agentName.localeCompare(b.agentName));

            setEvents(deduped);
        } catch (error) {
            console.error("Error fetching attendance feed:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();

        // Subscribe to Non Booked Days Off for realtime updates
        const ch = supabase
            .channel('attendance_feed_unbooked')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Non Booked Days Off' }, () => fetchData())
            .subscribe();

        // 5-minute polling fallback in case realtime subscription drops
        const pollInterval = setInterval(fetchData, 5 * 60 * 1000);

        return () => {
            supabase.removeChannel(ch);
            clearInterval(pollInterval);
        };
    }, [fetchData]);

    if (loading) {
        return <Skeleton className="h-[300px] w-full rounded-2xl" />;
    }

    return (
        <Card className="bg-white/5 border-white/10 text-white overflow-hidden rounded-2xl">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-violet-500/15">
                        <Activity className="w-4 h-4 text-violet-400" />
                    </div>
                    Today&apos;s Unplanned Absences
                    {events.length > 0 && (
                        <span className="text-xs bg-rose-500/15 text-rose-400 px-2.5 py-0.5 rounded-full ml-auto font-semibold tabular-nums border border-rose-500/20">
                            {events.length}
                        </span>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {events.length === 0 ? (
                    <div className="h-[200px] flex flex-col items-center justify-center">
                        <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-3">
                            <Activity className="w-8 h-8 text-white/15" />
                        </div>
                        <span className="text-sm text-white/35 font-medium">No absences reported today</span>
                        <span className="text-xs mt-1.5 text-white/20">Events appear here via the Slack bot</span>
                    </div>
                ) : (
                    <div className="space-y-1.5 max-h-[350px] overflow-y-auto pr-1">
                        {events.map((evt) => {
                            const config = EVENT_CONFIG[evt.eventType] || EVENT_CONFIG.unplanned;
                            const Icon = config.icon;
                            return (
                                <div
                                    key={evt.id}
                                    className={`group flex items-center gap-3 px-3.5 py-2.5 rounded-lg border ${config.borderColor} transition-all duration-200 hover:bg-white/[0.04]`}
                                >
                                    <span className={`w-2 h-2 rounded-full ${config.dotColor} shrink-0`} />
                                    <div className="flex-1 min-w-0">
                                        <span className="text-sm font-medium text-white truncate block">
                                            {evt.agentName}
                                        </span>
                                        {evt.reason && (
                                            <p className="text-xs text-white/50 mt-0.5 truncate">{evt.reason}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {evt.reportedBy && (
                                            <span className="text-[11px] text-white/30 hidden group-hover:inline">
                                                {evt.reportedBy}
                                            </span>
                                        )}
                                        <span className={`text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md ${config.color} ${config.bgColor}`}>
                                            {config.label}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

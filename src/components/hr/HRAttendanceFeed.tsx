"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Clock, ArrowLeft, Ban, AlertCircle, CalendarDays } from "lucide-react";

interface AttendanceEvent {
    id: string;
    agentName: string;
    eventType: string;
    date: string;
    minutes: number | null;
    reason: string | null;
    reportedBy: string;
    reportedAt: string;
}

const EVENT_CONFIG: Record<string, { icon: typeof Clock; color: string; bgColor: string; label: string }> = {
    planned: { icon: CalendarDays, color: 'text-blue-400', bgColor: 'bg-blue-500/15', label: 'Planned' },
    unplanned: { icon: AlertCircle, color: 'text-amber-400', bgColor: 'bg-amber-500/15', label: 'Unplanned' },
    no_show: { icon: AlertCircle, color: 'text-amber-400', bgColor: 'bg-amber-500/15', label: 'Unplanned' }, // Legacy — displayed as unplanned
    // Legacy types for historical data
    late: { icon: Clock, color: 'text-yellow-400', bgColor: 'bg-yellow-500/15', label: 'Late' },
    early_leave: { icon: ArrowLeft, color: 'text-orange-400', bgColor: 'bg-orange-500/15', label: 'Early Leave' },
    absent: { icon: AlertCircle, color: 'text-rose-400', bgColor: 'bg-rose-500/15', label: 'Absent' },
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

            // Fetch all attendance events and filter today's client-side (handles both date formats)
            const { data, error } = await supabase
                .from('Attendance Events')
                .select('*')
                .order('id', { ascending: false });

            if (error) {
                console.error('Attendance Events error:', error);
                setEvents([]);
                return;
            }

            const todayEvents = (data || [])
                .filter((row: any) => {
                    const d = row['Date'] || '';
                    const normalized = d.includes('-') ? d : parseDateDMonYYYY(d);
                    return normalized === todayStr;
                })
                .map((row: any) => {
                    let reason = (row['Reason'] || '').toString().trim();
                    let shiftStart = (row['Shift Start'] || '').toString().trim();
                    let reportedBy = (row['Reported By'] || '').toString().trim();
                    let reportedAt = (row['Reported At'] || '').toString().trim();

                    // Fix sheet sync column misalignment: Reported By → Reason, Reported At → Shift Start
                    const isPersonName = (v: string) => v && v.length >= 3 && !/^\d/.test(v) && !/\d{2}:\d{2}/.test(v) && !/[ap]\.?m\.?/i.test(v) && !v.includes('@') && /^[A-Z][a-z]+\s+[A-Z]/.test(v);
                    const isTimestamp = (v: string) => v && (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/.test(v) || /^\d{4}-\d{2}-\d{2}T/.test(v));
                    if (isPersonName(reason) && !reportedBy) { reportedBy = reason; reason = ''; }
                    if (isTimestamp(shiftStart) && !reportedAt) { reportedAt = shiftStart; }

                    return {
                        id: row.id,
                        agentName: row['Agent Name'] || '',
                        eventType: (row['Event Type'] || '').toLowerCase(),
                        date: row['Date'] || '',
                        minutes: row['Minutes'] ? parseInt(row['Minutes'], 10) : null,
                        reason: reason || null,
                        reportedBy,
                        reportedAt,
                    };
                });

            setEvents(todayEvents);
        } catch (error) {
            console.error("Error fetching attendance feed:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();

        const channel = supabase
            .channel('attendance_feed')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Attendance Events' }, () => fetchData())
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchData]);

    if (loading) {
        return <Skeleton className="h-[300px] w-full rounded-2xl" />;
    }

    return (
        <Card className="bg-white/5 border-white/10 text-white overflow-hidden">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                    <Activity className="w-5 h-5 text-cyan-400" />
                    Today's Attendance Events
                    {events.length > 0 && (
                        <span className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full ml-2">
                            {events.length} event{events.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {events.length === 0 ? (
                    <div className="h-[200px] flex flex-col items-center justify-center text-white/40">
                        <Activity className="w-10 h-10 mb-2 text-white/20" />
                        <span>No attendance events reported today</span>
                        <span className="text-xs mt-1 text-white/30">Events appear here when reported via the Slack bot</span>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                        {events.map((evt) => {
                            const config = EVENT_CONFIG[evt.eventType] || EVENT_CONFIG.unplanned;
                            const Icon = config.icon;
                            return (
                                <div
                                    key={evt.id}
                                    className={`flex items-start gap-3 p-3 rounded-xl ${config.bgColor} border border-white/5 transition-all hover:border-white/10`}
                                >
                                    <div className={`mt-0.5 p-1.5 rounded-lg bg-black/20 ${config.color}`}>
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-semibold text-white truncate">
                                                {evt.agentName}
                                            </span>
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${config.color} bg-black/20 shrink-0`}>
                                                {config.label}
                                            </span>
                                        </div>
                                        {evt.reason && (
                                            <p className="text-xs text-white/60 mt-0.5 truncate">{evt.reason}</p>
                                        )}
                                        {evt.reportedBy && (
                                            <p className="text-[11px] text-white/40 mt-1">
                                                Reported by {evt.reportedBy}
                                                {evt.reportedAt && ` at ${formatTime(evt.reportedAt)}`}
                                            </p>
                                        )}
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

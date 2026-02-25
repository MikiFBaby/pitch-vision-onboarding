"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase-client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Activity, Search, Download, ChevronDown, ChevronUp,
    Calendar, Trash2, Users, TrendingUp, X,
} from "lucide-react";

interface AttendanceRow {
    id: string;
    agentName: string;
    eventType: string;
    date: string;        // ISO YYYY-MM-DD (normalized)
    rawDate: string;     // Original date from DB
    minutes: number | null;
    reason: string | null;
    shiftStart: string;
    campaign: string;
    reportedBy: string;
    reportedAt: string;
}

interface AgentSummary {
    name: string;
    plannedCount: number;
    unplannedCount: number;
    totalScore: number;
    latestDate: string;
}

const OCCURRENCE_WEIGHTS: Record<string, number> = {
    planned: 0.5,
    unplanned: 1.5,
    no_show: 1.5, // Legacy — treated as unplanned
    // Legacy types
    late: 1,
    early_leave: 1,
    absent: 1.5,
};

const EVENT_STYLES: Record<string, { color: string; bg: string; label: string }> = {
    planned: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Planned' },
    unplanned: { color: 'text-amber-400', bg: 'bg-amber-500/20', label: 'Unplanned' },
    no_show: { color: 'text-amber-400', bg: 'bg-amber-500/20', label: 'Unplanned' }, // Legacy — displayed as unplanned
    // Legacy types for historical data
    late: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'Late' },
    early_leave: { color: 'text-orange-400', bg: 'bg-orange-500/20', label: 'Early Leave' },
    absent: { color: 'text-rose-400', bg: 'bg-rose-500/20', label: 'Absent' },
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

/** Format ISO "2026-02-18" to "Feb 18, 2026" */
function formatDateDisplay(iso: string): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const month = months[parseInt(parts[1], 10) - 1];
    const day = parseInt(parts[2], 10);
    return `${month} ${day}, ${parts[0]}`;
}

/** Clean up messy timestamps like "Wed Feb 18 2026 09:17:00 GMT-0500 (Eastern Standard Time)" to "Feb 18, 2026 9:17 AM" */
function formatTimestampDisplay(raw: string): string {
    if (!raw) return '';
    // Already clean format like "Feb 18, 2026 9:17 AM"
    if (/^[A-Z][a-z]{2}\s\d/.test(raw) && raw.length < 30) return raw;
    // ISO timestamp
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
        try {
            const d = new Date(raw);
            return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
        } catch { return raw; }
    }
    // Raw JS Date.toString() format: "Wed Feb 18 2026 09:17:00 GMT-0500 (...)"
    const jsDateMatch = raw.match(/^[A-Z][a-z]{2}\s([A-Z][a-z]{2})\s(\d{1,2})\s(\d{4})\s(\d{2}):(\d{2})/);
    if (jsDateMatch) {
        const [, mon, day, year, hour, min] = jsDateMatch;
        const h = parseInt(hour, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${mon} ${parseInt(day, 10)}, ${year} ${h12}:${min} ${ampm}`;
    }
    return raw;
}

/** Detect if a "Shift Start" value is actually a reporter name (column swap from misaligned Sheet) */
function looksLikePersonName(val: string): boolean {
    if (!val) return false;
    // Person names: "Miki Furman", "John Smith" — no colons, no AM/PM, has a space
    if (/\d{1,2}:\d{2}/.test(val)) return false; // has time pattern
    if (/[ap]\.?m\.?/i.test(val)) return false;   // has AM/PM
    if (val.includes('@')) return false;            // email
    if (/^U[A-Z0-9]{8,}$/.test(val)) return false; // Slack user ID
    return /^[A-Z][a-z]+\s+[A-Z]/.test(val);       // "Firstname Lastname" pattern
}

/** Detect if a "Campaign" value is actually a timestamp */
function looksLikeTimestamp(val: string): boolean {
    if (!val) return false;
    return /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/.test(val) || /^\d{4}-\d{2}-\d{2}T/.test(val);
}

/**
 * Normalize a row's columns — handles the known column-swap issue where
 * the Sheet has Reported By in the Shift Start column and Reported At in Campaign.
 */
function normalizeRow(raw: any): AttendanceRow {
    const rawDate = raw['Date'] || '';
    const isoDate = rawDate.includes('-') ? rawDate : parseDateDMonYYYY(rawDate);

    let reason = (raw['Reason'] || '').toString().trim();
    let shiftStart = (raw['Shift Start'] || '').toString().trim();
    let campaign = (raw['Campaign'] || '').toString().trim();
    let reportedBy = (raw['Reported By'] || '').toString().trim();
    let reportedAt = (raw['Reported At'] || '').toString().trim();

    // Detect column swaps caused by sheet sync misalignment:
    // The sheet sometimes shifts Reported By → Reason, Reported At → Shift Start

    // If Reason looks like a person name and Reported By is empty → swap
    if (looksLikePersonName(reason) && !reportedBy) {
        reportedBy = reason;
        reason = '';
    }
    // If Shift Start looks like a person name and Reported By is empty → swap
    if (looksLikePersonName(shiftStart) && !reportedBy) {
        reportedBy = shiftStart;
        shiftStart = '';
    }
    // If Shift Start looks like a timestamp and Reported At is empty → swap
    if (looksLikeTimestamp(shiftStart) && !reportedAt) {
        reportedAt = shiftStart;
        shiftStart = '';
    }
    // If Campaign looks like a timestamp and Reported At is empty → swap
    if (looksLikeTimestamp(campaign) && !reportedAt) {
        reportedAt = campaign;
        campaign = '';
    }
    // Slack user ID in Shift Start — discard (not useful display data)
    if (/^U[A-Z0-9]{8,}$/.test(shiftStart)) {
        shiftStart = '';
    }

    return {
        id: raw.id,
        agentName: raw['Agent Name'] || '',
        eventType: (raw['Event Type'] || '').toLowerCase(),
        date: isoDate,
        rawDate,
        minutes: raw['Minutes'] ? parseInt(raw['Minutes'], 10) : null,
        reason: reason || null,
        shiftStart,
        campaign,
        reportedBy,
        reportedAt,
    };
}

export default function AttendancePage() {
    const [loading, setLoading] = useState(true);
    const [events, setEvents] = useState<AttendanceRow[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<string>('all');
    const [datePreset, setDatePreset] = useState<'today' | '7d' | '30d' | 'all' | 'custom'>('30d');
    const [specificDate, setSpecificDate] = useState('');
    const [sortField, setSortField] = useState<'date' | 'name' | 'type'>('date');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [activeTab, setActiveTab] = useState<'events' | 'agents'>('events');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('Attendance Events')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Attendance Events error:', error);
                setEvents([]);
                return;
            }

            setEvents((data || []).map(normalizeRow));
        } catch (error) {
            console.error("Error fetching attendance data:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const channel = supabase
            .channel('attendance_page')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Attendance Events' }, () => fetchData())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [fetchData]);

    // Delete handler
    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            const res = await fetch('/api/attendance/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            if (!res.ok) {
                const err = await res.json();
                console.error('Delete failed:', err);
                alert(`Delete failed: ${err?.error || 'Unknown error'}`);
                return;
            }
            // Optimistic removal — don't wait for realtime
            setEvents(prev => prev.filter(e => e.id !== id));
        } catch (err) {
            console.error('Delete error:', err);
            alert('Delete failed — check console for details.');
        } finally {
            setDeletingId(null);
            setConfirmDeleteId(null);
        }
    };

    // Filtering
    // Filter by date range, type, and search — then remove true duplicates
    const filteredEvents = useMemo(() => {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        let cutoff = '';
        if (datePreset === 'today') cutoff = todayStr;
        else if (datePreset === '7d') cutoff = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
        else if (datePreset === '30d') cutoff = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

        const filtered = events
            .filter(e => {
                if (datePreset === 'custom' && specificDate) return e.date === specificDate;
                return !cutoff || e.date >= cutoff;
            })
            .filter(e => {
                if (filterType === 'all') return true;
                if (filterType === 'unplanned') return ['unplanned', 'no_show', 'absent', 'late', 'early_leave'].includes(e.eventType);
                return e.eventType === filterType;
            })
            .filter(e => !searchTerm || e.agentName.toLowerCase().includes(searchTerm.toLowerCase()));

        // Remove true duplicates: same agent + date + event type → keep first occurrence only
        const seen = new Set<string>();
        return filtered.filter(e => {
            const key = `${e.agentName.toLowerCase()}|${e.date}|${e.eventType}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [events, datePreset, specificDate, filterType, searchTerm]);

    // Sorting
    const sortedEvents = useMemo(() => {
        const sorted = [...filteredEvents];
        sorted.sort((a, b) => {
            let cmp = 0;
            if (sortField === 'date') cmp = a.date.localeCompare(b.date);
            else if (sortField === 'name') cmp = a.agentName.localeCompare(b.agentName);
            else if (sortField === 'type') cmp = a.eventType.localeCompare(b.eventType);
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return sorted;
    }, [filteredEvents, sortField, sortDir]);

    // Agent summaries (computed from deduped filteredEvents)
    const agentSummaries = useMemo(() => {
        const map = new Map<string, AgentSummary>();
        filteredEvents.forEach(e => {
            const key = e.agentName.toLowerCase();
            const existing = map.get(key) || {
                name: e.agentName, plannedCount: 0, unplannedCount: 0, totalScore: 0, latestDate: '',
            };
            const et = e.eventType;
            if (et === 'planned') existing.plannedCount++;
            else existing.unplannedCount++;
            existing.totalScore += OCCURRENCE_WEIGHTS[et] || 1;
            if (e.date > existing.latestDate) existing.latestDate = e.date;
            map.set(key, existing);
        });
        return Array.from(map.values()).sort((a, b) => b.totalScore - a.totalScore);
    }, [filteredEvents]);

    // Stats count the visible (already deduped) rows directly
    const stats = useMemo(() => ({
        total: filteredEvents.length,
        planned: filteredEvents.filter(e => e.eventType === 'planned').length,
        unplanned: filteredEvents.filter(e => e.eventType !== 'planned').length,
    }), [filteredEvents]);

    const toggleSort = (field: typeof sortField) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('desc'); }
    };

    const SortIcon = ({ field }: { field: typeof sortField }) => {
        if (sortField !== field) return null;
        return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
    };

    const handleExport = () => {
        const headers = ['Agent Name', 'Event Type', 'Reason', 'Shift Start', 'Campaign', 'Reported By', 'Reported'];
        const rows = sortedEvents.map(e => [
            e.agentName, e.eventType, e.reason ?? '',
            e.shiftStart, e.campaign, e.reportedBy, formatTimestampDisplay(e.reportedAt) || formatDateDisplay(e.date),
        ]);
        const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance-events-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <DashboardLayout>
                <div className="space-y-6">
                    <Skeleton className="h-12 w-64 rounded-xl" />
                    <Skeleton className="h-[600px] w-full rounded-2xl" />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-4xl xl:text-5xl font-bold tracking-tight text-white">
                            Attendance
                            <span className="inline-block ml-2 w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                        </h2>
                        <p className="text-white/50 text-base font-medium mt-1">
                            Track planned and unplanned absences
                        </p>
                    </div>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 border border-white/10 text-white/80 hover:text-white hover:bg-white/15 transition-all text-sm font-medium"
                    >
                        <Download className="w-4 h-4" />
                        Export CSV
                    </button>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { label: 'Total Events', value: stats.total, color: 'text-white', bg: 'bg-white/5' },
                        { label: 'Planned', value: stats.planned, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                        { label: 'Unplanned', value: stats.unplanned, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                    ].map(s => (
                        <div key={s.label} className={`${s.bg} border border-white/10 rounded-xl p-4 text-center`}>
                            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                            <div className="text-xs text-white/60 mt-1 font-medium">{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px] max-w-xs">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search agent name..."
                            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
                        />
                    </div>

                    {/* Date Filter Presets */}
                    <div className="bg-white/5 p-0.5 rounded-lg flex items-center border border-white/10">
                        {(['today', '7d', '30d', 'all'] as const).map(d => (
                            <button
                                key={d}
                                onClick={() => { setDatePreset(d); setSpecificDate(''); }}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${datePreset === d ? 'bg-cyan-500 text-white' : 'text-white/50 hover:text-white'}`}
                            >
                                {d === 'today' ? 'Today' : d === '7d' ? '7 Days' : d === '30d' ? '30 Days' : 'All'}
                            </button>
                        ))}
                    </div>

                    {/* Specific Date Picker */}
                    <div className="relative flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-white/40" />
                        <input
                            type="date"
                            value={specificDate}
                            onChange={(e) => {
                                setSpecificDate(e.target.value);
                                if (e.target.value) setDatePreset('custom');
                                else setDatePreset('30d');
                            }}
                            className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500/50 [color-scheme:dark]"
                        />
                        {specificDate && (
                            <button
                                onClick={() => { setSpecificDate(''); setDatePreset('30d'); }}
                                className="text-white/40 hover:text-white/80 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Type Filter */}
                    <div className="bg-white/5 p-0.5 rounded-lg flex items-center border border-white/10">
                        {[
                            { key: 'all', label: 'All' },
                            { key: 'planned', label: 'Planned' },
                            { key: 'unplanned', label: 'Unplanned' },
                        ].map(t => (
                            <button
                                key={t.key}
                                onClick={() => setFilterType(t.key)}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filterType === t.key ? 'bg-cyan-500 text-white' : 'text-white/50 hover:text-white'}`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab Toggle */}
                    <div className="bg-white/5 p-0.5 rounded-lg flex items-center border border-white/10 ml-auto">
                        <button
                            onClick={() => setActiveTab('events')}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${activeTab === 'events' ? 'bg-cyan-500 text-white' : 'text-white/50 hover:text-white'}`}
                        >
                            <Activity className="w-3.5 h-3.5" /> Events
                        </button>
                        <button
                            onClick={() => setActiveTab('agents')}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${activeTab === 'agents' ? 'bg-cyan-500 text-white' : 'text-white/50 hover:text-white'}`}
                        >
                            <Users className="w-3.5 h-3.5" /> By Agent
                        </button>
                    </div>
                </div>

                {/* Content */}
                {activeTab === 'events' ? (
                    <Card className="bg-white/5 border-white/10 text-white overflow-hidden">
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-white/10 text-white/60">
                                            <th className="text-left p-3 font-medium cursor-pointer hover:text-white" onClick={() => toggleSort('name')}>
                                                <span className="flex items-center gap-1">Agent <SortIcon field="name" /></span>
                                            </th>
                                            <th className="text-left p-3 font-medium cursor-pointer hover:text-white" onClick={() => toggleSort('type')}>
                                                <span className="flex items-center gap-1">Type <SortIcon field="type" /></span>
                                            </th>
                                            <th className="text-left p-3 font-medium">Reason</th>
                                            <th className="text-left p-3 font-medium">Reported By</th>
                                            <th className="text-left p-3 font-medium cursor-pointer hover:text-white" onClick={() => toggleSort('date')}>
                                                <span className="flex items-center gap-1">Reported <SortIcon field="date" /></span>
                                            </th>
                                            <th className="text-center p-3 font-medium w-16"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedEvents.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="text-center p-8 text-white/40">
                                                    No attendance events found
                                                </td>
                                            </tr>
                                        ) : (
                                            sortedEvents.map(e => {
                                                const style = EVENT_STYLES[e.eventType] || EVENT_STYLES.unplanned;
                                                const isConfirming = confirmDeleteId === e.id;
                                                const isDeleting = deletingId === e.id;
                                                return (
                                                    <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors group">
                                                        <td className="p-3 font-medium text-white">
                                                            {e.agentName}
                                                        </td>
                                                        <td className="p-3">
                                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${style.color} ${style.bg}`}>
                                                                {style.label}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-white/60 max-w-[200px] truncate">{e.reason || '—'}</td>
                                                        <td className="p-3 text-white/60">{e.reportedBy || '—'}</td>
                                                        <td className="p-3 text-white/50 text-xs">{formatTimestampDisplay(e.reportedAt) || formatDateDisplay(e.date)}</td>
                                                        <td className="p-3 text-center">
                                                            {isConfirming ? (
                                                                <div className="flex items-center gap-1 justify-center">
                                                                    <button
                                                                        onClick={() => handleDelete(e.id)}
                                                                        disabled={isDeleting}
                                                                        className="text-[10px] font-bold px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors disabled:opacity-50"
                                                                    >
                                                                        {isDeleting ? '...' : 'Yes'}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setConfirmDeleteId(null)}
                                                                        className="text-[10px] font-bold px-2 py-1 rounded bg-white/10 text-white/60 hover:bg-white/20 transition-colors"
                                                                    >
                                                                        No
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={() => setConfirmDeleteId(e.id)}
                                                                    className="opacity-40 hover:opacity-100 transition-opacity text-white/30 hover:text-red-400 p-1 rounded hover:bg-red-500/10"
                                                                    title="Delete event"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="bg-white/5 border-white/10 text-white overflow-hidden">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base font-medium flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-cyan-400" />
                                Occurrence Scores by Agent
                                <span className="text-xs text-white/40 font-normal ml-2">
                                    Planned=0.5pt, Unplanned=1.5pt
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-white/10 text-white/60">
                                            <th className="text-left p-3 font-medium">#</th>
                                            <th className="text-left p-3 font-medium">Agent</th>
                                            <th className="text-center p-3 font-medium">Planned</th>
                                            <th className="text-center p-3 font-medium">Unplanned</th>
                                            <th className="text-center p-3 font-medium">Score</th>
                                            <th className="text-left p-3 font-medium">Latest</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {agentSummaries.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="text-center p-8 text-white/40">
                                                    No agents with attendance events
                                                </td>
                                            </tr>
                                        ) : (
                                            agentSummaries.map((a, i) => {
                                                const scoreColor = a.totalScore >= 6 ? 'text-red-400 bg-red-500/20'
                                                    : a.totalScore >= 3 ? 'text-amber-400 bg-amber-500/20'
                                                    : 'text-yellow-400 bg-yellow-500/20';
                                                return (
                                                    <tr key={a.name} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                                                        <td className="p-3">
                                                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i < 3 ? 'bg-red-500 text-white' : 'bg-white/10 text-white/60'}`}>
                                                                {i + 1}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 font-medium text-white">{a.name}</td>
                                                        <td className="text-center p-3 text-blue-400">{a.plannedCount || '—'}</td>
                                                        <td className="text-center p-3 text-amber-400">{a.unplannedCount || '—'}</td>
                                                        <td className="text-center p-3">
                                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${scoreColor}`}>
                                                                {a.totalScore}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-white/50 text-xs">{formatDateDisplay(a.latestDate)}</td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </DashboardLayout>
    );
}

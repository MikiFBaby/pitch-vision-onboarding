"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Activity, ShieldCheck } from "lucide-react";
import { deduplicateFired, deduplicateHired } from '@/lib/hr-utils';

type DepartureType = 'all' | 'terminated' | 'resigned';
type AttritionRange = '30d' | '60d' | '90d' | 'all';

interface TenureBucket {
    label: string;
    shortLabel: string;
    count: number;
    resigned: number;
    terminated: number;
    pct: number;
    color: string;
    bgColor: string;
}

interface ReasonEntry {
    reason: string;
    count: number;
    type: 'terminated' | 'resigned' | 'unknown';
}

const classifyDeparture = (reason: string): 'terminated' | 'resigned' | 'unknown' => {
    const r = (reason || '').toLowerCase().trim();
    if (r.includes('quit') || r.includes('resign')) return 'resigned';
    if (r.includes('fire') || r.includes('accounts removed') || r.includes('removed') || r.includes('performance') || r.includes('attendance')) return 'terminated';
    if (r) return 'terminated';
    return 'unknown';
};

export default function HRAttritionFunnel() {
    const [loading, setLoading] = useState(true);
    const [buckets, setBuckets] = useState<TenureBucket[]>([]);
    const [retentionRate, setRetentionRate] = useState(0);
    const [totalDepartures, setTotalDepartures] = useState(0);
    const [totalHires, setTotalHires] = useState(0);
    const [filter, setFilter] = useState<DepartureType>('all');
    const [dateRange, setDateRange] = useState<AttritionRange>('all');
    const [counts, setCounts] = useState({ terminated: 0, resigned: 0, total: 0 });
    const [reasons, setReasons] = useState<ReasonEntry[]>([]);

    const [rawData, setRawData] = useState<{ fires: any[]; hireDateMap: Map<string, string>; totalHires: number } | null>(null);

    const getDateCutoff = useCallback(() => {
        if (dateRange === 'all') return null;
        const now = new Date();
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        switch (dateRange) {
            case '30d': start.setDate(now.getDate() - 30); break;
            case '60d': start.setDate(now.getDate() - 60); break;
            case '90d': start.setDate(now.getDate() - 90); break;
        }
        return start.toLocaleDateString('en-CA');
    }, [dateRange]);

    const computeAll = useCallback((
        fires: any[],
        hireDateMap: Map<string, string>,
        activeFilter: DepartureType,
        dateCutoff: string | null,
    ) => {
        const makeBucket = () => ({ count: 0, resigned: 0, terminated: 0 });
        let week1 = makeBucket();
        let week2 = makeBucket();
        let month1 = makeBucket();
        let month2 = makeBucket();
        let month3 = makeBucket();
        let longTerm = makeBucket();
        let matched = 0;
        let terminatedCount = 0;
        let resignedCount = 0;
        const reasonCounts: Record<string, { count: number; type: 'terminated' | 'resigned' | 'unknown' }> = {};

        fires.forEach((f: any) => {
            const termDate = f['Termination Date'];
            if (!termDate) return;

            // Date range filter
            if (dateCutoff && termDate < dateCutoff) return;

            const classification = classifyDeparture(f['Fired/Quit']);
            if (classification === 'terminated') terminatedCount++;
            if (classification === 'resigned') resignedCount++;

            // Track termination reasons (for all, before type filter)
            const rawReason = (f['Reason for Termination'] || '').trim();
            if (rawReason) {
                if (!reasonCounts[rawReason]) reasonCounts[rawReason] = { count: 0, type: classification };
                reasonCounts[rawReason].count++;
            }

            // Apply type filter
            if (activeFilter !== 'all' && classification !== activeFilter) return;

            const name = (f['Agent Name'] || '').trim().toLowerCase();
            const hireDate = hireDateMap.get(name);
            if (!hireDate) return;

            const hire = new Date(hireDate);
            const term = new Date(termDate);
            const days = Math.floor((term.getTime() - hire.getTime()) / (1000 * 60 * 60 * 24));
            if (days < 0) return;

            matched++;

            const addTo = (bucket: typeof week1) => {
                bucket.count++;
                if (classification === 'resigned') bucket.resigned++;
                if (classification === 'terminated') bucket.terminated++;
            };

            if (days <= 7) addTo(week1);
            else if (days <= 14) addTo(week2);
            else if (days <= 30) addTo(month1);
            else if (days <= 60) addTo(month2);
            else if (days <= 90) addTo(month3);
            else addTo(longTerm);
        });

        const total = matched || 1;

        const bucketData: TenureBucket[] = [
            { label: "First Week", shortLabel: "0-7d", ...week1, pct: Math.round((week1.count / total) * 100), color: "text-red-400", bgColor: "bg-red-500" },
            { label: "Second Week", shortLabel: "8-14d", ...week2, pct: Math.round((week2.count / total) * 100), color: "text-orange-400", bgColor: "bg-orange-500" },
            { label: "First Month", shortLabel: "15-30d", ...month1, pct: Math.round((month1.count / total) * 100), color: "text-amber-400", bgColor: "bg-amber-500" },
            { label: "Month 2", shortLabel: "31-60d", ...month2, pct: Math.round((month2.count / total) * 100), color: "text-yellow-400", bgColor: "bg-yellow-500" },
            { label: "Month 3", shortLabel: "61-90d", ...month3, pct: Math.round((month3.count / total) * 100), color: "text-blue-400", bgColor: "bg-blue-500" },
            { label: "90+ Days", shortLabel: "90+", ...longTerm, pct: Math.round((longTerm.count / total) * 100), color: "text-emerald-400", bgColor: "bg-emerald-500" },
        ];

        // Process reasons - filter by type filter
        let filteredReasons = Object.entries(reasonCounts)
            .map(([reason, data]) => ({ reason, count: data.count, type: data.type }));

        if (activeFilter !== 'all') {
            filteredReasons = filteredReasons.filter(r => r.type === activeFilter);
        }

        filteredReasons.sort((a, b) => b.count - a.count);

        return {
            buckets: bucketData.filter(b => b.count > 0),
            matched,
            terminatedCount,
            resignedCount,
            reasons: filteredReasons.slice(0, 6),
        };
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [hiresRes, firesRes] = await Promise.all([
                supabase.from('HR Hired').select('"Agent Name", "Hire Date"'),
                supabase.from('HR Fired').select('"Agent Name", "Termination Date", "Fired/Quit", "Reason for Termination"'),
            ]);

            const hires = deduplicateHired(hiresRes.data || []);
            const fires = deduplicateFired(firesRes.data || []);

            const hireDateMap = new Map<string, string>();
            hires.forEach((h: any) => {
                const name = (h['Agent Name'] || '').trim().toLowerCase();
                if (name && h['Hire Date']) hireDateMap.set(name, h['Hire Date']);
            });

            setRawData({ fires, hireDateMap, totalHires: hires.length });
            setTotalHires(hires.length);

            const dateCutoff = getDateCutoff();
            const result = computeAll(fires, hireDateMap, filter, dateCutoff);
            setBuckets(result.buckets);
            setTotalDepartures(result.matched);
            setCounts({ terminated: result.terminatedCount, resigned: result.resignedCount, total: result.terminatedCount + result.resignedCount });
            setReasons(result.reasons);

            // Retention from "all" perspective
            const allResult = computeAll(fires, hireDateMap, 'all', dateCutoff);
            const departedIn30 = allResult.buckets
                .filter(b => ['0-7d', '8-14d', '15-30d'].includes(b.shortLabel))
                .reduce((sum, b) => sum + b.count, 0);
            const retention = hires.length > 0
                ? Math.round(((hires.length - departedIn30) / hires.length) * 100)
                : 100;
            setRetentionRate(retention);
        } catch (error) {
            console.error("Error fetching attrition funnel data:", error);
        } finally {
            setLoading(false);
        }
    }, [filter, computeAll, getDateCutoff]);

    // Re-compute locally when filter/dateRange changes
    useEffect(() => {
        if (!rawData) return;
        const dateCutoff = getDateCutoff();
        const result = computeAll(rawData.fires, rawData.hireDateMap, filter, dateCutoff);
        setBuckets(result.buckets);
        setTotalDepartures(result.matched);
        setReasons(result.reasons);
    }, [filter, dateRange, rawData, computeAll, getDateCutoff]);

    useEffect(() => {
        fetchData();

        const channels = [
            supabase.channel('attrition_funnel_hires').on('postgres_changes', { event: '*', schema: 'public', table: 'HR Hired' }, () => fetchData()).subscribe(),
            supabase.channel('attrition_funnel_fires').on('postgres_changes', { event: '*', schema: 'public', table: 'HR Fired' }, () => fetchData()).subscribe(),
        ];

        return () => { channels.forEach(c => supabase.removeChannel(c)); };
    }, [fetchData]);

    if (loading) {
        return <Skeleton className="h-[300px] w-full rounded-2xl" />;
    }

    const maxCount = Math.max(...buckets.map(b => b.count), 1);
    const maxReasonCount = Math.max(...reasons.map(r => r.count), 1);

    const REASON_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'];

    return (
        <Card className="bg-white/5 border-white/10 text-white overflow-hidden">
            <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <CardTitle className="text-lg font-medium flex items-center gap-2">
                        <Activity className="w-5 h-5 text-rose-400" />
                        Attrition Analysis
                    </CardTitle>
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Date Range Filter */}
                        <div className="bg-white/5 p-0.5 rounded-lg flex items-center border border-white/10">
                            {(['30d', '60d', '90d', 'all'] as AttritionRange[]).map((range) => (
                                <button
                                    key={range}
                                    onClick={() => setDateRange(range)}
                                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                                        dateRange === range
                                            ? 'bg-rose-500 text-white shadow-lg'
                                            : 'text-white/60 hover:text-white hover:bg-white/10'
                                    }`}
                                >
                                    {range === 'all' ? 'ALL' : range.toUpperCase()}
                                </button>
                            ))}
                        </div>
                        {/* Type Filter */}
                        <div className="bg-white/5 p-0.5 rounded-lg flex items-center border border-white/10">
                            {([
                                { value: 'all' as DepartureType, label: 'All' },
                                { value: 'terminated' as DepartureType, label: `Terminated (${counts.terminated})` },
                                { value: 'resigned' as DepartureType, label: `Resigned (${counts.resigned})` },
                            ]).map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => setFilter(option.value)}
                                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                                        filter === option.value
                                            ? 'bg-violet-500 text-white shadow-lg'
                                            : 'text-white/60 hover:text-white hover:bg-white/10'
                                    }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                        {/* Retention Badge */}
                        <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-1.5 border border-white/10">
                            <ShieldCheck className={`w-4 h-4 ${retentionRate >= 90 ? 'text-emerald-400' : retentionRate >= 75 ? 'text-amber-400' : 'text-red-400'}`} />
                            <div className="text-right">
                                <div className={`text-lg font-bold ${retentionRate >= 90 ? 'text-emerald-400' : retentionRate >= 75 ? 'text-amber-400' : 'text-red-400'}`}>
                                    {retentionRate}%
                                </div>
                                <div className="text-[10px] text-white/60 leading-tight">30-Day Retention</div>
                            </div>
                        </div>
                    </div>
                </div>
                <p className="text-xs text-white/70 mt-1">
                    Tenure distribution — {totalDepartures} {filter !== 'all' ? filter : ''} departures matched of {totalHires} total hires
                    {dateRange !== 'all' && ` (last ${dateRange})`}
                </p>
            </CardHeader>
            <CardContent>
                {buckets.length === 0 && reasons.length === 0 ? (
                    <div className="h-[180px] flex items-center justify-center text-white/60">
                        No departure data available for this period
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left: Tenure Funnel */}
                        <div>
                            <h4 className="text-sm font-medium text-white/70 mb-3">Tenure at Departure</h4>
                            {buckets.length === 0 ? (
                                <div className="h-[120px] flex items-center justify-center text-white/60 text-sm">
                                    No tenure data for this filter
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {buckets.map((bucket, i) => (
                                        <motion.div
                                            key={bucket.shortLabel}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: 0.4, delay: i * 0.06 }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-20 shrink-0">
                                                    <div className={`text-xs font-medium ${bucket.color}`}>{bucket.label}</div>
                                                    <div className="text-[10px] text-white/60">{bucket.shortLabel}</div>
                                                </div>
                                                <div className="flex-1 h-6 bg-white/5 rounded-lg overflow-hidden relative">
                                                    <motion.div
                                                        className={`h-full ${bucket.bgColor} rounded-lg opacity-80`}
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${(bucket.count / maxCount) * 100}%` }}
                                                        transition={{ duration: 0.8, delay: i * 0.08 }}
                                                    />
                                                    <div className="absolute inset-0 flex items-center px-2">
                                                        <span className="text-xs font-bold text-white drop-shadow-lg">
                                                            {bucket.count} ({bucket.pct}%)
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="w-24 shrink-0 text-right">
                                                    {filter === 'all' && (
                                                        <>
                                                            {bucket.resigned > 0 && <span className="text-xs text-orange-400">{bucket.resigned}R</span>}
                                                            {bucket.resigned > 0 && bucket.terminated > 0 && <span className="text-xs text-white/60"> / </span>}
                                                            {bucket.terminated > 0 && <span className="text-xs text-red-400">{bucket.terminated}T</span>}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}

                                    {/* 30-day insight */}
                                    {(() => {
                                        const first30 = buckets
                                            .filter(b => ['0-7d', '8-14d', '15-30d'].includes(b.shortLabel))
                                            .reduce((sum, b) => sum + b.count, 0);
                                        const pct30 = totalDepartures > 0 ? Math.round((first30 / totalDepartures) * 100) : 0;
                                        return (
                                            <div className="mt-3 pt-2 border-t border-white/10 flex items-center gap-2 text-xs text-white/70">
                                                <span className={`inline-block w-2 h-2 rounded-full ${pct30 >= 70 ? 'bg-red-500' : pct30 >= 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                                {pct30}% leave within the first 30 days
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* Right: Termination Reasons */}
                        <div>
                            <h4 className="text-sm font-medium text-white/70 mb-3">
                                Top {filter !== 'all' ? filter.charAt(0).toUpperCase() + filter.slice(1) : 'Departure'} Reasons
                            </h4>
                            {reasons.length === 0 ? (
                                <div className="h-[120px] flex items-center justify-center text-white/60 text-sm">
                                    No reason data for this filter
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {reasons.map((r, i) => (
                                        <motion.div
                                            key={r.reason}
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: 0.4, delay: i * 0.06 }}
                                            className="flex items-center gap-3"
                                        >
                                            <div className="flex-1 text-right">
                                                <span className="text-sm text-white/90 truncate" title={r.reason}>
                                                    {r.reason.length > 25 ? r.reason.slice(0, 25) + '...' : r.reason}
                                                </span>
                                            </div>
                                            <div className="w-32 h-5 bg-white/5 rounded-md overflow-hidden">
                                                <motion.div
                                                    className="h-full rounded-md"
                                                    style={{ backgroundColor: REASON_COLORS[i % REASON_COLORS.length] }}
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${(r.count / maxReasonCount) * 100}%` }}
                                                    transition={{ duration: 0.6, delay: i * 0.08 }}
                                                />
                                            </div>
                                            <div className="w-12 text-right">
                                                <span className="text-xs font-bold text-white">{r.count}</span>
                                            </div>
                                            <span className={`text-[10px] w-6 ${r.type === 'resigned' ? 'text-orange-400' : 'text-red-400'}`}>
                                                {r.type === 'resigned' ? 'R' : 'T'}
                                            </span>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

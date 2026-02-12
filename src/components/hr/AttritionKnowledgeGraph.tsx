"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import { deduplicateFired } from '@/lib/hr-utils';

type TypeFilter = 'all' | 'terminated' | 'resigned';
type DateRange = '30d' | '60d' | '90d' | '6m' | '1y' | 'all';

interface AttritionData {
    reason: string;
    count: number;
    type: 'Terminated' | 'Resigned';
}

export default function AttritionKnowledgeGraph() {
    const [rawData, setRawData] = useState<any[]>([]);
    const [data, setData] = useState<AttritionData[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [dateRange, setDateRange] = useState<DateRange>('all');

    const getDateCutoff = useCallback((range: DateRange): string | null => {
        if (range === 'all') return null;
        const now = new Date();
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        switch (range) {
            case '30d': start.setDate(now.getDate() - 30); break;
            case '60d': start.setDate(now.getDate() - 60); break;
            case '90d': start.setDate(now.getDate() - 90); break;
            case '6m': start.setMonth(now.getMonth() - 6); break;
            case '1y': start.setFullYear(now.getFullYear() - 1); break;
        }
        return start.toLocaleDateString('en-CA');
    }, []);

    const processData = useCallback((raw: any[], filter: TypeFilter, range: DateRange) => {
        const cutoff = getDateCutoff(range);
        const reasonCounts: Record<string, { count: number; type: 'Terminated' | 'Resigned' }> = {};

        raw.forEach((item: any) => {
            const termDate = (item['Termination Date'] || '').trim();
            if (cutoff && termDate && termDate < cutoff) return;

            const reason = (item['Reason for Termination'] || 'Unknown').trim();
            const firedQuit = (item['Fired/Quit'] || '').toString().toLowerCase();
            const type: 'Terminated' | 'Resigned' = firedQuit === 'quit' ? 'Resigned' : 'Terminated';

            if (filter === 'terminated' && type !== 'Terminated') return;
            if (filter === 'resigned' && type !== 'Resigned') return;

            if (!reasonCounts[reason]) {
                reasonCounts[reason] = { count: 0, type };
            }
            reasonCounts[reason].count += 1;
        });

        const chartData = Object.keys(reasonCounts).map(reason => ({
            reason,
            count: reasonCounts[reason].count,
            type: reasonCounts[reason].type,
        })).sort((a, b) => b.count - a.count);

        setData(chartData);
    }, [getDateCutoff]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const { data: firedData, error } = await supabase
                .from('HR Fired')
                .select('*');

            if (error) throw error;
            const dedupedData = deduplicateFired(firedData || []);
            setRawData(dedupedData);
            processData(dedupedData, typeFilter, dateRange);
        } catch (err) {
            console.error("Error fetching attrition data:", err);
            setRawData([]);
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [processData, typeFilter, dateRange]);

    // Re-process client-side when filters change
    useEffect(() => {
        if (rawData.length > 0) {
            processData(rawData, typeFilter, dateRange);
        }
    }, [typeFilter, dateRange, rawData, processData]);

    useEffect(() => {
        fetchData();

        const channel = supabase
            .channel('attrition_knowledge_graph')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'HR Fired' }, () => fetchData())
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchData]);

    const maxCount = Math.max(...data.map(d => d.count), 1);
    const totalCount = data.reduce((sum, d) => sum + d.count, 0);
    const terminatedCount = data.filter(d => d.type === 'Terminated').reduce((s, d) => s + d.count, 0);
    const resignedCount = data.filter(d => d.type === 'Resigned').reduce((s, d) => s + d.count, 0);
    const displayLimit = 8;
    const displayData = expanded ? data : data.slice(0, displayLimit);
    const remainingCount = data.length - displayLimit;

    const capitalize = (str: string) => {
        if (!str) return 'Unknown';
        return str.charAt(0).toUpperCase() + str.slice(1);
    };

    if (loading) {
        return (
            <div className="relative bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 backdrop-blur-xl rounded-3xl border border-white/10 p-6 overflow-hidden h-full">
                <div className="animate-pulse space-y-3">
                    <div className="h-6 w-64 bg-white/10 rounded" />
                    <div className="space-y-2 mt-6">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="h-10 bg-white/5 rounded-xl" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="relative bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 backdrop-blur-xl rounded-3xl border border-white/10 p-6 overflow-hidden"
        >
            {/* Glassmorphism overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] via-white/[0.05] to-transparent pointer-events-none" />

            {/* Header */}
            <div className="relative flex flex-col gap-4 mb-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-rose-500/20">
                            <TrendingDown className="w-6 h-6 text-rose-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white tracking-tight">Attrition Analysis</h3>
                            <p className="text-sm text-white/60">
                                Top reasons for talent loss
                                {dateRange !== 'all' && <span className="text-white/40"> &middot; Last {dateRange === '6m' ? '6 months' : dateRange === '1y' ? 'year' : dateRange}</span>}
                            </p>
                        </div>
                    </div>

                    {/* Summary badge */}
                    <div className="px-4 py-2 rounded-full bg-rose-500/20 text-rose-400">
                        <span className="text-2xl font-bold">{totalCount}</span>
                        <span className="text-sm ml-2 opacity-70">total</span>
                    </div>
                </div>

                {/* Filters Row */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Date Range Filter */}
                    <div className="bg-white/5 p-0.5 rounded-lg flex items-center border border-white/10">
                        {(['30d', '60d', '90d', '6m', '1y', 'all'] as DateRange[]).map((range) => (
                            <button
                                key={range}
                                onClick={() => setDateRange(range)}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                                    dateRange === range
                                        ? 'bg-rose-500 text-white shadow-lg'
                                        : 'text-white/60 hover:text-white hover:bg-white/10'
                                }`}
                            >
                                {range === 'all' ? 'ALL' : range === '6m' ? '6M' : range === '1y' ? '1Y' : range.toUpperCase()}
                            </button>
                        ))}
                    </div>

                    {/* Type Filter */}
                    <div className="bg-white/5 p-0.5 rounded-lg flex items-center border border-white/10">
                        {([
                            { value: 'all' as TypeFilter, label: 'All' },
                            { value: 'terminated' as TypeFilter, label: 'Terminated', color: 'rose' },
                            { value: 'resigned' as TypeFilter, label: 'Resigned', color: 'amber' },
                        ]).map((option) => (
                            <button
                                key={option.value}
                                onClick={() => setTypeFilter(option.value)}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                                    typeFilter === option.value
                                        ? 'bg-violet-500 text-white shadow-lg'
                                        : 'text-white/60 hover:text-white hover:bg-white/10'
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className="relative flex items-center gap-6 mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500" />
                    <span className="text-xs text-white/60">Terminated ({terminatedCount})</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-xs text-white/60">Resigned ({resignedCount})</span>
                </div>
            </div>

            {/* Bar chart */}
            <div className="relative space-y-2">
                {data.length === 0 ? (
                    <div className="h-[120px] flex items-center justify-center text-white/50 text-sm">
                        No attrition data for this period
                    </div>
                ) : (
                    <AnimatePresence mode="sync">
                        {displayData.map((item, index) => {
                            const percentage = (item.count / maxCount) * 100;
                            const isTerminated = item.type === 'Terminated';

                            return (
                                <motion.div
                                    key={item.reason}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.3, delay: index * 0.03 }}
                                    className="group relative"
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium text-white/80 leading-tight">
                                                {capitalize(item.reason)}
                                            </span>
                                            <span className={`text-sm font-bold ${isTerminated ? 'text-rose-400' : 'text-amber-400'}`}>
                                                {item.count}
                                            </span>
                                        </div>

                                        <div className="h-6 bg-white/5 rounded-lg overflow-hidden">
                                            <motion.div
                                                className={`h-full rounded-lg ${isTerminated
                                                    ? 'bg-gradient-to-r from-rose-600 to-rose-500'
                                                    : 'bg-gradient-to-r from-amber-600 to-amber-500'
                                                }`}
                                                initial={{ width: 0 }}
                                                animate={{ width: `${percentage}%` }}
                                                transition={{ duration: 0.6, delay: 0.1 + index * 0.03, ease: "easeOut" }}
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                )}

                {/* Expand/Collapse button */}
                {remainingCount > 0 && (
                    <motion.button
                        onClick={() => setExpanded(!expanded)}
                        className="w-full mt-3 py-2 px-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center gap-2 text-white/50 hover:text-white/80"
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                    >
                        {expanded ? (
                            <>
                                <ChevronUp className="w-4 h-4" />
                                <span className="text-sm">Show less</span>
                            </>
                        ) : (
                            <>
                                <ChevronDown className="w-4 h-4" />
                                <span className="text-sm">Show {remainingCount} more reasons</span>
                            </>
                        )}
                    </motion.button>
                )}
            </div>
        </motion.div>
    );
}

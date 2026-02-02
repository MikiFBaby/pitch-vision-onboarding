"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';

interface AttritionData {
    reason: string;
    count: number;
    type: 'Terminated' | 'Resigned';
}

export default function AttritionKnowledgeGraph() {
    const [data, setData] = useState<AttritionData[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        fetchAttritionData();
    }, []);

    const fetchAttritionData = async () => {
        try {
            const { data: firedData, error } = await supabase
                .from('HR Fired')
                .select('*');

            if (error) throw error;

            // Process data: Count reasons and use "Fired/Quit" column for classification
            const reasonCounts: Record<string, { count: number; type: 'Terminated' | 'Resigned' }> = {};

            firedData?.forEach((item: any) => {
                const reason = (item['Reason for Termination'] || 'Unknown').trim();
                const firedQuit = (item['Fired/Quit'] || '').toString().toLowerCase();

                // Use the "Fired/Quit" column to determine classification
                // "Quit" = Resigned
                // "Fired : Performance", "Fired : Attendance", "Accounts Removed" = Terminated
                const type = firedQuit === 'quit' ? 'Resigned' : 'Terminated';

                if (!reasonCounts[reason]) {
                    reasonCounts[reason] = { count: 0, type };
                }
                reasonCounts[reason].count += 1;
            });

            // Convert to array and sort by count
            const chartData = Object.keys(reasonCounts).map(reason => ({
                reason,
                count: reasonCounts[reason].count,
                type: reasonCounts[reason].type
            })).sort((a, b) => b.count - a.count);

            setData(chartData);
        } catch (err) {
            console.error("Error fetching attrition data:", err);
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    const maxCount = Math.max(...data.map(d => d.count), 1);
    const totalCount = data.reduce((sum, d) => sum + d.count, 0);
    const displayLimit = 8;
    const displayData = expanded ? data : data.slice(0, displayLimit);
    const remainingCount = data.length - displayLimit;

    // Capitalize first letter
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
            <div className="relative flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-rose-500/20">
                        <TrendingDown className="w-6 h-6 text-rose-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white tracking-tight">Attrition Analysis</h3>
                        <p className="text-sm text-white/50">Top reasons for talent loss</p>
                    </div>
                </div>

                {/* Summary badge */}
                <div className="px-4 py-2 rounded-full bg-rose-500/20 text-rose-400">
                    <span className="text-2xl font-bold">{totalCount}</span>
                    <span className="text-sm ml-2 opacity-70">total</span>
                </div>
            </div>

            {/* Legend - at top for quick understanding */}
            <div className="relative flex items-center gap-6 mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500" />
                    <span className="text-xs text-white/60">Terminated ({data.filter(d => d.type === 'Terminated').reduce((s, d) => s + d.count, 0)})</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-xs text-white/60">Resigned ({data.filter(d => d.type === 'Resigned').reduce((s, d) => s + d.count, 0)})</span>
                </div>
            </div>

            {/* Custom bar chart with full text labels */}
            <div className="relative space-y-2">
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
                                {/* Row with full-width label on top, bar below */}
                                <div className="space-y-1">
                                    {/* Full reason label - no truncation, wraps if needed */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-white/80 leading-tight">
                                            {capitalize(item.reason)}
                                        </span>
                                        <span className={`text-sm font-bold ${isTerminated ? 'text-rose-400' : 'text-amber-400'
                                            }`}>
                                            {item.count}
                                        </span>
                                    </div>

                                    {/* Bar */}
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

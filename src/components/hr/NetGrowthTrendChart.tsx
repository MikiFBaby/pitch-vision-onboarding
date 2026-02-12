"use client";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, Users, UserMinus, CalendarRange } from "lucide-react";
import { deduplicateFired, deduplicateHired } from '@/lib/hr-utils';

interface TrendDataPoint {
    date: string;
    label: string;
    hires: number;
    fires: number;
    net: number;
    cumulative: number;
}

type ChartRange = '30d' | '60d' | '90d' | 'custom';

export default function NetGrowthTrendChart() {
    const [data, setData] = useState<TrendDataPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    // Isolated date filter state
    const [chartRange, setChartRange] = useState<ChartRange>('30d');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    const getDateRange = useCallback(() => {
        const today = new Date();
        let startDate: Date;
        let endDate = today;

        if (chartRange === 'custom' && customFrom && customTo) {
            startDate = new Date(customFrom);
            endDate = new Date(customTo);
        } else {
            startDate = new Date(today);
            switch (chartRange) {
                case '30d': startDate.setDate(today.getDate() - 30); break;
                case '60d': startDate.setDate(today.getDate() - 60); break;
                case '90d': startDate.setDate(today.getDate() - 90); break;
                default: startDate.setDate(today.getDate() - 30); break;
            }
        }

        const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return { startStr: fmt(startDate), endStr: fmt(endDate), startDate, endDate };
    }, [chartRange, customFrom, customTo]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const { startStr, endStr, startDate, endDate } = getDateRange();

        const [hiresRes, firesRes] = await Promise.all([
            supabase.from('HR Hired').select('"Agent Name", "Hire Date"').gte('"Hire Date"', startStr).lte('"Hire Date"', endStr),
            supabase.from('HR Fired').select('"Agent Name", "Termination Date"').gte('"Termination Date"', startStr).lte('"Termination Date"', endStr),
        ]);

        const hires = deduplicateHired(hiresRes.data || []);
        const fires = deduplicateFired(firesRes.data || []);

        // Build date map
        const dateMap: Record<string, { hires: number; fires: number }> = {};
        const loopDate = new Date(startDate);
        while (loopDate <= endDate) {
            const key = `${loopDate.getFullYear()}-${String(loopDate.getMonth() + 1).padStart(2, '0')}-${String(loopDate.getDate()).padStart(2, '0')}`;
            dateMap[key] = { hires: 0, fires: 0 };
            loopDate.setDate(loopDate.getDate() + 1);
        }

        hires.forEach((h: any) => {
            const d = h['Hire Date'];
            if (d && dateMap[d]) dateMap[d].hires++;
        });

        fires.forEach((f: any) => {
            const d = f['Termination Date'];
            if (d && dateMap[d]) dateMap[d].fires++;
        });

        let cumulative = 0;
        const trendData: TrendDataPoint[] = Object.entries(dateMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, counts]) => {
                const net = counts.hires - counts.fires;
                cumulative += net;
                return {
                    date,
                    label: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    hires: counts.hires,
                    fires: counts.fires,
                    net,
                    cumulative,
                };
            });

        setData(trendData);
        setLoading(false);
    }, [getDateRange]);

    useEffect(() => {
        fetchData();

        const channels = [
            supabase.channel('net_growth_hires').on('postgres_changes', { event: '*', schema: 'public', table: 'HR Hired' }, () => fetchData()).subscribe(),
            supabase.channel('net_growth_fires').on('postgres_changes', { event: '*', schema: 'public', table: 'HR Fired' }, () => fetchData()).subscribe(),
        ];

        return () => { channels.forEach(c => supabase.removeChannel(c)); };
    }, [fetchData]);

    // Summary stats
    const totalHires = data.reduce((s, d) => s + d.hires, 0);
    const totalFires = data.reduce((s, d) => s + d.fires, 0);
    const totalNet = totalHires - totalFires;
    const isPositive = totalNet > 0;
    const isNegative = totalNet < 0;

    // Chart calculations
    const chartWidth = 900;
    const chartHeight = 240;
    const padding = { top: 30, right: 20, bottom: 30, left: 50 };

    const chartArea = useMemo(() => ({
        width: chartWidth - padding.left - padding.right,
        height: chartHeight - padding.top - padding.bottom,
    }), []);

    const { points, pathData, areaData, minVal, maxVal } = useMemo(() => {
        if (data.length < 2) return { points: [], pathData: '', areaData: '', minVal: 0, maxVal: 0 };

        const vals = data.map(d => d.cumulative);
        const minVal = Math.min(0, ...vals);
        const maxVal = Math.max(0, ...vals);
        const range = maxVal - minVal || 1;

        const points = data.map((d, i) => ({
            x: padding.left + (i / (data.length - 1)) * chartArea.width,
            y: padding.top + chartArea.height - ((d.cumulative - minVal) / range) * chartArea.height,
            data: d,
        }));

        const pathData = points.reduce((acc, p, i, arr) => {
            if (i === 0) return `M ${p.x} ${p.y}`;
            const prev = arr[i - 1];
            const t = 0.3;
            return `${acc} C ${prev.x + (p.x - prev.x) * t} ${prev.y}, ${p.x - (p.x - prev.x) * t} ${p.y}, ${p.x} ${p.y}`;
        }, "");

        const zeroY = padding.top + chartArea.height - ((0 - minVal) / range) * chartArea.height;
        const areaData = `${pathData} L ${points[points.length - 1].x} ${zeroY} L ${points[0].x} ${zeroY} Z`;

        return { points, pathData, areaData, minVal, maxVal };
    }, [data, chartArea]);

    const zeroLineY = useMemo(() => {
        if (data.length < 2) return chartHeight / 2;
        const range = maxVal - minVal || 1;
        return padding.top + chartArea.height - ((0 - minVal) / range) * chartArea.height;
    }, [data, maxVal, minVal, chartArea]);

    if (loading) {
        return <Skeleton className="h-[420px] w-full rounded-2xl" />;
    }

    return (
        <Card className="bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 border-white/10 text-white overflow-hidden">
            <CardHeader className="pb-3">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-2xl ${isPositive ? 'bg-emerald-500/20' : isNegative ? 'bg-rose-500/20' : 'bg-white/10'}`}>
                            {isPositive ? <TrendingUp className="w-6 h-6 text-emerald-400" /> :
                             isNegative ? <TrendingDown className="w-6 h-6 text-rose-400" /> :
                             <Minus className="w-6 h-6 text-white/60" />}
                        </div>
                        <div>
                            <CardTitle className="text-xl font-bold">Net Growth Trend</CardTitle>
                            <p className="text-sm text-white/50">Cumulative headcount change over time</p>
                        </div>
                    </div>

                    {/* Isolated date filter */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="bg-white/5 p-1 rounded-lg flex items-center border border-white/10">
                            {(['30d', '60d', '90d'] as const).map((r) => (
                                <button
                                    key={r}
                                    onClick={() => setChartRange(r)}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                                        chartRange === r
                                            ? 'bg-indigo-500 text-white shadow-lg'
                                            : 'text-white/50 hover:text-white hover:bg-white/10'
                                    }`}
                                >
                                    {r.toUpperCase()}
                                </button>
                            ))}
                            <button
                                onClick={() => setChartRange('custom')}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1 ${
                                    chartRange === 'custom'
                                        ? 'bg-indigo-500 text-white shadow-lg'
                                        : 'text-white/50 hover:text-white hover:bg-white/10'
                                }`}
                            >
                                <CalendarRange className="w-3.5 h-3.5" />
                                Custom
                            </button>
                        </div>

                        {chartRange === 'custom' && (
                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    value={customFrom}
                                    onChange={(e) => setCustomFrom(e.target.value)}
                                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white [color-scheme:dark]"
                                />
                                <span className="text-white/60 text-sm">to</span>
                                <input
                                    type="date"
                                    value={customTo}
                                    onChange={(e) => setCustomTo(e.target.value)}
                                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white [color-scheme:dark]"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </CardHeader>

            <CardContent>
                {/* Summary Stats Row */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-white/5 rounded-xl p-4 text-center border border-white/5">
                        <Users className="w-5 h-5 mx-auto mb-1.5 text-emerald-400" />
                        <div className="text-3xl font-bold text-emerald-400">{totalHires}</div>
                        <div className="text-sm text-white/50 font-medium">Hires</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 text-center border border-white/5">
                        <UserMinus className="w-5 h-5 mx-auto mb-1.5 text-rose-400" />
                        <div className="text-3xl font-bold text-rose-400">{totalFires}</div>
                        <div className="text-sm text-white/50 font-medium">Departures</div>
                    </div>
                    <div className={`rounded-xl p-4 text-center border ${
                        isPositive ? 'bg-emerald-500/10 border-emerald-500/20' :
                        isNegative ? 'bg-rose-500/10 border-rose-500/20' :
                        'bg-white/5 border-white/5'
                    }`}>
                        {isPositive ? <TrendingUp className="w-5 h-5 mx-auto mb-1.5 text-emerald-400" /> :
                         isNegative ? <TrendingDown className="w-5 h-5 mx-auto mb-1.5 text-rose-400" /> :
                         <Minus className="w-5 h-5 mx-auto mb-1.5 text-white/50" />}
                        <div className={`text-3xl font-bold ${
                            isPositive ? 'text-emerald-400' : isNegative ? 'text-rose-400' : 'text-white/60'
                        }`}>
                            {isPositive ? '+' : ''}{totalNet}
                        </div>
                        <div className="text-sm text-white/50 font-medium">Net Change</div>
                    </div>
                </div>

                {/* SVG Chart */}
                {data.length < 2 ? (
                    <div className="h-[200px] flex items-center justify-center text-white/60">
                        Not enough data for this period
                    </div>
                ) : (
                    <div className="relative">
                        <svg
                            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                            className="w-full h-[220px] overflow-visible"
                            preserveAspectRatio="xMidYMid meet"
                        >
                            <defs>
                                <linearGradient id="netGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={isPositive ? "#10b981" : "#f43f5e"} stopOpacity="0.3" />
                                    <stop offset="100%" stopColor={isPositive ? "#10b981" : "#f43f5e"} stopOpacity="0" />
                                </linearGradient>
                                <filter id="lineGlow" x="-50%" y="-50%" width="200%" height="200%">
                                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                                    <feMerge>
                                        <feMergeNode in="coloredBlur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            </defs>

                            {/* Zero line */}
                            <line
                                x1={padding.left} y1={zeroLineY}
                                x2={chartWidth - padding.right} y2={zeroLineY}
                                stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4"
                            />
                            <text x={padding.left - 8} y={zeroLineY + 4} textAnchor="end" className="text-[12px] fill-white/30 font-medium">0</text>

                            {/* Area fill */}
                            <motion.path
                                d={areaData} fill="url(#netGrowthGrad)"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                transition={{ duration: 0.8, delay: 0.3 }}
                            />

                            {/* Main line */}
                            <motion.path
                                d={pathData} fill="none"
                                stroke={isPositive ? "#10b981" : isNegative ? "#f43f5e" : "#6b7280"}
                                strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                                filter="url(#lineGlow)"
                                initial={{ pathLength: 0, opacity: 0 }}
                                animate={{ pathLength: 1, opacity: 1 }}
                                transition={{ duration: 1.2, ease: "easeInOut" }}
                            />

                            {/* Data points */}
                            {points.map((p, i) => (
                                <g key={i}
                                    onMouseEnter={() => setHoveredIndex(i)}
                                    onMouseLeave={() => setHoveredIndex(null)}
                                    className="cursor-pointer"
                                >
                                    <circle cx={p.x} cy={p.y} r="12" fill="transparent" />
                                    <motion.circle
                                        cx={p.x} cy={p.y}
                                        r={hoveredIndex === i ? 7 : 3.5}
                                        fill="#0f172a"
                                        stroke={isPositive ? "#10b981" : isNegative ? "#f43f5e" : "#6b7280"}
                                        strokeWidth="2"
                                        initial={{ scale: 0 }} animate={{ scale: 1 }}
                                        transition={{ delay: 0.3 + i * 0.02, type: "spring" }}
                                    />

                                    {hoveredIndex === i && (
                                        <g>
                                            <rect
                                                x={p.x - 70} y={p.y - 72}
                                                width="140" height="58" rx="10"
                                                fill="rgba(15, 23, 42, 0.95)" stroke="rgba(255,255,255,0.1)"
                                            />
                                            <text x={p.x} y={p.y - 54} textAnchor="middle" className="text-[12px] fill-white/50 font-medium">
                                                {p.data.label}
                                            </text>
                                            <text x={p.x} y={p.y - 36} textAnchor="middle"
                                                className={`text-[15px] font-bold ${p.data.cumulative >= 0 ? 'fill-emerald-400' : 'fill-rose-400'}`}>
                                                Net: {p.data.cumulative >= 0 ? '+' : ''}{p.data.cumulative}
                                            </text>
                                            <text x={p.x} y={p.y - 20} textAnchor="middle" className="text-[11px] fill-white/40">
                                                +{p.data.hires} hired / -{p.data.fires} departed
                                            </text>
                                        </g>
                                    )}
                                </g>
                            ))}
                        </svg>

                        {/* X-axis labels */}
                        <div className="flex justify-between px-12 mt-1">
                            {data.filter((_, i) => i % Math.ceil(data.length / 7) === 0 || i === data.length - 1).map((d, i) => (
                                <span key={i} className="text-xs text-white/60 font-medium">{d.label}</span>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

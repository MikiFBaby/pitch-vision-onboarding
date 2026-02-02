"use client";
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase-client";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TrendDataPoint {
    date: string;
    hires: number;
    fires: number;
    net: number;
    cumulative: number;
}

interface NetGrowthTrendChartProps {
    dateRange: 'daily' | 'weekly' | '30d' | '90d';
}

export default function NetGrowthTrendChart({ dateRange }: NetGrowthTrendChartProps) {
    const [data, setData] = useState<TrendDataPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    const getDaysToFetch = () => {
        switch (dateRange) {
            case 'daily': return 7;
            case 'weekly': return 14;
            case '30d': return 30;
            case '90d': return 90;
        }
    };

    useEffect(() => {
        const fetchTrendData = async () => {
            setLoading(true);
            const days = getDaysToFetch();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            const startDateStr = startDate.toISOString().split('T')[0];

            // Fetch hires with dates
            const { data: hires } = await supabase
                .from('HR Hired')
                .select('"Hire Date"')
                .gte('"Hire Date"', startDateStr);

            // Fetch fires with dates
            const { data: fires } = await supabase
                .from('HR Fired')
                .select('"Termination Date"')
                .gte('"Termination Date"', startDateStr);

            // Group by date
            const dateMap: Record<string, { hires: number; fires: number }> = {};

            // Initialize all dates in range
            for (let i = 0; i < days; i++) {
                const d = new Date();
                d.setDate(d.getDate() - (days - 1 - i));
                const dateStr = d.toISOString().split('T')[0];
                dateMap[dateStr] = { hires: 0, fires: 0 };
            }

            // Count hires per date
            hires?.forEach((h: any) => {
                const date = h['Hire Date'];
                if (date && dateMap[date]) {
                    dateMap[date].hires++;
                }
            });

            // Count fires per date
            fires?.forEach((f: any) => {
                const date = f['Termination Date'];
                if (date && dateMap[date]) {
                    dateMap[date].fires++;
                }
            });

            // Convert to array with running cumulative
            let cumulative = 0;
            const trendData: TrendDataPoint[] = Object.entries(dateMap)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, counts]) => {
                    const net = counts.hires - counts.fires;
                    cumulative += net;
                    return {
                        date,
                        hires: counts.hires,
                        fires: counts.fires,
                        net,
                        cumulative
                    };
                });

            setData(trendData);
            setLoading(false);
        };

        fetchTrendData();
    }, [dateRange]);

    // Calculate chart dimensions
    const chartWidth = 800;
    const chartHeight = 200;
    const padding = { top: 30, right: 20, bottom: 30, left: 40 };

    const chartArea = useMemo(() => ({
        width: chartWidth - padding.left - padding.right,
        height: chartHeight - padding.top - padding.bottom
    }), []);

    // Scale data to chart
    const { points, pathData, areaData, minVal, maxVal } = useMemo(() => {
        if (data.length === 0) return { points: [], pathData: '', areaData: '', minVal: 0, maxVal: 0 };

        const cumulativeValues = data.map(d => d.cumulative);
        const minVal = Math.min(0, ...cumulativeValues);
        const maxVal = Math.max(0, ...cumulativeValues);
        const range = maxVal - minVal || 1;

        const points = data.map((d, i) => {
            const x = padding.left + (i / (data.length - 1)) * chartArea.width;
            const y = padding.top + chartArea.height - ((d.cumulative - minVal) / range) * chartArea.height;
            return { x, y, data: d };
        });

        // Create smooth bezier curve path
        const pathData = points.reduce((acc, point, i, arr) => {
            if (i === 0) return `M ${point.x} ${point.y}`;
            const prev = arr[i - 1];
            const tension = 0.3;
            const cp1x = prev.x + (point.x - prev.x) * tension;
            const cp2x = point.x - (point.x - prev.x) * tension;
            return `${acc} C ${cp1x} ${prev.y}, ${cp2x} ${point.y}, ${point.x} ${point.y}`;
        }, "");

        // Zero line Y position for area
        const zeroY = padding.top + chartArea.height - ((0 - minVal) / range) * chartArea.height;

        // Area path (fill from line to zero line)
        const areaData = `${pathData} L ${points[points.length - 1].x} ${zeroY} L ${points[0].x} ${zeroY} Z`;

        return { points, pathData, areaData, minVal, maxVal };
    }, [data, chartArea]);

    // Calculate zero line position
    const zeroLineY = useMemo(() => {
        if (data.length === 0) return chartHeight / 2;
        const range = maxVal - minVal || 1;
        return padding.top + chartArea.height - ((0 - minVal) / range) * chartArea.height;
    }, [data, maxVal, minVal, chartArea]);

    // Overall trend
    const totalNet = data.reduce((sum, d) => sum + d.net, 0);
    const isPositive = totalNet > 0;
    const isNegative = totalNet < 0;

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    if (loading) {
        return (
            <div className="relative bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 backdrop-blur-xl rounded-3xl border border-white/10 p-6 overflow-hidden">
                <div className="animate-pulse">
                    <div className="h-6 w-48 bg-white/10 rounded mb-4" />
                    <div className="h-[200px] bg-white/5 rounded-2xl" />
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
                    <div className={`p-3 rounded-2xl ${isPositive ? 'bg-emerald-500/20' : isNegative ? 'bg-rose-500/20' : 'bg-white/10'}`}>
                        {isPositive ? (
                            <TrendingUp className={`w-6 h-6 text-emerald-400`} />
                        ) : isNegative ? (
                            <TrendingDown className={`w-6 h-6 text-rose-400`} />
                        ) : (
                            <Minus className={`w-6 h-6 text-white/60`} />
                        )}
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white tracking-tight">Net Growth Trend</h3>
                        <p className="text-sm text-white/50">Cumulative headcount change over time</p>
                    </div>
                </div>

                {/* Summary badge */}
                <div className={`px-4 py-2 rounded-full ${isPositive ? 'bg-emerald-500/20 text-emerald-400' :
                        isNegative ? 'bg-rose-500/20 text-rose-400' :
                            'bg-white/10 text-white/60'
                    }`}>
                    <span className="text-2xl font-bold">
                        {isPositive ? '+' : ''}{totalNet}
                    </span>
                    <span className="text-sm ml-2 opacity-70">net</span>
                </div>
            </div>

            {/* Chart */}
            <div className="relative">
                <svg
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    className="w-full h-[200px] overflow-visible"
                    preserveAspectRatio="xMidYMid meet"
                >
                    {/* Gradient definitions */}
                    <defs>
                        <linearGradient id="netGrowthGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={isPositive ? "#10b981" : "#f43f5e"} stopOpacity="0.4" />
                            <stop offset="100%" stopColor={isPositive ? "#10b981" : "#f43f5e"} stopOpacity="0" />
                        </linearGradient>
                        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    {/* Zero line */}
                    <motion.line
                        x1={padding.left}
                        y1={zeroLineY}
                        x2={chartWidth - padding.right}
                        y2={zeroLineY}
                        stroke="rgba(255,255,255,0.2)"
                        strokeDasharray="4 4"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 1 }}
                    />

                    {/* Area under curve */}
                    <motion.path
                        d={areaData}
                        fill="url(#netGrowthGradient)"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1, delay: 0.5 }}
                    />

                    {/* Main line */}
                    <motion.path
                        d={pathData}
                        fill="none"
                        stroke={isPositive ? "#10b981" : isNegative ? "#f43f5e" : "#6b7280"}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        filter="url(#glow)"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 1.5, ease: "easeInOut" }}
                    />

                    {/* Data points */}
                    {points.map((point, i) => (
                        <g
                            key={i}
                            onMouseEnter={() => setHoveredIndex(i)}
                            onMouseLeave={() => setHoveredIndex(null)}
                            className="cursor-pointer"
                        >
                            <motion.circle
                                cx={point.x}
                                cy={point.y}
                                r={hoveredIndex === i ? 8 : 4}
                                fill="#0f172a"
                                stroke={isPositive ? "#10b981" : isNegative ? "#f43f5e" : "#6b7280"}
                                strokeWidth="2"
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.5 + i * 0.05, type: "spring" }}
                            />

                            {/* Tooltip */}
                            {hoveredIndex === i && (
                                <motion.g
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                >
                                    <rect
                                        x={point.x - 50}
                                        y={point.y - 55}
                                        width="100"
                                        height="40"
                                        rx="8"
                                        fill="rgba(15, 23, 42, 0.95)"
                                        stroke="rgba(255,255,255,0.1)"
                                    />
                                    <text
                                        x={point.x}
                                        y={point.y - 40}
                                        textAnchor="middle"
                                        className="text-[11px] fill-white/60"
                                    >
                                        {formatDate(point.data.date)}
                                    </text>
                                    <text
                                        x={point.x}
                                        y={point.y - 25}
                                        textAnchor="middle"
                                        className={`text-[13px] font-bold ${point.data.cumulative >= 0 ? 'fill-emerald-400' : 'fill-rose-400'
                                            }`}
                                    >
                                        {point.data.cumulative >= 0 ? '+' : ''}{point.data.cumulative}
                                    </text>
                                </motion.g>
                            )}
                        </g>
                    ))}
                </svg>

                {/* X-axis labels */}
                <div className="flex justify-between px-10 mt-2">
                    {data.filter((_, i) => i % Math.ceil(data.length / 7) === 0 || i === data.length - 1).map((d, i) => (
                        <span key={i} className="text-[11px] text-white/40 font-medium">
                            {formatDate(d.date)}
                        </span>
                    ))}
                </div>
            </div>

            {/* Legend */}
            <div className="relative flex items-center justify-center gap-8 mt-4 pt-4 border-t border-white/5">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-xs text-white/50">Hires: {data.reduce((s, d) => s + d.hires, 0)}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500" />
                    <span className="text-xs text-white/50">Departures: {data.reduce((s, d) => s + d.fires, 0)}</span>
                </div>
            </div>
        </motion.div>
    );
}

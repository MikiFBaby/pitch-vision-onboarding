"use client";

import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CallData } from '@/types/qa-types';
import { TrendingUp } from 'lucide-react';

interface ComplianceTrendChartProps {
    calls: CallData[];
}

export const ComplianceTrendChart: React.FC<ComplianceTrendChartProps> = ({ calls }) => {
    // Aggregate scores by CALL DATE (not analyzed at date)
    const data = useMemo(() => {
        // Filter out calls with invalid scores (0 or null/undefined might be corrupted)
        const validCalls = calls.filter(c =>
            c.complianceScore !== undefined &&
            c.complianceScore !== null &&
            c.complianceScore > 0 // Filter out corrupted 0% records
        );

        // Group calls by call date (use callDate, fallback to timestamp)
        const byDate = new Map<string, { scores: number[]; fullDate: string; sortKey: number }>();

        validCalls.forEach(call => {
            // Use callDate if available, otherwise fall back to timestamp
            const dateSource = call.callDate || call.timestamp;
            const date = new Date(dateSource);
            const dateKey = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

            if (!byDate.has(dateKey)) {
                byDate.set(dateKey, {
                    scores: [],
                    fullDate: date.toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    }),
                    sortKey: date.getTime()
                });
            }
            byDate.get(dateKey)!.scores.push(call.complianceScore);
        });

        // Convert to array with average scores per day
        const result = Array.from(byDate.entries())
            .map(([date, { scores, fullDate, sortKey }]) => ({
                date,
                fullDate,
                score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
                callCount: scores.length,
                sortKey
            }))
            .sort((a, b) => a.sortKey - b.sortKey); // Sort by actual date timestamp

        return result;
    }, [calls]);

    const calculateTrend = () => {
        if (data.length < 2) return null;

        // Compare latest day to previous day
        const recent = data[data.length - 1]?.score || 0;
        const previous = data[data.length - 2]?.score || 0;
        const diff = recent - previous;

        if (diff === 0) return null;

        return {
            value: Math.abs(diff).toFixed(0),
            direction: diff >= 0 ? 'up' : 'down'
        };
    };

    const trend = calculateTrend();

    // Calculate average across all valid data
    const avgScore = data.length > 0
        ? Math.round(data.reduce((acc, d) => acc + d.score, 0) / data.length)
        : 0;

    return (
        <div className="glass-card rounded-2xl p-6 flex flex-col h-[320px] border border-white/10">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                        <TrendingUp size={20} className="text-indigo-400" />
                        Score Trend
                    </h3>
                    <p className="text-xs text-white/50 mt-1">
                        Daily average compliance score ({data.length} days)
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Average badge */}
                    <div className="text-right px-3 py-1 rounded-lg bg-indigo-500/20 text-indigo-400">
                        <p className="text-xs font-bold uppercase tracking-wider">Avg Score</p>
                        <p className="text-lg font-bold">{avgScore}%</p>
                    </div>

                    {/* Trend badge */}
                    {trend && (
                        <div className={`text-right px-3 py-1 rounded-lg ${trend.direction === 'up' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                            <p className="text-xs font-bold uppercase tracking-wider">vs Yesterday</p>
                            <p className="text-lg font-bold">
                                {trend.direction === 'up' ? '+' : '-'}{trend.value}%
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                        <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 500 }}
                            tickMargin={12}
                            interval="preserveStartEnd"
                            minTickGap={40}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 500 }}
                            domain={[0, 100]}
                            ticks={[0, 25, 50, 75, 100]}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(0,0,0,0.9)',
                                borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                                color: '#fff'
                            }}
                            cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '4 4' }}
                            labelStyle={{ color: 'rgba(255,255,255,0.7)', marginBottom: '4px', fontSize: '12px' }}
                            formatter={(value, name, props) => [
                                `${value}% avg (${props.payload?.callCount || 1} calls)`,
                                'Score'
                            ]}
                        />
                        <Area
                            type="monotone"
                            dataKey="score"
                            stroke="#6366f1"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorScore)"
                            animationDuration={1500}
                            activeDot={{ r: 6, strokeWidth: 4, stroke: '#000', fill: '#6366f1' }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default ComplianceTrendChart;

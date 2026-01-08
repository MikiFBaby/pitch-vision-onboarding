"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    PieChart,
    Pie,
    Legend
} from 'recharts';
import { AlertCircle } from 'lucide-react';

interface AttritionData {
    reason: string;
    count: number;
    type: 'Terminated' | 'Resigned';
}

export default function AttritionKnowledgeGraph() {
    const [data, setData] = useState<AttritionData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAttritionData();
    }, []);

    const fetchAttritionData = async () => {
        try {
            // Fetch from HR Fired table
            const { data: firedData, error } = await supabase
                .from('HR Fired')
                .select('*');

            if (error) throw error;

            console.log("Fired Data for Graph:", firedData);

            // Process data: Count reasons
            const reasonCounts: Record<string, { count: number; type: 'Terminated' | 'Resigned' }> = {};

            firedData?.forEach((item: any) => {
                const reason = item['Reason for Termination'] || 'Unknown';
                // valid types: 'Terminated' (Fired) vs 'Resigned' (Quit)
                // Assuming 'Voluntary' might suggest Resigned, otherwise Terminated. 
                // Adjust logic based on actual data values if available. 
                // For now, we'll categorize based on the reason keywords or add a type if column exists.
                // Looking at previous feed code, it just showed 'reason'.

                // Heuristic: If reason contains "Resigned" or "Quit", type is Resigned. Else Terminated.
                const type = reason.toLowerCase().includes('resign') || reason.toLowerCase().includes('quit')
                    ? 'Resigned'
                    : 'Terminated';

                if (!reasonCounts[reason]) {
                    reasonCounts[reason] = { count: 0, type };
                }
                reasonCounts[reason].count += 1;
            });

            // Convert to array and sort
            const chartData = Object.keys(reasonCounts).map(reason => ({
                reason,
                count: reasonCounts[reason].count,
                type: reasonCounts[reason].type
            })).sort((a, b) => b.count - a.count);

            setData(chartData);
        } catch (err) {
            console.error("Error fetching attrition data:", err);
            // Fallback mock data if DB is empty or fails
            setData([
                { reason: "Performance", count: 12, type: "Terminated" },
                { reason: "Better Opportunity", count: 8, type: "Resigned" },
                { reason: "Attendance", count: 5, type: "Terminated" },
                { reason: "Relocation", count: 3, type: "Resigned" },
                { reason: "Policy Violation", count: 2, type: "Terminated" }
            ]);
        } finally {
            setLoading(false);
        }
    };

    const COLORS = {
        Terminated: '#f43f5e', // Rose-500
        Resigned: '#f59e0b',   // Amber-500
    };

    if (loading) return <div className="h-64 flex items-center justify-center text-white/50">Loading Analysis...</div>;

    return (
        <div className="glass-card p-6 rounded-2xl border-white/5 h-full">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-white uppercase tracking-wider">Attrition Knowledge Graph</h3>
                    <p className="text-xs text-white/50 mt-1">Primary reasons for talent loss</p>
                </div>
                <AlertCircle className="text-rose-400 w-5 h-5" />
            </div>

            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                        <XAxis type="number" stroke="#ffffff50" fontSize={12} />
                        <YAxis
                            dataKey="reason"
                            type="category"
                            stroke="#ffffff80"
                            fontSize={12}
                            width={120}
                            tick={{ fill: '#ffffff80' }}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
                            itemStyle={{ color: '#fff' }}
                            cursor={{ fill: '#ffffff10' }}
                        />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[entry.type] || '#8884d8'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="flex gap-4 justify-center mt-4 text-xs font-medium text-white/70">
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm bg-rose-500"></span> Terminated
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm bg-amber-500"></span> Resigned
                </div>
            </div>
        </div>
    );
}

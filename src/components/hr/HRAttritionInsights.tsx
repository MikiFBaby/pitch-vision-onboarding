"use client";

import React, { useEffect, useState } from "react";
import {
    PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { supabase } from "@/lib/supabase-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingDown, UserMinus, LogOut } from "lucide-react";
import { deduplicateFired } from '@/lib/hr-utils';

interface HRAttritionInsightsProps {
    dateRange: 'daily' | 'weekly' | '30d' | '90d';
}

const COLORS = {
    fired: '#ef4444',   // Red
    quit: '#f97316',    // Orange
    reasons: ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e']
};

export default function HRAttritionInsights({ dateRange }: HRAttritionInsightsProps) {
    const [loading, setLoading] = useState(true);
    const [firedQuitData, setFiredQuitData] = useState<any[]>([]);
    const [reasonsData, setReasonsData] = useState<any[]>([]);
    const [campaignData, setCampaignData] = useState<any[]>([]);
    const [totals, setTotals] = useState({ fired: 0, quit: 0 });

    useEffect(() => {
        fetchData();

        // Realtime subscription
        const channel = supabase
            .channel('hr_attrition_insights')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'HR Fired' }, fetchData)
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [dateRange]);

    const getStartDate = () => {
        const now = new Date();
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        switch (dateRange) {
            case 'daily': return start;
            case 'weekly': start.setDate(now.getDate() - 7); break;
            case '30d': start.setDate(now.getDate() - 30); break;
            case '90d': start.setDate(now.getDate() - 90); break;
        }
        return start;
    };

    const fetchData = async () => {
        setLoading(true);
        const startDate = getStartDate();
        const startIso = startDate.toLocaleDateString('en-CA');

        try {
            const { data: rawDepartures } = await supabase
                .from('HR Fired')
                .select('*')
                .gte('Termination Date', startIso);

            const departures = deduplicateFired(rawDepartures || []);

            if (departures.length === 0) {
                setFiredQuitData([]);
                setReasonsData([]);
                setCampaignData([]);
                setTotals({ fired: 0, quit: 0 });
                setLoading(false);
                return;
            }

            // Fired vs Quit breakdown
            const firedCount = departures.filter(d => d['Fired/Quit']?.toLowerCase() === 'fired').length;
            const quitCount = departures.filter(d => d['Fired/Quit']?.toLowerCase() === 'quit').length;
            setTotals({ fired: firedCount, quit: quitCount });
            setFiredQuitData([
                { name: 'Fired', value: firedCount, color: COLORS.fired },
                { name: 'Quit', value: quitCount, color: COLORS.quit }
            ].filter(d => d.value > 0));

            // Reasons breakdown
            const reasonCounts: Record<string, number> = {};
            departures.forEach(d => {
                const reason = d['Reason for Termination'] || 'Unspecified';
                reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
            });
            const reasons = Object.entries(reasonCounts)
                .map(([name, value]) => ({ name: name.length > 20 ? name.slice(0, 20) + '...' : name, fullName: name, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 5);
            setReasonsData(reasons);

            // Campaign breakdown
            const campaignCounts: Record<string, number> = {};
            departures.forEach(d => {
                const campaign = d['Campaign'] || 'Unknown';
                campaignCounts[campaign] = (campaignCounts[campaign] || 0) + 1;
            });
            const campaigns = Object.entries(campaignCounts)
                .map(([name, value]) => ({ name: name.length > 15 ? name.slice(0, 15) + '...' : name, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 4);
            setCampaignData(campaigns);

        } catch (error) {
            console.error("Error fetching attrition data:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <Skeleton className="h-[300px] w-full rounded-2xl" />;
    }

    const total = totals.fired + totals.quit;

    return (
        <Card className="bg-white/5 border-white/10 text-white overflow-hidden">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                    <TrendingDown className="w-5 h-5 text-rose-400" />
                    Attrition Insights
                </CardTitle>
            </CardHeader>
            <CardContent>
                {total === 0 ? (
                    <div className="h-[200px] flex items-center justify-center text-white/30">
                        No departures in this period
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Fired vs Quit Donut */}
                        <div className="flex flex-col items-center">
                            <div className="h-[180px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={firedQuitData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={50}
                                            outerRadius={70}
                                            paddingAngle={4}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {firedQuitData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1a1a1a', border: 'none', borderRadius: '8px' }}
                                            formatter={(value: number) => [`${value} (${Math.round((value / total) * 100)}%)`, '']}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex gap-4 mt-2">
                                <div className="flex items-center gap-2">
                                    <UserMinus className="w-4 h-4 text-red-500" />
                                    <span className="text-sm text-white/70">Fired: <span className="text-white font-bold">{totals.fired}</span></span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <LogOut className="w-4 h-4 text-orange-500" />
                                    <span className="text-sm text-white/70">Quit: <span className="text-white font-bold">{totals.quit}</span></span>
                                </div>
                            </div>
                        </div>

                        {/* Top Reasons */}
                        <div className="lg:col-span-2">
                            <h4 className="text-sm font-medium text-white/60 mb-3">Top Termination Reasons</h4>
                            <div className="h-[180px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={reasonsData} layout="vertical" margin={{ left: 10, right: 20 }}>
                                        <XAxis type="number" stroke="#666" fontSize={11} tickLine={false} axisLine={false} />
                                        <YAxis
                                            dataKey="name"
                                            type="category"
                                            stroke="#888"
                                            fontSize={11}
                                            tickLine={false}
                                            axisLine={false}
                                            width={90}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                            contentStyle={{ backgroundColor: '#1a1a1a', border: 'none', borderRadius: '8px' }}
                                            formatter={(value, name, props) => [value, props.payload.fullName || name]}
                                        />
                                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                            {reasonsData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS.reasons[index % COLORS.reasons.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

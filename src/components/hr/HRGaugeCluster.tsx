"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { TrendingUp, TrendingDown, Users, UserMinus } from 'lucide-react';

interface GaugeData {
    hires: number;
    fires: number;
    netChange: number;
    hiresThisMonth: number;
    firesThisMonth: number;
    usHires: number;
    cadHires: number;
    campaignMix: { name: string; count: number }[];
    bookedDaysOff: number;
    nonBookedDaysOff: number;
}

interface HRGaugeClusterProps {
    dateRange: 'daily' | 'weekly' | '30d' | '90d';
}

export default function HRGaugeCluster({ dateRange }: HRGaugeClusterProps) {
    const getStartDate = () => {
        const now = new Date();
        const start = new Date(now);
        switch (dateRange) {
            case 'daily': start.setHours(0, 0, 0, 0); break; // Start of TODAY
            case 'weekly': start.setDate(now.getDate() - 7); break;
            case '30d': start.setDate(now.getDate() - 30); break;
            case '90d': start.setDate(now.getDate() - 90); break;
        }
        return start;
    };

    const [data, setData] = useState<GaugeData>({
        hires: 0,
        fires: 0,
        netChange: 0,
        hiresThisMonth: 0,
        firesThisMonth: 0,
        usHires: 0,
        cadHires: 0,
        campaignMix: [],
        bookedDaysOff: 0,
        nonBookedDaysOff: 0
    });

    const fetchData = async () => {
        const startDate = getStartDate();
        const startIso = startDate.toISOString();
        const startDateOnly = startDate.toISOString().split('T')[0];

        // Fetch total hires count (all time)
        const { count: totalHires } = await supabase
            .from('HR Hired')
            .select('*', { count: 'exact', head: true });

        // Fetch total fires count (all time)
        const { count: totalFires } = await supabase
            .from('HR Fired')
            .select('*', { count: 'exact', head: true });

        // --- 1. Hires for the selected date range ---
        const { data: hires } = await supabase
            .from('HR Hired')
            .select('created_at, "Canadian/American", Campaign')
            .gte('created_at', startIso);

        // --- 2. Fires for the selected date range ---
        const { data: fires } = await supabase
            .from('HR Fired')
            .select('created_at')
            .gte('created_at', startIso);

        // --- 3. Booked Days Off for the selected date range ---
        const { data: booked } = await supabase
            .from('Booked Days Off')
            .select('Date')
            .gte('Date', startDateOnly);

        // --- 4. Non Booked Days Off for the selected date range ---
        const { data: nonBooked } = await supabase
            .from('Non Booked Days Off')
            .select('Date')
            .gte('Date', startDateOnly);

        // Analyze Hires
        let us = 0;
        let cad = 0;
        const campaigns: Record<string, number> = {};

        hires?.forEach((h: any) => {
            const loc = h['Canadian/American']?.toLowerCase() || '';
            if (loc.includes('us') || loc.includes('american') || loc.includes('usa')) us++;
            else if (loc.includes('can') || loc.includes('cad')) cad++;

            const camp = h['Campaign'] || 'Unknown';
            campaigns[camp] = (campaigns[camp] || 0) + 1;
        });

        // Top 3 Campaigns
        const sortedCampaigns = Object.entries(campaigns)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

        setData({
            hires: totalHires || 0,
            fires: totalFires || 0,
            netChange: (totalHires || 0) - (totalFires || 0),
            hiresThisMonth: hires?.length || 0,
            firesThisMonth: fires?.length || 0,
            usHires: us,
            cadHires: cad,
            campaignMix: sortedCampaigns,
            bookedDaysOff: booked?.length || 0,
            nonBookedDaysOff: nonBooked?.length || 0
        });
    };

    useEffect(() => {
        fetchData();

        const channels = [
            supabase.channel('hr_dashboard_hires').on('postgres_changes', { event: '*', schema: 'public', table: 'HR Hired' }, () => fetchData()).subscribe(),
            supabase.channel('hr_dashboard_fires').on('postgres_changes', { event: '*', schema: 'public', table: 'HR Fired' }, () => fetchData()).subscribe(),
            supabase.channel('hr_dashboard_booked').on('postgres_changes', { event: '*', schema: 'public', table: 'Booked Days Off' }, () => fetchData()).subscribe(),
            supabase.channel('hr_dashboard_nonbooked').on('postgres_changes', { event: '*', schema: 'public', table: 'Non Booked Days Off' }, () => fetchData()).subscribe(),
        ];

        return () => {
            channels.forEach(channel => supabase.removeChannel(channel));
        };
    }, [dateRange]);

    const getNetChangeIcon = () => {
        if (data.netChange > 0) return <TrendingUp size={20} className="text-white" />;
        if (data.netChange < 0) return <TrendingDown size={20} className="text-white" />;
        return <Users size={20} className="text-white" />;
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {/* Hires Gauge */}
            <div className="bg-gradient-to-br from-green-50 to-white p-6 rounded-2xl border-2 border-green-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-green-500 rounded-lg shadow-sm">
                        <Users className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">New Hires</h3>
                        <p className="text-[10px] text-gray-400">Selected Period</p>
                    </div>
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-gray-900">{data.hiresThisMonth}</span>
                </div>
                {data.hiresThisMonth > 0 && (
                    <div className="mt-3 text-xs text-green-600 font-medium flex items-center gap-1">
                        <TrendingUp size={12} />
                        <span>Active hiring</span>
                    </div>
                )}
            </div>

            {/* Fires Gauge */}
            <div className="bg-gradient-to-br from-red-50 to-white p-6 rounded-2xl border-2 border-red-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-red-500 rounded-lg shadow-sm">
                        <UserMinus className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Departures</h3>
                        <p className="text-[10px] text-gray-400">Selected Period</p>
                    </div>
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-gray-900">{data.firesThisMonth}</span>
                </div>
                {data.firesThisMonth > 0 && (
                    <div className="mt-3 text-xs text-red-600 font-medium flex items-center gap-1">
                        <TrendingDown size={12} />
                        <span>attrition detected</span>
                    </div>
                )}
            </div>

            {/* Net Change Gauge */}
            <div className="bg-gradient-to-br from-blue-50 to-white p-6 rounded-2xl border-2 border-blue-100 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 rounded-lg shadow-sm ${data.netChange >= 0 ? 'bg-blue-500' : 'bg-orange-500'}`}>
                        {getNetChangeIcon()}
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Net Growth</h3>
                        <p className="text-[10px] text-gray-400">Total Headcount Change</p>
                    </div>
                </div>
                <div className="flex items-baseline gap-2">
                    <span className={`text-4xl font-bold ${data.netChange >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                        {data.netChange > 0 ? '+' : ''}{data.netChange}
                    </span>
                </div>
                <div className="mt-3 flex gap-2 text-[10px] font-medium text-gray-500">
                    <span>Total: {data.hires} In</span>
                    <span>•</span>
                    <span>{data.fires} Out</span>
                </div>
            </div>

            {/* Geographic Mix Gauge */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm xl:col-span-1">
                <div className="mb-4">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Hiring Region</h3>
                    <p className="text-[10px] text-gray-400">US vs CAD Split</p>
                </div>

                <div className="space-y-4">
                    {/* US Bar */}
                    <div>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="font-semibold text-gray-700">USA</span>
                            <span className="text-gray-500">{data.usHires}</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${data.hiresThisMonth ? (data.usHires / data.hiresThisMonth) * 100 : 0}%` }}
                            />
                        </div>
                    </div>

                    {/* CAD Bar */}
                    <div>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="font-semibold text-gray-700">Canada</span>
                            <span className="text-gray-500">{data.cadHires}</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-red-500 rounded-full"
                                style={{ width: `${data.hiresThisMonth ? (data.cadHires / data.hiresThisMonth) * 100 : 0}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Campaign Mix Gauge */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm xl:col-span-1">
                <div className="mb-4">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Top Campaigns</h3>
                    <p className="text-[10px] text-gray-400">By Hires Volume</p>
                </div>

                <div className="space-y-3">
                    {data.campaignMix.length === 0 ? (
                        <div className="text-xs text-gray-400 italic">No data available</div>
                    ) : (
                        data.campaignMix.map((c, i) => (
                            <div key={c.name} className="flex items-center justify-between text-xs">
                                <span className="font-medium text-gray-700 truncate max-w-[100px]" title={c.name}>
                                    {c.name}
                                </span>
                                <div className="flex items-center gap-2">
                                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-500 rounded-full"
                                            style={{ width: `${(c.count / data.hiresThisMonth) * 100}%` }}
                                        />
                                    </div>
                                    <span className="text-gray-500 w-3 text-right">{c.count}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Booked Days Off Gauge */}
            <div className="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-2xl border-2 border-indigo-100 shadow-sm xl:col-span-1">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-500 rounded-lg shadow-sm">
                        <Users className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Booked Time Off</h3>
                        <p className="text-[10px] text-gray-400">Planned Absences</p>
                    </div>
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-gray-900">{data.bookedDaysOff}</span>
                </div>
                {data.bookedDaysOff > 0 && (
                    <div className="mt-3 text-xs text-indigo-600 font-medium flex items-center gap-1">
                        <span>Scheduled</span>
                    </div>
                )}
            </div>

            {/* Non Booked Days Off Gauge */}
            <div className="bg-gradient-to-br from-orange-50 to-white p-6 rounded-2xl border-2 border-orange-100 shadow-sm xl:col-span-1">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-orange-500 rounded-lg shadow-sm">
                        <UserMinus className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Unplanned Absence</h3>
                        <p className="text-[10px] text-gray-400">No-Shows / Emergency</p>
                    </div>
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-gray-900">{data.nonBookedDaysOff}</span>
                </div>
                {data.nonBookedDaysOff > 0 && (
                    <div className="mt-3 text-xs text-orange-600 font-medium flex items-center gap-1">
                        <TrendingDown size={12} />
                        <span>Attention needed</span>
                    </div>
                )}
            </div>
        </div>
    );
}

"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Users, UserMinus, Globe, Briefcase } from 'lucide-react';
import { deduplicateFired, deduplicateHired } from '@/lib/hr-utils';

interface GaugeData {
    hires: number;
    fires: number;
    netChange: number;
    hiresThisMonth: number;
    firesThisMonth: number;
    usHires: number;
    cadHires: number;
    campaignMix: { name: string; count: number }[];
}

interface HRGaugeClusterProps {
    dateRange: 'daily' | 'weekly' | '30d' | '90d';
}

// Sleek metric card component
const MetricCard = ({
    icon: Icon,
    label,
    sublabel,
    value,
    trend,
    trendLabel,
    accentColor,
    delay = 0
}: {
    icon: React.ElementType;
    label: string;
    sublabel: string;
    value: number | string;
    trend?: 'up' | 'down' | null;
    trendLabel?: string;
    accentColor: string;
    delay?: number;
}) => {
    const colorMap: Record<string, { bg: string; text: string; glow: string }> = {
        emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', glow: 'shadow-emerald-500/20' },
        rose: { bg: 'bg-rose-500/20', text: 'text-rose-400', glow: 'shadow-rose-500/20' },
        blue: { bg: 'bg-blue-500/20', text: 'text-blue-400', glow: 'shadow-blue-500/20' },
        indigo: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', glow: 'shadow-indigo-500/20' },
        amber: { bg: 'bg-amber-500/20', text: 'text-amber-400', glow: 'shadow-amber-500/20' },
        violet: { bg: 'bg-violet-500/20', text: 'text-violet-400', glow: 'shadow-violet-500/20' },
    };

    const colors = colorMap[accentColor] || colorMap.blue;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay }}
            className="group relative bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-5 overflow-hidden hover:border-white/20 transition-all duration-300"
        >
            {/* Subtle glow effect on hover */}
            <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${colors.glow} shadow-2xl`} />

            {/* Glassmorphism overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] via-white/[0.05] to-transparent pointer-events-none" />

            <div className="relative">
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2.5 rounded-xl ${colors.bg}`}>
                        <Icon className={`w-4 h-4 ${colors.text}`} />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-white/90 uppercase tracking-wider">{label}</h3>
                        <p className="text-xs text-white/70">{sublabel}</p>
                    </div>
                </div>

                {/* Value */}
                <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-white tracking-tight">{value}</span>
                </div>

                {/* Trend indicator */}
                {trend && trendLabel && (
                    <div className={`mt-3 flex items-center gap-1 text-xs font-medium ${trend === 'up' ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                        {trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        <span>{trendLabel}</span>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

// Geographic distribution mini-chart
const GeoDistributionCard = ({ usHires, cadHires, total, delay }: { usHires: number; cadHires: number; total: number; delay: number }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay }}
        className="relative bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-5 overflow-hidden"
    >
        <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] via-white/[0.05] to-transparent pointer-events-none" />

        <div className="relative">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-violet-500/20">
                    <Globe className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-white/90 uppercase tracking-wider">Hiring Region</h3>
                    <p className="text-xs text-white/70">Geographic Split</p>
                </div>
            </div>

            <div className="space-y-4">
                {/* USA */}
                <div>
                    <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-medium text-white/90">USA</span>
                        <span className="text-white/70">{usHires}</span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${total ? (usHires / total) * 100 : 0}%` }}
                            transition={{ duration: 1, delay: delay + 0.2 }}
                        />
                    </div>
                </div>

                {/* Canada */}
                <div>
                    <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-medium text-white/90">Canada</span>
                        <span className="text-white/70">{cadHires}</span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-gradient-to-r from-rose-500 to-rose-400 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${total ? (cadHires / total) * 100 : 0}%` }}
                            transition={{ duration: 1, delay: delay + 0.3 }}
                        />
                    </div>
                </div>
            </div>
        </div>
    </motion.div>
);

// Campaign distribution mini-chart
const CampaignMixCard = ({ campaigns, total, delay }: { campaigns: { name: string; count: number }[]; total: number; delay: number }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay }}
        className="relative bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-5 overflow-hidden"
    >
        <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] via-white/[0.05] to-transparent pointer-events-none" />

        <div className="relative">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-indigo-500/20">
                    <Briefcase className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-white/90 uppercase tracking-wider">Top Campaigns</h3>
                    <p className="text-xs text-white/70">By Volume</p>
                </div>
            </div>

            <div className="space-y-3">
                {campaigns.length === 0 ? (
                    <div className="text-xs text-white/60 italic">No data available</div>
                ) : (
                    campaigns.map((c, i) => (
                        <div key={c.name} className="flex items-center justify-between">
                            <span className="text-sm font-medium text-white/90 truncate max-w-[100px]" title={c.name}>
                                {c.name}
                            </span>
                            <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${total ? (c.count / total) * 100 : 0}%` }}
                                        transition={{ duration: 0.8, delay: delay + 0.1 * i }}
                                    />
                                </div>
                                <span className="text-sm text-white/70 w-4 text-right">{c.count}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    </motion.div>
);

/** Local YYYY-MM-DD (avoids UTC timezone shift from toISOString) */
function toLocalDateString(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Effective working day — weekends roll back to last Friday */
function getEffectiveToday(): Date {
    const now = new Date();
    const jsDay = now.getDay();
    if (jsDay === 0) now.setDate(now.getDate() - 2); // Sun → Fri
    if (jsDay === 6) now.setDate(now.getDate() - 1); // Sat → Fri
    return now;
}

export default function HRGaugeCluster({ dateRange }: HRGaugeClusterProps) {
    const getDateRange = () => {
        const effectiveToday = getEffectiveToday();
        const endDate = toLocalDateString(effectiveToday);

        const start = new Date(effectiveToday);
        switch (dateRange) {
            case 'daily': break; // start = same as end (just today / effective today)
            case 'weekly': start.setDate(start.getDate() - 7); break;
            case '30d': start.setDate(start.getDate() - 30); break;
            case '90d': start.setDate(start.getDate() - 90); break;
        }
        return { startDate: toLocalDateString(start), endDate };
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
    });

    const fetchData = async () => {
        const { startDate: startDateOnly, endDate: endDateOnly } = getDateRange();

        // Fetch all-time totals (actual data for dedup, not head count)
        const [allHiresRes, allFiresRes, hiresRes, firesRes] = await Promise.all([
            supabase.from('HR Hired').select('"Agent Name", "Hire Date"'),
            supabase.from('HR Fired').select('"Agent Name", "Termination Date"'),
            supabase.from('HR Hired').select('"Agent Name", "Hire Date", "Canadian/American", Campaign').gte('"Hire Date"', startDateOnly).lte('"Hire Date"', endDateOnly),
            supabase.from('HR Fired').select('"Agent Name", "Termination Date"').gte('"Termination Date"', startDateOnly).lte('"Termination Date"', endDateOnly),
        ]);

        const totalHires = deduplicateHired(allHiresRes.data || []).length;
        const totalFires = deduplicateFired(allFiresRes.data || []).length;
        const hires = deduplicateHired(hiresRes.data || []);
        const fires = deduplicateFired(firesRes.data || []);

        let us = 0;
        let cad = 0;
        const campaigns: Record<string, number> = {};

        hires.forEach((h: any) => {
            const loc = h['Canadian/American']?.toLowerCase() || '';
            if (loc.includes('us') || loc.includes('american') || loc.includes('usa')) us++;
            else if (loc.includes('can') || loc.includes('cad')) cad++;

            const camp = h['Campaign'] || 'Unknown';
            campaigns[camp] = (campaigns[camp] || 0) + 1;
        });

        const sortedCampaigns = Object.entries(campaigns)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

        setData({
            hires: totalHires,
            fires: totalFires,
            netChange: hires.length - fires.length,
            hiresThisMonth: hires.length,
            firesThisMonth: fires.length,
            usHires: us,
            cadHires: cad,
            campaignMix: sortedCampaigns,
        });
    };

    useEffect(() => {
        fetchData();

        const channels = [
            supabase.channel('hr_dashboard_hires').on('postgres_changes', { event: '*', schema: 'public', table: 'HR Hired' }, () => fetchData()).subscribe(),
            supabase.channel('hr_dashboard_fires').on('postgres_changes', { event: '*', schema: 'public', table: 'HR Fired' }, () => fetchData()).subscribe(),
        ];

        return () => {
            channels.forEach(channel => supabase.removeChannel(channel));
        };
    }, [dateRange]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <MetricCard
                icon={Users}
                label="New Hires"
                sublabel="Selected Period"
                value={data.hiresThisMonth}
                trend={data.hiresThisMonth > 0 ? 'up' : null}
                trendLabel={data.hiresThisMonth > 0 ? 'Active hiring' : undefined}
                accentColor="emerald"
                delay={0}
            />

            <MetricCard
                icon={UserMinus}
                label="Departures"
                sublabel="Selected Period"
                value={data.firesThisMonth}
                trend={data.firesThisMonth > 0 ? 'down' : null}
                trendLabel={data.firesThisMonth > 0 ? 'attrition detected' : undefined}
                accentColor="rose"
                delay={0.1}
            />

            <MetricCard
                icon={data.netChange >= 0 ? TrendingUp : TrendingDown}
                label="Net Growth"
                sublabel={`${data.hires} In • ${data.fires} Out`}
                value={`${data.netChange > 0 ? '+' : ''}${data.netChange}`}
                accentColor={data.netChange >= 0 ? 'blue' : 'amber'}
                delay={0.2}
            />

            <GeoDistributionCard
                usHires={data.usHires}
                cadHires={data.cadHires}
                total={data.hiresThisMonth}
                delay={0.3}
            />

            <CampaignMixCard
                campaigns={data.campaignMix}
                total={data.hiresThisMonth}
                delay={0.4}
            />
        </div>
    );
}

"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase-client";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";
import {
    Clock, Users, MapPin, Briefcase, Calendar, TrendingDown,
    AlertTriangle, CheckCircle2
} from "lucide-react";

interface TenureData {
    type: string;
    avgDays: number;
    count: number;
}

interface AbsenceAgentData {
    name: string;
    absences: number;
}

interface DayOfWeekData {
    day: string;
    count: number;
}

interface CampaignData {
    campaign: string;
    count: number;
}

interface GeoData {
    region: string;
    count: number;
}

const COLORS = ['#f43f5e', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'];

export default function HRAdvancedAnalytics() {
    const [tenureData, setTenureData] = useState<TenureData[]>([]);
    const [survivalRate, setSurvivalRate] = useState<number>(0);
    const [absenceByAgent, setAbsenceByAgent] = useState<AbsenceAgentData[]>([]);
    const [dayOfWeekAbsences, setDayOfWeekAbsences] = useState<DayOfWeekData[]>([]);
    const [campaignAttrition, setCampaignAttrition] = useState<CampaignData[]>([]);
    const [geoAttrition, setGeoAttrition] = useState<GeoData[]>([]);
    const [loading, setLoading] = useState(true);
    const [hiresCount, setHiresCount] = useState(0);
    const [terminationsCount, setTerminationsCount] = useState(0);

    useEffect(() => {
        fetchAllData();
    }, []);

    const fetchAllData = async () => {
        setLoading(true);
        try {
            await Promise.all([
                fetchTenureAnalysis(),
                fetch90DaySurvival(),
                fetchAbsenceByAgent(),
                fetchDayOfWeekAbsences(),
                fetchCampaignAttrition(),
                fetchGeoAttrition()
            ]);
        } catch (error) {
            console.error("Error fetching analytics:", error);
        } finally {
            setLoading(false);
        }
    };

    // 1. Tenure Analysis
    const fetchTenureAnalysis = async () => {
        const { data: fired } = await supabase.from('HR Fired').select('*');
        if (!fired) return;

        const tenureByType: Record<string, { totalDays: number; count: number }> = {
            'Terminated': { totalDays: 0, count: 0 },
            'Resigned': { totalDays: 0, count: 0 }
        };

        fired.forEach(emp => {
            const hireDate = emp['Hire Date'] ? new Date(emp['Hire Date']) : null;
            const termDate = emp['Termination Date'] ? new Date(emp['Termination Date']) : null;
            const firedQuit = (emp['Fired/Quit'] || '').toString().toLowerCase();
            const type = firedQuit === 'quit' ? 'Resigned' : 'Terminated';

            if (hireDate && termDate && !isNaN(hireDate.getTime()) && !isNaN(termDate.getTime())) {
                const days = Math.floor((termDate.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24));
                if (days > 0 && days < 3650) { // Sanity check: less than 10 years
                    tenureByType[type].totalDays += days;
                    tenureByType[type].count++;
                }
            }
        });

        const result = Object.entries(tenureByType).map(([type, data]) => ({
            type,
            avgDays: data.count > 0 ? Math.round(data.totalDays / data.count) : 0,
            count: data.count
        }));

        setTenureData(result);
    };

    // 2. 90-Day Survival Rate
    const fetch90DaySurvival = async () => {
        const { data: hired } = await supabase.from('HR Hired').select('*');
        const { data: fired } = await supabase.from('HR Fired').select('*');

        if (!hired || !fired) return;

        setHiresCount(hired.length);
        setTerminationsCount(fired.length);

        // Count employees who left within 90 days
        let leftWithin90 = 0;
        fired.forEach(emp => {
            const hireDate = emp['Hire Date'] ? new Date(emp['Hire Date']) : null;
            const termDate = emp['Termination Date'] ? new Date(emp['Termination Date']) : null;

            if (hireDate && termDate && !isNaN(hireDate.getTime()) && !isNaN(termDate.getTime())) {
                const days = Math.floor((termDate.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24));
                if (days <= 90 && days >= 0) {
                    leftWithin90++;
                }
            }
        });

        // Survival rate = (Total hires - Left within 90 days) / Total hires
        const rate = hired.length > 0 ? ((hired.length - leftWithin90) / hired.length) * 100 : 0;
        setSurvivalRate(Math.round(rate));
    };

    // 3. Absence Frequency by Agent
    const fetchAbsenceByAgent = async () => {
        const { data: absences } = await supabase.from('Non Booked Days Off').select('*');
        if (!absences) return;

        const agentCounts: Record<string, number> = {};
        absences.forEach(item => {
            const name = `${item['First Name'] || ''} ${item['Last Name'] || ''}`.trim();
            if (name) {
                agentCounts[name] = (agentCounts[name] || 0) + 1;
            }
        });

        const sorted = Object.entries(agentCounts)
            .map(([name, absences]) => ({ name, absences }))
            .sort((a, b) => b.absences - a.absences)
            .slice(0, 15);

        setAbsenceByAgent(sorted);
    };

    // 4. Day-of-Week Absence Patterns
    const fetchDayOfWeekAbsences = async () => {
        const { data: absences } = await supabase.from('Non Booked Days Off').select('*');
        if (!absences) return;

        const dayCounts: Record<string, number> = {
            'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0
        };
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        absences.forEach(item => {
            const dateStr = item['Date'];
            if (dateStr) {
                const date = new Date(dateStr);
                if (!isNaN(date.getTime())) {
                    const dayName = dayNames[date.getDay()];
                    if (dayCounts[dayName] !== undefined) {
                        dayCounts[dayName]++;
                    }
                }
            }
        });

        const result = Object.entries(dayCounts).map(([day, count]) => ({ day, count }));
        setDayOfWeekAbsences(result);
    };

    // 5. Campaign-Level Attrition
    const fetchCampaignAttrition = async () => {
        const { data: fired } = await supabase.from('HR Fired').select('*');
        if (!fired) return;

        const campaignCounts: Record<string, number> = {};
        fired.forEach(emp => {
            const campaign = (emp['Campaign'] || 'Unknown').toString().trim();
            campaignCounts[campaign] = (campaignCounts[campaign] || 0) + 1;
        });

        const sorted = Object.entries(campaignCounts)
            .map(([campaign, count]) => ({ campaign, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);

        setCampaignAttrition(sorted);
    };

    // 6. Geographic Attrition
    const fetchGeoAttrition = async () => {
        const { data: fired } = await supabase.from('HR Fired').select('*');
        if (!fired) return;

        const geoCounts: Record<string, number> = { 'Canadian': 0, 'American': 0, 'Other': 0 };
        fired.forEach(emp => {
            const region = (emp['Canadian/American'] || '').toString().trim();
            if (region.toLowerCase().includes('canad')) {
                geoCounts['Canadian']++;
            } else if (region.toLowerCase().includes('americ')) {
                geoCounts['American']++;
            } else {
                geoCounts['Other']++;
            }
        });

        const result = Object.entries(geoCounts)
            .filter(([_, count]) => count > 0)
            .map(([region, count]) => ({ region, count }));

        setGeoAttrition(result);
    };

    if (loading) {
        return (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-80 rounded-2xl bg-white/5 animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {/* 1. Tenure Analysis */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative p-6 rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/10 overflow-hidden h-80"
            >
                <div className="absolute inset-0 bg-gradient-to-tr from-rose-500/5 to-transparent pointer-events-none" />

                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-xl bg-rose-500/20">
                        <Clock className="w-5 h-5 text-rose-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">Tenure Analysis</h3>
                        <p className="text-xs text-white/50">Avg days before departure</p>
                    </div>
                </div>

                <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={tenureData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                            <YAxis dataKey="type" type="category" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }} width={80} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                labelStyle={{ color: 'white' }}
                                formatter={(value: number, name: string) => [`${value} days`, 'Avg Tenure']}
                            />
                            <Bar dataKey="avgDays" fill="#f43f5e" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="flex justify-center gap-6 mt-2 text-xs text-white/50">
                    {tenureData.map(t => (
                        <span key={t.type}>{t.type}: {t.count} employees</span>
                    ))}
                </div>
            </motion.div>

            {/* 2. 90-Day Survival Rate */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="relative p-6 rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/10 overflow-hidden h-80"
            >
                <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/5 to-transparent pointer-events-none" />

                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-xl bg-emerald-500/20">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">90-Day Survival Rate</h3>
                        <p className="text-xs text-white/50">New hire retention after 90 days</p>
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center h-48">
                    <div className="relative w-36 h-36">
                        <svg className="w-full h-full -rotate-90">
                            <circle
                                cx="72"
                                cy="72"
                                r="60"
                                fill="none"
                                stroke="rgba(255,255,255,0.1)"
                                strokeWidth="12"
                            />
                            <circle
                                cx="72"
                                cy="72"
                                r="60"
                                fill="none"
                                stroke={survivalRate >= 80 ? '#10b981' : survivalRate >= 60 ? '#f59e0b' : '#f43f5e'}
                                strokeWidth="12"
                                strokeDasharray={`${(survivalRate / 100) * 377} 377`}
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-4xl font-bold text-white">{survivalRate}%</span>
                        </div>
                    </div>
                    <div className="mt-4 flex gap-4 text-xs text-white/50">
                        <span>Total Hires: {hiresCount}</span>
                        <span>•</span>
                        <span>Total Departures: {terminationsCount}</span>
                    </div>
                </div>
            </motion.div>

            {/* 3. Absence Frequency by Agent */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="relative p-6 rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/10 overflow-hidden h-80"
            >
                <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/5 to-transparent pointer-events-none" />

                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-xl bg-amber-500/20">
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">Top Absence Frequency</h3>
                        <p className="text-xs text-white/50">Agents with most unplanned absences</p>
                    </div>
                </div>

                <div className="h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                    <div className="space-y-2">
                        {absenceByAgent.slice(0, 10).map((agent, i) => (
                            <div key={agent.name} className="flex items-center gap-3">
                                <span className="text-xs text-white/40 w-4">{i + 1}</span>
                                <div className="flex-1">
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-white/80 truncate max-w-[140px]">{agent.name}</span>
                                        <span className="text-amber-400 font-bold">{agent.absences}</span>
                                    </div>
                                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full"
                                            style={{ width: `${(agent.absences / (absenceByAgent[0]?.absences || 1)) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* 4. Day-of-Week Absence Patterns */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="relative p-6 rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/10 overflow-hidden h-80"
            >
                <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/5 to-transparent pointer-events-none" />

                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-xl bg-cyan-500/20">
                        <Calendar className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">Day-of-Week Patterns</h3>
                        <p className="text-xs text-white/50">When unplanned absences occur</p>
                    </div>
                </div>

                <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dayOfWeekAbsences}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
                            <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                labelStyle={{ color: 'white' }}
                            />
                            <Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </motion.div>

            {/* 5. Campaign-Level Attrition */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="relative p-6 rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/10 overflow-hidden h-80"
            >
                <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/5 to-transparent pointer-events-none" />

                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-xl bg-purple-500/20">
                        <Briefcase className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">Attrition by Campaign</h3>
                        <p className="text-xs text-white/50">Which campaigns have highest turnover</p>
                    </div>
                </div>

                <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={campaignAttrition}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={70}
                                paddingAngle={2}
                                dataKey="count"
                                nameKey="campaign"
                            >
                                {campaignAttrition.map((entry, index) => (
                                    <Cell key={entry.campaign} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                labelStyle={{ color: 'white' }}
                            />
                            <Legend
                                wrapperStyle={{ fontSize: '10px' }}
                                formatter={(value) => <span className="text-white/70">{value}</span>}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </motion.div>

            {/* 6. Geographic Attrition */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="relative p-6 rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/10 overflow-hidden h-80"
            >
                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-transparent pointer-events-none" />

                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-xl bg-indigo-500/20">
                        <MapPin className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">Geographic Attrition</h3>
                        <p className="text-xs text-white/50">Canada vs USA departures</p>
                    </div>
                </div>

                <div className="h-48 flex items-center justify-center">
                    <div className="flex gap-8">
                        {geoAttrition.map((geo, index) => {
                            const total = geoAttrition.reduce((s, g) => s + g.count, 0);
                            const percentage = total > 0 ? Math.round((geo.count / total) * 100) : 0;

                            return (
                                <div key={geo.region} className="text-center">
                                    <div
                                        className="w-24 h-24 rounded-2xl flex items-center justify-center mb-3"
                                        style={{
                                            background: index === 0
                                                ? 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.05))'
                                                : 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(99,102,241,0.05))',
                                            border: '1px solid rgba(255,255,255,0.1)'
                                        }}
                                    >
                                        <div className="text-center">
                                            <div className="text-3xl font-bold text-white">{geo.count}</div>
                                            <div className="text-xs text-white/50">{percentage}%</div>
                                        </div>
                                    </div>
                                    <span className="text-sm text-white/70">{geo.region}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

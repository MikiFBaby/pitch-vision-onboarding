"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase-client";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, Legend,
    AreaChart, Area, ReferenceLine
} from "recharts";
import {
    Clock, Users, MapPin, Briefcase, Calendar, TrendingDown,
    AlertTriangle, CheckCircle2, Activity
} from "lucide-react";
import { deduplicateFired, deduplicateHired, deduplicateUnplannedOff, deduplicateBookedOff } from '@/lib/hr-utils';

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
    booked: number;
    unplanned: number;
}

interface AttendanceTimelineData {
    date: string;
    rate: number;
    absent: number;
    scheduled: number;
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
    const [attendanceTimeline, setAttendanceTimeline] = useState<AttendanceTimelineData[]>([]);
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
                fetchAttendanceTimeline(),
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
        const { data: rawFired } = await supabase.from('HR Fired').select('*');
        const fired = deduplicateFired(rawFired || []);
        if (fired.length === 0) return;

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
        const { data: rawHired } = await supabase.from('HR Hired').select('*');
        const { data: rawFired } = await supabase.from('HR Fired').select('*');

        const hired = deduplicateHired(rawHired || []);
        const fired = deduplicateFired(rawFired || []);

        if (hired.length === 0) return;

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
        const { data: rawAbsences } = await supabase.from('Non Booked Days Off').select('*');
        const absences = deduplicateUnplannedOff(rawAbsences || []);
        if (absences.length === 0) return;

        const agentCounts: Record<string, number> = {};
        absences.forEach(item => {
            const name = (item['Agent Name'] || '').trim();
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

    // 4. Day-of-Week Absence Patterns (both booked + unplanned)
    const fetchDayOfWeekAbsences = async () => {
        const [{ data: rawUnplanned }, { data: rawBooked }] = await Promise.all([
            supabase.from('Non Booked Days Off').select('*'),
            supabase.from('Booked Days Off').select('*'),
        ]);

        const unplanned = deduplicateUnplannedOff(rawUnplanned || []);
        const booked = deduplicateBookedOff(rawBooked || []);

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const bookedCounts: Record<string, number> = { 'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0 };
        const unplannedCounts: Record<string, number> = { 'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0 };

        const parseDateDay = (dateStr: string) => {
            if (!dateStr) return null;
            const parts = dateStr.split('-');
            const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            return !isNaN(date.getTime()) ? dayNames[date.getDay()] : null;
        };

        booked.forEach(item => {
            const dayName = parseDateDay(item['Date']);
            if (dayName && bookedCounts[dayName] !== undefined) bookedCounts[dayName]++;
        });

        unplanned.forEach(item => {
            const dayName = parseDateDay(item['Date']);
            if (dayName && unplannedCounts[dayName] !== undefined) unplannedCounts[dayName]++;
        });

        const result: DayOfWeekData[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => ({
            day,
            booked: bookedCounts[day],
            unplanned: unplannedCounts[day],
        }));

        setDayOfWeekAbsences(result);
    };

    // 4b. Attendance Rate Timeline (last 30 weekdays)
    const fetchAttendanceTimeline = async () => {
        const [{ data: rawBooked }, { data: rawUnplanned }, { data: employeeData }] = await Promise.all([
            supabase.from('Booked Days Off').select('"Agent Name", Date'),
            supabase.from('Non Booked Days Off').select('"Agent Name", Date'),
            supabase.from('employee_directory').select('first_name, last_name').eq('employee_status', 'Active').eq('role', 'Agent'),
        ]);

        const booked = deduplicateBookedOff(rawBooked || []);
        const unplanned = deduplicateUnplannedOff(rawUnplanned || []);

        // Fetch all schedule pages
        let allSchedules: any[] = [];
        let from = 0;
        const PAGE_SIZE = 1000;
        while (true) {
            const { data: page } = await supabase.from('Agent Schedule').select('*').range(from, from + PAGE_SIZE - 1);
            if (!page || page.length === 0) break;
            allSchedules = allSchedules.concat(page);
            if (page.length < PAGE_SIZE) break;
            from += PAGE_SIZE;
        }

        // Build active employee keys
        const activeKeys = new Set(
            (employeeData || []).map(e =>
                `${(e.first_name || '').trim().toLowerCase()} ${(e.last_name || '').trim().toLowerCase()}`
            )
        );

        // Pre-compute scheduled counts per day of week
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const scheduledPerDay: Record<string, number> = {};
        for (const day of dayNames) {
            const seen = new Set<string>();
            let count = 0;
            allSchedules.forEach(agent => {
                const key = `${(agent['First Name'] || '').trim().toLowerCase()} ${(agent['Last Name'] || '').trim().toLowerCase()}`;
                const shift = agent[day];
                if (activeKeys.has(key) && !seen.has(key) && shift && shift.trim() !== '' && shift.trim().toLowerCase() !== 'off') {
                    seen.add(key);
                    count++;
                }
            });
            scheduledPerDay[day] = count;
        }

        // Calculate daily attendance rate for last 30 days (weekdays only)
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);

        const formatDateKey = (d: Date) => d.toLocaleDateString('en-CA');
        const data: AttendanceTimelineData[] = [];
        const loopDate = new Date(startDate);

        while (loopDate <= endDate) {
            const jsDay = loopDate.getDay();
            if (jsDay !== 0 && jsDay !== 6) {
                const dateStr = formatDateKey(loopDate);
                const dayName = dayNames[jsDay];
                const scheduled = scheduledPerDay[dayName] || 0;

                const bookedNames = new Set(
                    booked.filter(b => b.Date === dateStr).map(b => (b['Agent Name'] || '').trim().toLowerCase())
                );
                const unplannedNames = new Set<string>();
                unplanned.filter(nb => nb.Date === dateStr).forEach(nb => {
                    const name = (nb['Agent Name'] || '').trim().toLowerCase();
                    if (!bookedNames.has(name)) unplannedNames.add(name);
                });
                const totalAbsent = bookedNames.size + unplannedNames.size;

                const rate = scheduled > 0
                    ? Math.round(((scheduled - totalAbsent) / scheduled) * 100)
                    : 100;

                data.push({
                    date: loopDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    rate: Math.max(0, Math.min(100, rate)),
                    absent: totalAbsent,
                    scheduled,
                });
            }
            loopDate.setDate(loopDate.getDate() + 1);
        }

        setAttendanceTimeline(data);
    };

    // 5. Campaign-Level Attrition
    const fetchCampaignAttrition = async () => {
        const { data: rawFired } = await supabase.from('HR Fired').select('*');
        const fired = deduplicateFired(rawFired || []);
        if (fired.length === 0) return;

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
        const { data: rawFired } = await supabase.from('HR Fired').select('*');
        const fired = deduplicateFired(rawFired || []);
        if (fired.length === 0) return;

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
                        <p className="text-sm text-white/70">Avg days before departure</p>
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

                <div className="flex justify-center gap-6 mt-2 text-sm text-white/70">
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
                        <p className="text-sm text-white/70">New hire retention after 90 days</p>
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
                    <div className="mt-4 flex gap-4 text-sm text-white/70">
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
                        <p className="text-sm text-white/70">Agents with most unplanned absences</p>
                    </div>
                </div>

                <div className="h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                    <div className="space-y-2">
                        {absenceByAgent.slice(0, 10).map((agent, i) => (
                            <div key={agent.name} className="flex items-center gap-3">
                                <span className="text-sm text-white/60 w-4">{i + 1}</span>
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

            {/* 4a. Attendance Rate Timeline */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="relative p-6 rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/10 overflow-hidden col-span-1 lg:col-span-2 xl:col-span-3"
            >
                <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/5 to-transparent pointer-events-none" />

                <div className="flex items-center gap-3 mb-1">
                    <div className="p-2 rounded-xl bg-emerald-500/20">
                        <Activity className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">Attendance Rate Timeline</h3>
                        <p className="text-sm text-white/50">
                            Daily workforce attendance over the last 30 days (weekdays only)
                        </p>
                    </div>
                </div>
                <div className="mb-3 px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/10">
                    <p className="text-sm text-white/90 leading-relaxed">
                        <strong className="text-white">How to read this chart:</strong> Each point shows what percentage of scheduled agents actually showed up that day. For example, if 400 agents were scheduled and 20 were absent (booked off or unplanned), the rate is <span className="text-emerald-400 font-medium">95%</span>. Higher is better. The dashed yellow line marks the <span className="text-amber-400 font-medium">90% target</span> — dips below it signal days with above-normal absences.
                    </p>
                    <p className="text-xs text-white/70 mt-1.5">
                        Data sources: Agent Schedule (who&apos;s scheduled) + Booked Days Off + Non Booked Days Off (who was absent)
                    </p>
                </div>

                <div className="h-56">
                    {attendanceTimeline.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={attendanceTimeline}>
                                <defs>
                                    <linearGradient id="advAttendanceGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} tickLine={false} axisLine={false} domain={[60, 100]} tickFormatter={(v) => `${v}%`} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                    labelStyle={{ color: '#888' }}
                                    formatter={(value: number, name: string) => {
                                        if (name === 'Attendance') return [`${value}%`, name];
                                        return [value, name];
                                    }}
                                />
                                <ReferenceLine y={90} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: '90% target', fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }} />
                                <Area
                                    type="monotone"
                                    dataKey="rate"
                                    name="Attendance"
                                    stroke="#10b981"
                                    strokeWidth={2.5}
                                    fill="url(#advAttendanceGradient)"
                                    dot={false}
                                    activeDot={{ r: 5, fill: '#10b981' }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-white/40 text-sm">
                            No attendance data available
                        </div>
                    )}
                </div>
                {attendanceTimeline.length > 0 && (
                    <div className="flex items-center justify-between mt-3 text-sm text-white/90 px-1">
                        <span>Avg: <strong className="text-white">{Math.round(attendanceTimeline.reduce((s, d) => s + d.rate, 0) / attendanceTimeline.length)}%</strong></span>
                        <span>Weekdays only &bull; Dashed line = 90% target</span>
                        <span>Low: <strong className="text-white">{Math.min(...attendanceTimeline.map(d => d.rate))}%</strong> &bull; High: <strong className="text-white">{Math.max(...attendanceTimeline.map(d => d.rate))}%</strong></span>
                    </div>
                )}
            </motion.div>

            {/* 4b. Day-of-Week Absence Patterns */}
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
                        <h3 className="text-lg font-semibold text-white">Absence Patterns by Day</h3>
                        <p className="text-sm text-white/70">Booked vs unplanned absences by weekday</p>
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
                            <Legend
                                wrapperStyle={{ fontSize: '11px' }}
                                formatter={(value) => <span className="text-white/70">{value}</span>}
                            />
                            <Bar dataKey="booked" name="Booked" fill="#6366f1" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="unplanned" name="Unplanned" fill="#f43f5e" radius={[4, 4, 0, 0]} />
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
                        <p className="text-sm text-white/70">Which campaigns have highest turnover</p>
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
                        <p className="text-sm text-white/70">Canada vs USA departures</p>
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
                                            <div className="text-sm text-white/70">{percentage}%</div>
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

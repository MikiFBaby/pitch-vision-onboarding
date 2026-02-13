"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase-client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Coffee, Clock, Search, Users, Activity, BarChart2 } from "lucide-react";
import StatsCard from "@/components/dashboard/StatsCard";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import ScheduleAIChat from "@/components/hr/schedule/ScheduleAIChat";
import EmployeeProfileDrawer from "@/components/hr/EmployeeProfileDrawer";

function formatBreakTime(raw: string | null | undefined): string {
    if (!raw || raw.trim() === '-' || !raw.trim()) return '-';
    const val = raw.trim();
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime()) && val.length > 10) {
        const h = parsed.getHours();
        const m = parsed.getMinutes();
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
    }
    return val;
}

export default function AgentSchedulePage() {
    const [scheduleData, setScheduleData] = useState<any[]>([]);
    const [breakData, setBreakData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    // Metrics State
    const [agentsToday, setAgentsToday] = useState(0);
    const [weeklyHours, setWeeklyHours] = useState("0");
    const [avgAgentHours, setAvgAgentHours] = useState("0");
    const [coverageData, setCoverageData] = useState<any[]>([]);
    const [hoursContext, setHoursContext] = useState("This Week");

    useEffect(() => {
        const fetchAllRows = async (table: string) => {
            const PAGE_SIZE = 1000;
            let all: any[] = [];
            let offset = 0;
            while (true) {
                const { data: page } = await supabase
                    .from(table)
                    .select('*')
                    .range(offset, offset + PAGE_SIZE - 1);
                if (!page || page.length === 0) break;
                all = all.concat(page);
                if (page.length < PAGE_SIZE) break;
                offset += PAGE_SIZE;
            }
            return all;
        };

        const fetchData = async () => {
            setLoading(true);
            try {
                const [schedules, breaks, activeEmployees] = await Promise.all([
                    fetchAllRows('Agent Schedule'),
                    fetchAllRows('Agent Break Schedule'),
                    supabase
                        .from('employee_directory')
                        .select('first_name, last_name')
                        .eq('employee_status', 'Active')
                        .eq('role', 'Agent')
                        .then(res => res.data || []),
                ]);

                // Build active name set for filtering
                const activeNames = new Set(
                    activeEmployees.map((e: any) =>
                        `${(e.first_name || '').trim().toLowerCase()} ${(e.last_name || '').trim().toLowerCase()}`
                    )
                );

                const filterActiveDedup = (rows: any[]) => {
                    const seen = new Set<string>();
                    return rows.filter(row => {
                        const fn = (row["First Name"] || '').trim().toLowerCase();
                        const ln = (row["Last Name"] || '').trim().toLowerCase();
                        const key = `${fn} ${ln}`;
                        if (!activeNames.has(key) || seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                };

                const activeSchedules = filterActiveDedup(schedules);
                const activeBreaks = filterActiveDedup(breaks);

                setScheduleData(activeSchedules);
                setBreakData(activeBreaks);
                calculateMetrics(activeSchedules);
            } catch (error) {
                console.error("Error fetching schedule data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        const sub1 = supabase.channel('schedule-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'Agent Schedule' }, () => fetchData()).subscribe();
        const sub2 = supabase.channel('break-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'Agent Break Schedule' }, () => fetchData()).subscribe();
        const sub3 = supabase.channel('directory-schedule').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'employee_directory' }, () => fetchData()).subscribe();

        return () => {
            sub1.unsubscribe();
            sub2.unsubscribe();
            sub3.unsubscribe();
        };
    }, []);

    const parseTime = (t: string): number => {
        let s = t.toLowerCase().replace(/\./g, '').replace(/\s+/g, '');
        const hasPM = s.includes('p');
        const hasAM = s.includes('a');
        // Remove all letters
        s = s.replace(/[a-z]/g, '');
        // Replace dashes with colons for typos like "6-00"
        s = s.replace(/-/g, ':');
        const parts = s.split(':').filter(Boolean);
        let hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;

        // Standard AM/PM conversion
        if (hasPM && hours < 12) hours += 12;
        if (hasAM && hours === 12) hours = 0;

        // Work schedule sanity: data entry errors like "12:00 a.m" (meant noon)
        // or "11:00 p.m" (meant 11 AM). Clamp to 7AM-8PM range.
        if (hours < 7) hours += 12;
        if (hours > 20) hours -= 12;

        return hours + minutes / 60;
    };

    const parseDuration = (timeStr: string): number => {
        try {
            if (!timeStr || timeStr.toLowerCase().includes('off')) return 0;
            // Split on the separator dash (has whitespace before it), not dashes in times like "6-00"
            const parts = timeStr.split(/\s+-\s*/);
            if (parts.length !== 2) return 0;

            const start = parseTime(parts[0]);
            const end = parseTime(parts[1]);

            const diff = end - start;
            return diff > 0 ? diff : 0;
        } catch (e) {
            return 0;
        }
    };

    const calculateMetrics = (data: any[]) => {
        const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const todayDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, ... 5=Fri, 6=Sat

        // Determine which days to count for weekly hours (through today)
        // Sun(0) = 0 days, Mon(1) = 1 day, Tue(2) = 2 days, ... Fri(5) = 5 days, Sat(6) = 5 days (full week done)
        const daysToCount = dayOfWeek === 0 ? 0 : dayOfWeek >= 6 ? 5 : dayOfWeek;
        const countedDays = allDays.slice(0, daysToCount);

        // Context label
        if (dayOfWeek === 0) setHoursContext("Week starts Mon");
        else if (dayOfWeek === 6) setHoursContext("Full Week");
        else setHoursContext(`Through ${todayDay}`);

        // 1. Agents Scheduled Today (0 on weekends)
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
        const workingToday = isWeekday ? data.filter(agent => {
            const schedule = agent[todayDay];
            return schedule && /[0-9]/.test(schedule) && !schedule.toLowerCase().includes('off');
        }).length : 0;
        setAgentsToday(workingToday);

        // 2. Weekly hours through today + full week coverage chart
        let totalHoursToDate = 0;
        let agentsWithHours = 0;
        const dailyCounts: Record<string, number> = { Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0 };
        const dailyHours: Record<string, number> = { Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0 };

        data.forEach(agent => {
            let agentHoursToDate = 0;

            // Calculate all 5 days for coverage chart
            allDays.forEach(day => {
                const timeStr = agent[day];
                if (timeStr && /[0-9]/.test(timeStr) && !timeStr.toLowerCase().includes('off')) {
                    dailyCounts[day]++;
                    const hrs = parseDuration(timeStr);
                    dailyHours[day] += hrs;
                }
            });

            // Only accumulate hours for days through today
            countedDays.forEach(day => {
                const timeStr = agent[day];
                if (timeStr && /[0-9]/.test(timeStr) && !timeStr.toLowerCase().includes('off')) {
                    agentHoursToDate += parseDuration(timeStr);
                }
            });

            if (agentHoursToDate > 0) {
                agentsWithHours++;
                totalHoursToDate += agentHoursToDate;
            }
        });

        setWeeklyHours(totalHoursToDate.toLocaleString(undefined, { maximumFractionDigits: 0 }));

        const avgWeekly = agentsWithHours > 0 ? totalHoursToDate / agentsWithHours : 0;
        setAvgAgentHours(avgWeekly.toFixed(1));

        // Chart data shows full week (Mon-Fri) agent counts
        const chartData = allDays.map(day => ({
            name: day.substring(0, 3),
            agents: dailyCounts[day],
            fullDate: day
        }));
        setCoverageData(chartData);
    };




    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 100;
    const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const filteredSchedule = scheduleData.filter(agent =>
        (agent["First Name"]?.toLowerCase() + " " + agent["Last Name"]?.toLowerCase()).includes(searchQuery.toLowerCase())
    );

    const filteredBreaks = breakData.filter(agent =>
        (agent["First Name"]?.toLowerCase() + " " + agent["Last Name"]?.toLowerCase()).includes(searchQuery.toLowerCase())
    );

    // Pagination Logic
    const totalPages = Math.ceil(filteredSchedule.length / itemsPerPage);
    const paginatedSchedule = filteredSchedule.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handleRowClick = async (row: any) => {
        // Attempt to find linked employee
        // Ideally Agent Schedule has a user_id, but falling back to name match for now
        const firstName = row["First Name"];
        const lastName = row["Last Name"];

        if (!firstName || !lastName) return;

        const { data, error } = await supabase
            .from('employee_directory')
            .select('*')
            .ilike('first_name', firstName)
            .ilike('last_name', lastName)
            .maybeSingle();

        if (data) {
            setSelectedEmployee(data);
            setIsDrawerOpen(true);
        } else {
            // Optional: Handle case where no profile is found (maybe show a toast or simplified view)
            console.warn("No employee profile found for", firstName, lastName);
        }
    };

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="flex flex-col gap-1">
                    <h2 className="text-4xl font-bold tracking-tight text-white group cursor-default">
                        Agent Schedule
                        <span className="inline-block ml-2 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                    </h2>
                    <p className="text-white/50 text-lg font-medium">
                        Manage weekly shifts and daily break times for all agents.
                    </p>
                </div>

                {/* Stats Row */}
                <div className="grid gap-6 md:grid-cols-4">
                    <StatsCard
                        title="Agents (Today)"
                        value={agentsToday}
                        icon={<Users size={18} />}
                        trend="neutral"
                        trendValue="Daily"
                        index={0}
                    />
                    <StatsCard
                        title="Weekly Hours"
                        value={`${weeklyHours}h`}
                        icon={<Clock size={18} />}
                        trend="up"
                        trendValue={hoursContext}
                        index={1}
                    />
                    <StatsCard
                        title="Avg Hours / Agent"
                        value={`${avgAgentHours}h`}
                        icon={<Activity size={18} />}
                        trend="neutral"
                        trendValue={hoursContext}
                        index={2}
                    />
                    {/* Placeholder for Coverage Graph in a small card or keep 3 columns and full width graph below */}
                    <Card className="bg-white/5 border-white/10 text-white overflow-hidden relative group">
                        <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <CardHeader className="pb-2">
                            <CardTitle className="text-[11px] font-bold text-white/60 uppercase tracking-[0.2em] flex items-center justify-between">
                                Coverage Trend
                                <BarChart2 size={14} className="text-rose-400" />
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="h-[80px] p-0 relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={coverageData}>
                                    <defs>
                                        <linearGradient id="colorAgents" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <Area type="monotone" dataKey="agents" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorAgents)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>

                <div className="glass-card p-6 rounded-2xl border-white/5 bg-white/5 min-h-[600px]">
                    <Tabs defaultValue="shifts" className="w-full">
                        <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
                            <TabsList className="bg-black/20 border border-white/5">
                                <TabsTrigger value="shifts" className="data-[state=active]:bg-rose-500 data-[state=active]:text-white transition-all">
                                    <Calendar className="w-4 h-4 mr-2" />
                                    Weekly Shifts
                                </TabsTrigger>
                                <TabsTrigger value="breaks" className="data-[state=active]:bg-rose-500 data-[state=active]:text-white transition-all">
                                    <Coffee className="w-4 h-4 mr-2" />
                                    Break Schedule
                                </TabsTrigger>
                            </TabsList>

                            {/* Search Bar */}
                            <div className="relative w-full md:w-72">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                <Input
                                    placeholder="Search agents..."
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        setCurrentPage(1); // Reset page on search
                                    }}
                                    className="pl-9 bg-black/20 border-white/10 text-white placeholder:text-white/30 focus:border-rose-500/50 transition-colors"
                                />
                            </div>
                        </div>

                        <TabsContent value="shifts" className="space-y-4">
                            <div className="rounded-xl border border-white/10 overflow-hidden bg-black/20">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-white/5 text-xs uppercase font-semibold text-white/70 border-b border-white/10">
                                            <tr>
                                                <th className="px-6 py-4 tracking-wider">Agent Name</th>
                                                <th className="px-6 py-4 tracking-wider">Monday</th>
                                                <th className="px-6 py-4 tracking-wider">Tuesday</th>
                                                <th className="px-6 py-4 tracking-wider">Wednesday</th>
                                                <th className="px-6 py-4 tracking-wider">Thursday</th>
                                                <th className="px-6 py-4 tracking-wider">Friday</th>
                                                <th className="px-6 py-4 tracking-wider">Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {loading ? (
                                                <tr><td colSpan={7} className="text-center py-8 text-white/30">Loading schedules...</td></tr>
                                            ) : paginatedSchedule.length === 0 ? (
                                                <tr><td colSpan={7} className="text-center py-8 text-white/30">No agents found matching "{searchQuery}".</td></tr>
                                            ) : (
                                                <AnimatePresence>
                                                    {paginatedSchedule.map((row, index) => (
                                                        <motion.tr
                                                            key={row.id}
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, scale: 0.95 }}
                                                            transition={{ duration: 0.2, delay: index * 0.03 }}
                                                            onClick={() => handleRowClick(row)}
                                                            className="group hover:bg-white/10 border-l-2 border-transparent hover:border-l-2 hover:border-rose-500 transition-all duration-200 cursor-pointer"
                                                        >
                                                            <td className="px-6 py-4 font-bold text-white group-hover:text-rose-400 transition-colors">
                                                                {row["First Name"]} {row["Last Name"]}
                                                            </td>
                                                            <td className="px-6 py-4 text-gray-300 group-hover:text-white transition-colors">{row.Monday || '-'}</td>
                                                            <td className="px-6 py-4 text-gray-300 group-hover:text-white transition-colors">{row.Tuesday || '-'}</td>
                                                            <td className="px-6 py-4 text-gray-300 group-hover:text-white transition-colors">{row.Wednesday || '-'}</td>
                                                            <td className="px-6 py-4 text-gray-300 group-hover:text-white transition-colors">{row.Thursday || '-'}</td>
                                                            <td className="px-6 py-4 text-gray-300 group-hover:text-white transition-colors">{row.Friday || '-'}</td>
                                                            <td className="px-6 py-4 text-white/50 italic group-hover:text-white/80 transition-colors">{row.Notes}</td>
                                                        </motion.tr>
                                                    ))}
                                                </AnimatePresence>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Pagination Controls */}
                            {!loading && filteredSchedule.length > 0 && (
                                <div className="flex items-center justify-between px-4 py-2 text-white/60 text-sm">
                                    <span>Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredSchedule.length)} of {filteredSchedule.length}</span>
                                    <div className="flex gap-2">
                                        <button
                                            disabled={currentPage === 1}
                                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                            className="px-3 py-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
                                        >
                                            Previous
                                        </button>
                                        <button
                                            disabled={currentPage === totalPages}
                                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                            className="px-3 py-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="breaks" className="space-y-4">
                            <div className="rounded-xl border border-white/10 overflow-hidden bg-black/20">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-white/5 text-xs uppercase font-semibold text-white/70 border-b border-white/10">
                                            <tr>
                                                <th className="px-6 py-4 tracking-wider">Agent Name</th>
                                                <th className="px-6 py-4 tracking-wider">First Break</th>
                                                <th className="px-6 py-4 tracking-wider">Lunch Break</th>
                                                <th className="px-6 py-4 tracking-wider">Second Break</th>
                                                <th className="px-6 py-4 tracking-wider">Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {loading ? (
                                                <tr><td colSpan={5} className="text-center py-8 text-white/30">Loading breaks...</td></tr>
                                            ) : filteredBreaks.length === 0 ? (
                                                <tr><td colSpan={5} className="text-center py-8 text-white/30">No breakdown found matching "{searchQuery}".</td></tr>
                                            ) : (
                                                <AnimatePresence>
                                                    {filteredBreaks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((row, index) => (
                                                        <motion.tr
                                                            key={row.id}
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, scale: 0.95 }}
                                                            transition={{ duration: 0.2, delay: index * 0.03 }}
                                                            onClick={() => handleRowClick(row)}
                                                            className="group hover:bg-white/10 border-l-2 border-transparent hover:border-l-2 hover:border-rose-500 transition-all duration-200 cursor-pointer"
                                                        >
                                                            <td className="px-6 py-4 font-bold text-white group-hover:text-rose-400 transition-colors">
                                                                {row["First Name"]} {row["Last Name"]}
                                                            </td>
                                                            <td className="px-6 py-4 flex items-center gap-2 text-gray-300 group-hover:text-white transition-colors">
                                                                {row["First Break"] && row["First Break"].trim() !== '-' && <Clock size={14} className="text-rose-400" />}
                                                                {formatBreakTime(row["First Break"])}
                                                            </td>
                                                            <td className="px-6 py-4 text-gray-300 group-hover:text-white transition-colors">
                                                                {formatBreakTime(row["Lunch Break"])}
                                                            </td>
                                                            <td className="px-6 py-4 text-gray-300 group-hover:text-white transition-colors">
                                                                {formatBreakTime(row["Second Break"])}
                                                            </td>
                                                            <td className="px-6 py-4 text-white/50 italic group-hover:text-white/80 transition-colors">{row.Notes}</td>
                                                        </motion.tr>
                                                    ))}
                                                </AnimatePresence>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
            <ScheduleAIChat scheduleData={scheduleData} />

            <EmployeeProfileDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                employee={selectedEmployee}
            />
        </DashboardLayout>
    );

}

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

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const { data: schedules } = await supabase.from('Agent Schedule').select('*');
                const { data: breaks } = await supabase.from('Agent Break Schedule').select('*');
                setScheduleData(schedules || []);
                setBreakData(breaks || []);
                calculateMetrics(schedules || []);
            } catch (error) {
                console.error("Error fetching schedule data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        const sub1 = supabase.channel('schedule-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'Agent Schedule' }, () => fetchData()).subscribe();
        const sub2 = supabase.channel('break-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'Agent Break Schedule' }, () => fetchData()).subscribe();

        return () => {
            sub1.unsubscribe();
            sub2.unsubscribe();
        };
    }, []);

    const parseDuration = (timeStr: string): number => {
        try {
            if (!timeStr || timeStr.toLowerCase().includes('off')) return 0;
            const parts = timeStr.toLowerCase().split('-');
            if (parts.length !== 2) return 0; // Strict: No fallback to 8

            const start = parseTime(parts[0]);
            const end = parseTime(parts[1]);

            let diff = end - start;
            if (diff < 0) diff += 24;
            return diff > 0 ? diff : 0;
        } catch (e) {
            return 0;
        }
    };

    const parseTime = (t: string): number => {
        const clean = t.replace(/[^0-9:amp]/g, '');
        const isPM = clean.includes('p');
        let [hours, minutes] = clean.replace(/[amp]/g, '').split(':').map(Number);
        if (isPM && hours !== 12) hours += 12;
        if (!isPM && hours === 12) hours = 0;
        return hours + (minutes || 0) / 60;
    };

    const calculateMetrics = (data: any[]) => {
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const todayDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });

        // 1. Agents Scheduled Today
        const workingToday = data.filter(agent => {
            const schedule = agent[todayDay];
            // Must have a valid time string (numbers present) and not be "OFF"
            return schedule && /[0-9]/.test(schedule) && !schedule.toLowerCase().includes('off');
        }).length;
        setAgentsToday(workingToday);

        // 2. Weekly Coverage & Total Hours
        let totalHours = 0;
        let agentsWithHours = 0;
        const dailyCounts: Record<string, number> = { Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0 };

        data.forEach(agent => {
            let agentWeeklyHours = 0;
            days.forEach(day => {
                const timeStr = agent[day];
                if (timeStr && /[0-9]/.test(timeStr) && !timeStr.toLowerCase().includes('off')) {
                    dailyCounts[day]++;
                    agentWeeklyHours += parseDuration(timeStr);
                }
            });

            if (agentWeeklyHours > 0) {
                agentsWithHours++;
                totalHours += agentWeeklyHours;
            }
        });

        // Weekly Hours formatted
        setWeeklyHours(totalHours.toLocaleString(undefined, { maximumFractionDigits: 0 }));

        // Average Weekly Hours per Agent (only counting those who actually work)
        const avgWeekly = agentsWithHours > 0 ? totalHours / agentsWithHours : 0;
        setAvgAgentHours(avgWeekly.toFixed(1));

        // Prepare Chart Data
        const chartData = days.map(day => ({
            name: day.substring(0, 3), // Mon, Tue...
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
                        title="Total Weekly Hours"
                        value={`${weeklyHours}h`}
                        icon={<Clock size={18} />}
                        trend="up"
                        trendValue="Est."
                        index={1}
                    />
                    <StatsCard
                        title="Avg Hours / Agent"
                        value={`${avgAgentHours}h`}
                        icon={<Activity size={18} />}
                        trend="neutral"
                        trendValue="Weekly"
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
                                                                {row["First Break"] && <Clock size={14} className="text-rose-400" />}
                                                                {row["First Break"] || '-'}
                                                            </td>
                                                            <td className="px-6 py-4 text-gray-300 group-hover:text-white transition-colors">
                                                                {row["Lunch Break"] || '-'}
                                                            </td>
                                                            <td className="px-6 py-4 text-gray-300 group-hover:text-white transition-colors">
                                                                {row["Second Break"] || '-'}
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

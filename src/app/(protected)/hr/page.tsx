"use client";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { TaskList, Task, TaskStatus } from "@/components/ui/task-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import StatsCard from "@/components/dashboard/StatsCard";
import InteractiveChart from "@/components/dashboard/InteractiveChart";
import HRCalendar from "@/components/hr/HRCalendar";
import HRGaugeCluster from "@/components/hr/HRGaugeCluster";
import HRTrendsAnalytics from "@/components/hr/HRTrendsAnalytics";
import AttritionKnowledgeGraph from "@/components/hr/AttritionKnowledgeGraph";
import { Users, UserCheck, TrendingUp, Award, Calendar } from "lucide-react";

export default function HRDashboard() {
    const { user, profile } = useAuth();
    const [dateRange, setDateRange] = useState<'daily' | 'weekly' | '30d' | '90d'>('30d');

    // Task List State
    const [tasks, setTasks] = useState<Task[]>([
        { id: 1, task: "Review Q1 Hiring Metrics", category: "Recruitment", status: "Completed", dueDate: "2024-01-15" },
        { id: 2, task: "Update Employee Handbook", category: "Policy", status: "In Progress", dueDate: "2024-01-20" },
        { id: 3, task: "Schedule Performance Reviews", category: "Management", status: "Pending", dueDate: "2024-01-25" },
    ]);

    const [newTaskTitle, setNewTaskTitle] = useState("");
    const [newTaskCategory, setNewTaskCategory] = useState("General");

    const handleAddTask = () => {
        if (!newTaskTitle.trim()) return;

        const newTask: Task = {
            id: Date.now(),
            task: newTaskTitle,
            category: newTaskCategory,
            status: "Pending",
            dueDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        };

        setTasks([...tasks, newTask]);
        setNewTaskTitle("");
    };

    const handleDeleteTask = (id: number | string) => {
        setTasks(tasks.filter(t => t.id !== id));
    };

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-5xl font-bold tracking-tight text-white group cursor-default">
                            HR Dashboard
                            <span className="inline-block ml-2 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                        </h2>
                        <p className="text-white/50 text-lg font-medium">
                            Welcome back, <span className="text-white font-bold text-xl capitalize">{profile?.name || user?.displayName || user?.email?.split('@')[0] || "HR Team"}</span>. Here's your workforce overview.
                        </p>
                    </div>

                    {/* Date Range Filter */}
                    <div className="bg-white/5 p-1 rounded-lg flex items-center border border-white/10">
                        {(['daily', 'weekly', '30d', '90d'] as const).map((range) => (
                            <button
                                key={range}
                                onClick={() => setDateRange(range)}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${dateRange === range
                                    ? 'bg-rose-500 text-white shadow-lg'
                                    : 'text-white/50 hover:text-white hover:bg-white/10'
                                    }`}
                            >
                                {range === 'daily' ? 'Today' : range === 'weekly' ? '7 Days' : range.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Top Section: Gauges */}
                <HRGaugeCluster dateRange={dateRange} />

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Left Column: Analytics (Takes up 2 cols on huge screens) */}
                    <div className="xl:col-span-2 space-y-6">
                        <HRTrendsAnalytics dateRange={dateRange} />

                        {/* Interactive Attrition Graph */}
                        <AttritionKnowledgeGraph />
                    </div>

                    {/* Right Column: Tasks (Replacing Live Feed) */}
                    <div className="xl:col-span-1 space-y-6">
                        <div className="glass-card p-6 rounded-2xl border-white/5 h-full">
                            <h3 className="text-lg font-bold text-white uppercase tracking-wider mb-4">Quick Tasks</h3>
                            <div className="flex gap-2 mb-4">
                                <Input
                                    placeholder="New Task..."
                                    value={newTaskTitle}
                                    onChange={(e) => setNewTaskTitle(e.target.value)}
                                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                                />
                                <Button onClick={handleAddTask} size="icon" className="shrink-0 bg-rose-500 hover:bg-rose-600 border-none">
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                            <TaskList tasks={tasks} onDelete={handleDeleteTask} />
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}

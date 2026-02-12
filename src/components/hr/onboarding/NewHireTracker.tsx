"use client";

import { motion } from "framer-motion";
import { UserPlus, Calendar, Clock, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";

interface NewHire {
    id: string;
    name: string;
    position: string;
    department: string;
    startDate: string;
    status: "not_started" | "in_progress" | "completed";
    progress: number;
    avatar?: string;
}

// Mock data - replace with actual data from Supabase
const mockNewHires: NewHire[] = [
    {
        id: "1",
        name: "Sarah Johnson",
        position: "Sales Agent",
        department: "Sales",
        startDate: "2024-02-12",
        status: "in_progress",
        progress: 45
    },
    {
        id: "2",
        name: "Michael Chen",
        position: "QA Specialist",
        department: "Quality Assurance",
        startDate: "2024-02-10",
        status: "in_progress",
        progress: 75
    },
    {
        id: "3",
        name: "Emily Rodriguez",
        position: "Customer Success Rep",
        department: "Customer Success",
        startDate: "2024-02-15",
        status: "not_started",
        progress: 0
    },
    {
        id: "4",
        name: "David Kim",
        position: "Senior Sales Agent",
        department: "Sales",
        startDate: "2024-02-05",
        status: "completed",
        progress: 100
    }
];

const statusConfig = {
    not_started: {
        label: "Not Started",
        color: "text-white/50",
        bg: "bg-white/10",
        icon: Clock
    },
    in_progress: {
        label: "In Progress",
        color: "text-amber-400",
        bg: "bg-amber-500/20",
        icon: AlertCircle
    },
    completed: {
        label: "Completed",
        color: "text-emerald-400",
        bg: "bg-emerald-500/20",
        icon: CheckCircle2
    }
};

export default function NewHireTracker() {
    const stats = {
        total: mockNewHires.length,
        inProgress: mockNewHires.filter(h => h.status === "in_progress").length,
        completed: mockNewHires.filter(h => h.status === "completed").length,
        notStarted: mockNewHires.filter(h => h.status === "not_started").length
    };

    return (
        <div className="glass-card rounded-2xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-indigo-500/20">
                        <UserPlus className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">New Hire Tracker</h2>
                        <p className="text-sm text-white/50">Track onboarding progress for new employees</p>
                    </div>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors text-sm font-medium">
                    Add New Hire
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <p className="text-2xl font-bold text-white">{stats.total}</p>
                    <p className="text-xs text-white/50">Total New Hires</p>
                </div>
                <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/20">
                    <p className="text-2xl font-bold text-amber-400">{stats.inProgress}</p>
                    <p className="text-xs text-amber-400/70">In Progress</p>
                </div>
                <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20">
                    <p className="text-2xl font-bold text-emerald-400">{stats.completed}</p>
                    <p className="text-xs text-emerald-400/70">Completed</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <p className="text-2xl font-bold text-white/70">{stats.notStarted}</p>
                    <p className="text-xs text-white/50">Not Started</p>
                </div>
            </div>

            {/* New Hires Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-4 text-xs font-semibold text-white/50 uppercase tracking-wider">Employee</th>
                            <th className="text-left py-3 px-4 text-xs font-semibold text-white/50 uppercase tracking-wider">Position</th>
                            <th className="text-left py-3 px-4 text-xs font-semibold text-white/50 uppercase tracking-wider">Start Date</th>
                            <th className="text-left py-3 px-4 text-xs font-semibold text-white/50 uppercase tracking-wider">Status</th>
                            <th className="text-left py-3 px-4 text-xs font-semibold text-white/50 uppercase tracking-wider">Progress</th>
                        </tr>
                    </thead>
                    <tbody>
                        {mockNewHires.map((hire, index) => {
                            const config = statusConfig[hire.status];
                            const StatusIcon = config.icon;

                            return (
                                <motion.tr
                                    key={hire.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                    className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                                >
                                    <td className="py-4 px-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">
                                                {hire.name.split(" ").map(n => n[0]).join("")}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-white">{hire.name}</p>
                                                <p className="text-xs text-white/50">{hire.department}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4">
                                        <p className="text-sm text-white/80">{hire.position}</p>
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="flex items-center gap-2 text-white/60">
                                            <Calendar className="w-4 h-4" />
                                            <span className="text-sm">{new Date(hire.startDate).toLocaleDateString()}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4">
                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                                            <StatusIcon className="w-3.5 h-3.5" />
                                            {config.label}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
                                                <motion.div
                                                    className={`h-full ${
                                                        hire.progress === 100
                                                            ? "bg-emerald-500"
                                                            : hire.progress > 50
                                                            ? "bg-indigo-500"
                                                            : "bg-amber-500"
                                                    }`}
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${hire.progress}%` }}
                                                    transition={{ duration: 0.5, delay: index * 0.1 }}
                                                />
                                            </div>
                                            <span className="text-sm font-medium text-white/70 min-w-[40px]">
                                                {hire.progress}%
                                            </span>
                                        </div>
                                    </td>
                                </motion.tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

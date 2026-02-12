"use client";

import { motion } from "framer-motion";
import { GraduationCap, Play, CheckCircle2, Clock, Award, BookOpen, Video, FileQuestion } from "lucide-react";

interface TrainingModule {
    id: string;
    title: string;
    type: "video" | "quiz" | "reading" | "interactive";
    duration: string;
    status: "completed" | "in_progress" | "not_started";
    score?: number;
    completedDate?: string;
}

interface EmployeeTraining {
    employeeId: string;
    employeeName: string;
    position: string;
    overallProgress: number;
    modules: TrainingModule[];
}

// Mock data - replace with actual data from Supabase
const mockTrainingData: EmployeeTraining[] = [
    {
        employeeId: "1",
        employeeName: "Sarah Johnson",
        position: "Sales Agent",
        overallProgress: 40,
        modules: [
            { id: "1", title: "Company Overview & Culture", type: "video", duration: "30 min", status: "completed", completedDate: "2024-02-12" },
            { id: "2", title: "HR Policies & Procedures", type: "reading", duration: "45 min", status: "completed", completedDate: "2024-02-13" },
            { id: "3", title: "Compliance Training", type: "interactive", duration: "1 hr", status: "in_progress" },
            { id: "4", title: "Sales Process Fundamentals", type: "video", duration: "2 hr", status: "not_started" },
            { id: "5", title: "Product Knowledge", type: "reading", duration: "1.5 hr", status: "not_started" },
            { id: "6", title: "CRM System Training", type: "interactive", duration: "1 hr", status: "not_started" },
            { id: "7", title: "Compliance Assessment", type: "quiz", duration: "30 min", status: "not_started" },
        ]
    },
    {
        employeeId: "2",
        employeeName: "Michael Chen",
        position: "QA Specialist",
        overallProgress: 85,
        modules: [
            { id: "1", title: "Company Overview & Culture", type: "video", duration: "30 min", status: "completed", completedDate: "2024-02-10", score: 100 },
            { id: "2", title: "HR Policies & Procedures", type: "reading", duration: "45 min", status: "completed", completedDate: "2024-02-10" },
            { id: "3", title: "Compliance Training", type: "interactive", duration: "1 hr", status: "completed", completedDate: "2024-02-11", score: 95 },
            { id: "4", title: "QA Best Practices", type: "video", duration: "2 hr", status: "completed", completedDate: "2024-02-12" },
            { id: "5", title: "Call Evaluation Criteria", type: "reading", duration: "1 hr", status: "completed", completedDate: "2024-02-13" },
            { id: "6", title: "QA Tools & Systems", type: "interactive", duration: "1.5 hr", status: "in_progress" },
            { id: "7", title: "Final QA Certification", type: "quiz", duration: "45 min", status: "not_started" },
        ]
    },
    {
        employeeId: "3",
        employeeName: "Emily Rodriguez",
        position: "Customer Success Rep",
        overallProgress: 0,
        modules: [
            { id: "1", title: "Company Overview & Culture", type: "video", duration: "30 min", status: "not_started" },
            { id: "2", title: "HR Policies & Procedures", type: "reading", duration: "45 min", status: "not_started" },
            { id: "3", title: "Compliance Training", type: "interactive", duration: "1 hr", status: "not_started" },
            { id: "4", title: "Customer Success Fundamentals", type: "video", duration: "1.5 hr", status: "not_started" },
            { id: "5", title: "Support Tools Training", type: "interactive", duration: "1 hr", status: "not_started" },
        ]
    }
];

const typeIcons = {
    video: Video,
    quiz: FileQuestion,
    reading: BookOpen,
    interactive: Play
};

const statusConfig = {
    completed: {
        color: "text-emerald-400",
        bg: "bg-emerald-500/20",
        border: "border-emerald-500/30"
    },
    in_progress: {
        color: "text-amber-400",
        bg: "bg-amber-500/20",
        border: "border-amber-500/30"
    },
    not_started: {
        color: "text-white/40",
        bg: "bg-white/5",
        border: "border-white/10"
    }
};

export default function TrainingProgress() {
    // Aggregate stats
    const totalModules = mockTrainingData.reduce((acc, e) => acc + e.modules.length, 0);
    const completedModules = mockTrainingData.reduce(
        (acc, e) => acc + e.modules.filter(m => m.status === "completed").length,
        0
    );
    const inProgressModules = mockTrainingData.reduce(
        (acc, e) => acc + e.modules.filter(m => m.status === "in_progress").length,
        0
    );
    const overallCompletion = Math.round((completedModules / totalModules) * 100);

    return (
        <div className="glass-card rounded-2xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-emerald-500/20">
                        <GraduationCap className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Training Progress</h2>
                        <p className="text-sm text-white/50">Track employee training and certifications</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-2xl font-bold text-white">{overallCompletion}%</p>
                        <p className="text-xs text-white/50">Overall Completion</p>
                    </div>
                    <div className="w-16 h-16 relative">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle
                                cx="32"
                                cy="32"
                                r="28"
                                fill="none"
                                stroke="rgba(255,255,255,0.1)"
                                strokeWidth="6"
                            />
                            <motion.circle
                                cx="32"
                                cy="32"
                                r="28"
                                fill="none"
                                stroke="url(#progressGradient)"
                                strokeWidth="6"
                                strokeLinecap="round"
                                strokeDasharray={`${2 * Math.PI * 28}`}
                                initial={{ strokeDashoffset: 2 * Math.PI * 28 }}
                                animate={{ strokeDashoffset: 2 * Math.PI * 28 * (1 - overallCompletion / 100) }}
                                transition={{ duration: 1, ease: "easeOut" }}
                            />
                            <defs>
                                <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#10b981" />
                                    <stop offset="100%" stopColor="#6366f1" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <p className="text-2xl font-bold text-white">{totalModules}</p>
                    <p className="text-xs text-white/50">Total Modules</p>
                </div>
                <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20">
                    <p className="text-2xl font-bold text-emerald-400">{completedModules}</p>
                    <p className="text-xs text-emerald-400/70">Completed</p>
                </div>
                <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/20">
                    <p className="text-2xl font-bold text-amber-400">{inProgressModules}</p>
                    <p className="text-xs text-amber-400/70">In Progress</p>
                </div>
            </div>

            {/* Employee Training Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {mockTrainingData.map((employee, index) => (
                    <motion.div
                        key={employee.employeeId}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-white/20 transition-colors"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold">
                                {employee.employeeName.split(" ").map(n => n[0]).join("")}
                            </div>
                            <div className="flex-1">
                                <p className="font-semibold text-white">{employee.employeeName}</p>
                                <p className="text-xs text-white/50">{employee.position}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-lg font-bold text-white">{employee.overallProgress}%</p>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-4">
                            <motion.div
                                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
                                initial={{ width: 0 }}
                                animate={{ width: `${employee.overallProgress}%` }}
                                transition={{ duration: 0.5, delay: index * 0.1 }}
                            />
                        </div>

                        {/* Module List */}
                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                            {employee.modules.map((module) => {
                                const TypeIcon = typeIcons[module.type];
                                const config = statusConfig[module.status];

                                return (
                                    <div
                                        key={module.id}
                                        className={`flex items-center gap-2 p-2 rounded-lg ${config.bg} border ${config.border}`}
                                    >
                                        <TypeIcon className={`w-4 h-4 ${config.color}`} />
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-xs font-medium truncate ${
                                                module.status === "completed" ? "text-white/60" : "text-white"
                                            }`}>
                                                {module.title}
                                            </p>
                                            <p className="text-[10px] text-white/40">{module.duration}</p>
                                        </div>
                                        {module.status === "completed" && (
                                            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                        )}
                                        {module.status === "in_progress" && (
                                            <Clock className="w-4 h-4 text-amber-400 animate-pulse flex-shrink-0" />
                                        )}
                                        {module.score !== undefined && (
                                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                                                {module.score}%
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

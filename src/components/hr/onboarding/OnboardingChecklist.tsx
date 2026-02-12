"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Circle, Clock, User, ChevronDown, ChevronUp } from "lucide-react";

interface ChecklistItem {
    id: string;
    title: string;
    description: string;
    status: "completed" | "in_progress" | "pending";
    dueDate?: string;
    assignee?: string;
}

interface NewHire {
    id: string;
    name: string;
    position: string;
    startDate: string;
    checklist: ChecklistItem[];
}

// Mock data - replace with actual data from Supabase
const mockNewHires: NewHire[] = [
    {
        id: "1",
        name: "Sarah Johnson",
        position: "Sales Agent",
        startDate: "2024-02-12",
        checklist: [
            { id: "1", title: "Complete I-9 Form", description: "Employment eligibility verification", status: "completed" },
            { id: "2", title: "Sign Employment Agreement", description: "Review and sign employment contract", status: "completed" },
            { id: "3", title: "Setup Workstation", description: "Computer, phone, and desk assignment", status: "in_progress", assignee: "IT Team" },
            { id: "4", title: "Complete Compliance Training", description: "Required compliance modules", status: "pending", dueDate: "2024-02-19" },
            { id: "5", title: "Meet with Manager", description: "Initial 1:1 meeting with direct supervisor", status: "pending", dueDate: "2024-02-14" },
            { id: "6", title: "System Access Setup", description: "CRM, email, and internal tools access", status: "pending", assignee: "IT Team" },
        ]
    },
    {
        id: "2",
        name: "Michael Chen",
        position: "QA Specialist",
        startDate: "2024-02-10",
        checklist: [
            { id: "1", title: "Complete I-9 Form", description: "Employment eligibility verification", status: "completed" },
            { id: "2", title: "Sign Employment Agreement", description: "Review and sign employment contract", status: "completed" },
            { id: "3", title: "Setup Workstation", description: "Computer, phone, and desk assignment", status: "completed", assignee: "IT Team" },
            { id: "4", title: "Complete Compliance Training", description: "Required compliance modules", status: "in_progress", dueDate: "2024-02-17" },
            { id: "5", title: "Meet with Manager", description: "Initial 1:1 meeting with direct supervisor", status: "completed" },
            { id: "6", title: "QA Tools Training", description: "Training on QA software and processes", status: "pending", dueDate: "2024-02-20" },
        ]
    }
];

const StatusIcon = ({ status }: { status: ChecklistItem["status"] }) => {
    switch (status) {
        case "completed":
            return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
        case "in_progress":
            return <Clock className="w-5 h-5 text-amber-400 animate-pulse" />;
        default:
            return <Circle className="w-5 h-5 text-white/30" />;
    }
};

export default function OnboardingChecklist() {
    const [expandedHire, setExpandedHire] = useState<string | null>(mockNewHires[0]?.id || null);

    const getProgress = (checklist: ChecklistItem[]) => {
        const completed = checklist.filter(item => item.status === "completed").length;
        return Math.round((completed / checklist.length) * 100);
    };

    return (
        <div className="glass-card rounded-2xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Onboarding Checklists</h2>
                <span className="text-xs text-white/50 bg-white/5 px-3 py-1 rounded-full">
                    {mockNewHires.length} Active
                </span>
            </div>

            <div className="space-y-4">
                {mockNewHires.map((hire) => {
                    const progress = getProgress(hire.checklist);
                    const isExpanded = expandedHire === hire.id;

                    return (
                        <motion.div
                            key={hire.id}
                            className="bg-white/5 rounded-xl border border-white/10 overflow-hidden"
                            initial={false}
                        >
                            <button
                                onClick={() => setExpandedHire(isExpanded ? null : hire.id)}
                                className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                        <User className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-semibold text-white">{hire.name}</p>
                                        <p className="text-xs text-white/50">{hire.position}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-white">{progress}%</p>
                                        <p className="text-xs text-white/50">Complete</p>
                                    </div>
                                    <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                                        <motion.div
                                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${progress}%` }}
                                            transition={{ duration: 0.5, ease: "easeOut" }}
                                        />
                                    </div>
                                    {isExpanded ? (
                                        <ChevronUp className="w-5 h-5 text-white/50" />
                                    ) : (
                                        <ChevronDown className="w-5 h-5 text-white/50" />
                                    )}
                                </div>
                            </button>

                            <motion.div
                                initial={false}
                                animate={{ height: isExpanded ? "auto" : 0 }}
                                transition={{ duration: 0.3, ease: "easeInOut" }}
                                className="overflow-hidden"
                            >
                                <div className="px-4 pb-4 space-y-2">
                                    {hire.checklist.map((item) => (
                                        <div
                                            key={item.id}
                                            className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                                                item.status === "completed"
                                                    ? "bg-emerald-500/10"
                                                    : item.status === "in_progress"
                                                    ? "bg-amber-500/10"
                                                    : "bg-white/5"
                                            }`}
                                        >
                                            <StatusIcon status={item.status} />
                                            <div className="flex-1 min-w-0">
                                                <p className={`font-medium ${
                                                    item.status === "completed" ? "text-white/60 line-through" : "text-white"
                                                }`}>
                                                    {item.title}
                                                </p>
                                                <p className="text-xs text-white/40 mt-0.5">{item.description}</p>
                                                <div className="flex items-center gap-3 mt-1">
                                                    {item.dueDate && (
                                                        <span className="text-xs text-white/30">
                                                            Due: {new Date(item.dueDate).toLocaleDateString()}
                                                        </span>
                                                    )}
                                                    {item.assignee && (
                                                        <span className="text-xs text-indigo-400">
                                                            {item.assignee}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

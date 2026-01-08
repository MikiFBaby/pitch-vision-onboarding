"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils"; // Assuming you have a utility for class names

// --- TYPE DEFINITIONS ---
export type TaskStatus = "Completed" | "In Progress" | "Pending";

export interface Task {
    id: number | string;
    task: string;
    category: string;
    status: TaskStatus;
    dueDate: string;
}

export interface TaskListProps {
    title?: string;
    tasks: Task[];
    onDelete?: (id: number | string) => void;
}

// --- STATUS BADGE SUBCOMPONENT ---
const StatusBadge = ({ status }: { status: TaskStatus }) => {
    const baseClasses = "px-2.5 py-0.5 text-xs font-semibold rounded-full";
    const statusClasses = {
        Completed:
            "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400",
        "In Progress":
            "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400",
        Pending: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
    };
    return <span className={cn(baseClasses, statusClasses[status])}>{status}</span>;
};


// --- FRAMER MOTION VARIANTS ---
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.08,
        },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            stiffness: 100,
            damping: 14,
        }
    },
    exit: { opacity: 0, x: -20 }
};

// --- MAIN COMPONENT ---
export const TaskList = ({ title = "Task List", tasks, onDelete }: TaskListProps) => {
    return (
        <div className="w-full rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
            <h2 className="text-lg font-semibold mb-4">{title}</h2>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    {/* Table Header */}
                    <motion.thead
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5 }}
                    >
                        <tr className="border-b border-border">
                            <th scope="col" className="p-4 font-medium text-muted-foreground w-12">No</th>
                            <th scope="col" className="p-4 font-medium text-muted-foreground">Task</th>
                            <th scope="col" className="p-4 font-medium text-muted-foreground">Category</th>
                            <th scope="col" className="p-4 font-medium text-muted-foreground">Status</th>
                            <th scope="col" className="p-4 font-medium text-muted-foreground text-right">Due Date</th>
                            {onDelete && <th scope="col" className="p-4 font-medium text-muted-foreground w-12 text-center">Action</th>}
                        </tr>
                    </motion.thead>

                    {/* Table Body with Animations */}
                    <motion.tbody
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                    >
                        <AnimatePresence mode="popLayout">
                            {tasks.length > 0 ? (
                                tasks.map((task, index) => (
                                    <motion.tr
                                        key={task.id}
                                        variants={itemVariants}
                                        layout
                                        exit="exit"
                                        className="border-b border-border last:border-none hover:bg-muted/50 group"
                                    >
                                        <td className="p-4 text-muted-foreground">{index + 1}</td>
                                        <td className="p-4 font-medium">{task.task}</td>
                                        <td className="p-4 text-muted-foreground">{task.category}</td>
                                        <td className="p-4">
                                            <StatusBadge status={task.status} />
                                        </td>
                                        <td className="p-4 text-muted-foreground text-right">{task.dueDate}</td>
                                        {onDelete && (
                                            <td className="p-4 text-center">
                                                <button
                                                    onClick={() => onDelete(task.id)}
                                                    className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-700"
                                                >
                                                    ✕
                                                </button>
                                            </td>
                                        )}
                                    </motion.tr>
                                ))
                            ) : (
                                <motion.tr variants={itemVariants}>
                                    <td colSpan={6} className="p-8 text-center text-muted-foreground">No tasks found. Add one above!</td>
                                </motion.tr>
                            )}
                        </AnimatePresence>
                    </motion.tbody>
                </table>
            </div>
        </div>
    );
};

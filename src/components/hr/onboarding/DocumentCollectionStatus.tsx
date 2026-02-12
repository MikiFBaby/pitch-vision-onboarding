"use client";

import { motion } from "framer-motion";
import { FileText, CheckCircle2, Clock, AlertTriangle, Upload, Eye } from "lucide-react";

interface Document {
    id: string;
    name: string;
    type: string;
    status: "collected" | "pending" | "overdue";
    dueDate?: string;
    submittedDate?: string;
}

interface EmployeeDocuments {
    employeeId: string;
    employeeName: string;
    documents: Document[];
}

// Mock data - replace with actual data from Supabase
const mockDocumentData: EmployeeDocuments[] = [
    {
        employeeId: "1",
        employeeName: "Sarah Johnson",
        documents: [
            { id: "1", name: "I-9 Form", type: "Legal", status: "collected", submittedDate: "2024-02-12" },
            { id: "2", name: "W-4 Form", type: "Tax", status: "collected", submittedDate: "2024-02-12" },
            { id: "3", name: "Direct Deposit Form", type: "Payroll", status: "pending", dueDate: "2024-02-19" },
            { id: "4", name: "Emergency Contact", type: "HR", status: "pending", dueDate: "2024-02-16" },
            { id: "5", name: "NDA Agreement", type: "Legal", status: "overdue", dueDate: "2024-02-14" },
        ]
    },
    {
        employeeId: "2",
        employeeName: "Michael Chen",
        documents: [
            { id: "1", name: "I-9 Form", type: "Legal", status: "collected", submittedDate: "2024-02-10" },
            { id: "2", name: "W-4 Form", type: "Tax", status: "collected", submittedDate: "2024-02-10" },
            { id: "3", name: "Direct Deposit Form", type: "Payroll", status: "collected", submittedDate: "2024-02-11" },
            { id: "4", name: "Emergency Contact", type: "HR", status: "collected", submittedDate: "2024-02-10" },
            { id: "5", name: "NDA Agreement", type: "Legal", status: "collected", submittedDate: "2024-02-10" },
        ]
    }
];

const statusConfig = {
    collected: {
        label: "Collected",
        color: "text-emerald-400",
        bg: "bg-emerald-500/20",
        icon: CheckCircle2
    },
    pending: {
        label: "Pending",
        color: "text-amber-400",
        bg: "bg-amber-500/20",
        icon: Clock
    },
    overdue: {
        label: "Overdue",
        color: "text-rose-400",
        bg: "bg-rose-500/20",
        icon: AlertTriangle
    }
};

export default function DocumentCollectionStatus() {
    // Aggregate stats
    const allDocuments = mockDocumentData.flatMap(e => e.documents);
    const stats = {
        total: allDocuments.length,
        collected: allDocuments.filter(d => d.status === "collected").length,
        pending: allDocuments.filter(d => d.status === "pending").length,
        overdue: allDocuments.filter(d => d.status === "overdue").length
    };

    const collectionRate = Math.round((stats.collected / stats.total) * 100);

    return (
        <div className="glass-card rounded-2xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-purple-500/20">
                        <FileText className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Document Collection</h2>
                        <p className="text-sm text-white/50">Track required documents status</p>
                    </div>
                </div>
            </div>

            {/* Collection Rate */}
            <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white/70">Overall Collection Rate</span>
                    <span className="text-lg font-bold text-white">{collectionRate}%</span>
                </div>
                <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${collectionRate}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-white/50">
                    <span>{stats.collected} collected</span>
                    <span>{stats.pending} pending</span>
                    <span className="text-rose-400">{stats.overdue} overdue</span>
                </div>
            </div>

            {/* Documents by Employee */}
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {mockDocumentData.map((employee) => {
                    const employeeCollected = employee.documents.filter(d => d.status === "collected").length;
                    const employeeProgress = Math.round((employeeCollected / employee.documents.length) * 100);

                    return (
                        <div key={employee.employeeId} className="bg-white/5 rounded-xl p-4 border border-white/10">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                                        {employee.employeeName.split(" ").map(n => n[0]).join("")}
                                    </div>
                                    <span className="font-medium text-white">{employee.employeeName}</span>
                                </div>
                                <span className="text-sm text-white/50">
                                    {employeeCollected}/{employee.documents.length} docs
                                </span>
                            </div>

                            <div className="space-y-2">
                                {employee.documents.map((doc) => {
                                    const config = statusConfig[doc.status];
                                    const StatusIcon = config.icon;

                                    return (
                                        <div
                                            key={doc.id}
                                            className="flex items-center justify-between py-2 px-3 bg-white/5 rounded-lg"
                                        >
                                            <div className="flex items-center gap-2">
                                                <StatusIcon className={`w-4 h-4 ${config.color}`} />
                                                <div>
                                                    <p className="text-sm text-white">{doc.name}</p>
                                                    <p className="text-xs text-white/40">{doc.type}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
                                                    {config.label}
                                                </span>
                                                {doc.status === "collected" ? (
                                                    <button className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                                                        <Eye className="w-4 h-4 text-white/50" />
                                                    </button>
                                                ) : (
                                                    <button className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                                                        <Upload className="w-4 h-4 text-white/50" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

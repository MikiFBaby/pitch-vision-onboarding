"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    UserPlus,
    Calendar,
    Clock,
    CheckCircle2,
    AlertCircle,
    ChevronDown,
    FileText,
    GraduationCap,
    Laptop,
    Users,
    MapPin,
    Mail,
    Search,
    RefreshCw,
    Trash2,
    FileSignature,
    Send,
    Eye,
    XCircle,
    Upload,
    Download,
    ExternalLink,
    Loader2,
    ArrowUpRight,
    TrendingUp,
    Hash,
    Lock,
    MessageSquare,
    Video,
    Headphones,
    MonitorPlay,
    PackageCheck
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { ShimmerButton } from "@/components/ui/shimmer-button";

interface ChecklistItem {
    id: string;
    progressId: string;
    title: string;
    description: string | null;
    category: "documents" | "training" | "setup";
    sort_order: number;
    status: "completed" | "in_progress" | "pending";
    completedAt?: string;
    notes?: string;
    documentUrl?: string;
}

interface NewHire {
    id: string;
    employeeId: string | null;
    firstName: string;
    lastName: string;
    email: string;
    country: "Canada" | "USA";
    startDate: string;
    status: "not_started" | "in_progress" | "completed";
    contractStatus: "not_sent" | "sending" | "sent" | "opened" | "signed" | "declined" | "failed";
    hourlyWage: number | null;
    signedContractUrl: string | null;
    slackId: string | null;
    checklist: ChecklistItem[];
}

const CONTRACT_CHECKLIST_ITEM_ID = "c0a80121-0001-4000-8000-000000000001";
const MATERIALS_SENT_ITEM_ID = "c0a80121-0002-4000-8000-000000000001";
const PORTAL_TRAINING_ITEM_ID = "c0a80121-0002-4000-8000-000000000004";
const SLACK_SETUP_ITEM_ID = "c0a80121-0003-4000-8000-000000000001";

const categoryConfig = {
    documents: {
        label: "Documents",
        icon: FileText,
        color: "text-blue-300",
        accent: "#60a5fa",
        bg: "bg-blue-500/10",
        border: "border-blue-500/20"
    },
    training: {
        label: "Training",
        icon: GraduationCap,
        color: "text-violet-300",
        accent: "#a78bfa",
        bg: "bg-violet-500/10",
        border: "border-violet-500/20"
    },
    setup: {
        label: "Setup",
        icon: Laptop,
        color: "text-emerald-300",
        accent: "#6ee7b7",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/20"
    }
};

const statusConfig = {
    not_started: {
        label: "Not Started",
        color: "text-zinc-300",
        bg: "bg-zinc-500/10",
        border: "border-zinc-500/20",
        icon: Clock
    },
    in_progress: {
        label: "In Progress",
        color: "text-amber-300",
        bg: "bg-amber-500/10",
        border: "border-amber-500/20",
        icon: AlertCircle
    },
    completed: {
        label: "Completed",
        color: "text-emerald-300",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/20",
        icon: CheckCircle2
    }
};

const contractStatusConfig: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
    not_sent: {
        label: "No Contract",
        color: "text-zinc-400",
        bg: "bg-zinc-500/10",
        border: "border-zinc-500/20",
        icon: FileSignature
    },
    sending: {
        label: "Sending\u2026",
        color: "text-blue-300",
        bg: "bg-blue-500/10",
        border: "border-blue-500/20",
        icon: Send
    },
    sent: {
        label: "Awaiting Signature",
        color: "text-amber-300",
        bg: "bg-amber-500/10",
        border: "border-amber-500/20",
        icon: Send
    },
    viewed: {
        label: "Viewed",
        color: "text-blue-300",
        bg: "bg-blue-500/10",
        border: "border-blue-500/20",
        icon: Eye
    },
    signed: {
        label: "Signed",
        color: "text-emerald-300",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/20",
        icon: CheckCircle2
    },
    declined: {
        label: "Declined",
        color: "text-red-300",
        bg: "bg-red-500/10",
        border: "border-red-500/20",
        icon: XCircle
    },
    failed: {
        label: "Failed",
        color: "text-red-300",
        bg: "bg-red-500/10",
        border: "border-red-500/20",
        icon: XCircle
    }
};

// Stagger animation variants
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.06, delayChildren: 0.1 }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }
    }
};

interface OnboardingPortalProps {
    onAddNewHire: () => void;
}

export default function OnboardingPortal({ onAddNewHire }: OnboardingPortalProps) {
    const [newHires, setNewHires] = useState<NewHire[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [deleteTarget, setDeleteTarget] = useState<NewHire | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchNewHires = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data: hiresData, error: hiresError } = await supabase
                .from("onboarding_new_hires")
                .select("*")
                .order("created_at", { ascending: false });

            if (hiresError) throw hiresError;

            const { data: checklistItems, error: checklistError } = await supabase
                .from("onboarding_checklist_items")
                .select("*")
                .order("sort_order");

            if (checklistError) throw checklistError;

            const { data: progressData, error: progressError } = await supabase
                .from("onboarding_progress")
                .select("*");

            if (progressError) throw progressError;

            const employeeIds = (hiresData || [])
                .filter((h: any) => h.employee_id)
                .map((h: any) => h.employee_id);

            let employeeData: any[] = [];
            if (employeeIds.length > 0) {
                const { data: empData } = await supabase
                    .from("employee_directory")
                    .select("id, contract_status, hourly_wage, docuseal_submission_id, signed_contract_url, slack_user_id")
                    .in("id", employeeIds);
                employeeData = empData || [];
            }

            const mappedHires: NewHire[] = (hiresData || []).map((hire) => {
                const hireProgress = progressData?.filter(p => p.new_hire_id === hire.id) || [];
                const employee = employeeData.find(e => e.id === hire.employee_id);

                const checklist: ChecklistItem[] = (checklistItems || [])
                    .filter((item) => !item.country || item.country === hire.country)
                    .map((item) => {
                        const progress = hireProgress.find(p => p.checklist_item_id === item.id);
                        return {
                            id: item.id,
                            progressId: progress?.id || "",
                            title: item.title,
                            description: item.description,
                            category: item.category as ChecklistItem["category"],
                            sort_order: item.sort_order,
                            status: (progress?.status || "pending") as ChecklistItem["status"],
                            completedAt: progress?.completed_at,
                            notes: progress?.notes,
                            documentUrl: progress?.document_url || undefined
                        };
                    });

                return {
                    id: hire.id,
                    employeeId: hire.employee_id || null,
                    firstName: hire.first_name,
                    lastName: hire.last_name,
                    email: hire.email,
                    country: hire.country as "Canada" | "USA",
                    startDate: hire.start_date,
                    status: hire.status as NewHire["status"],
                    contractStatus: (employee?.contract_status || "not_sent") as NewHire["contractStatus"],
                    hourlyWage: employee?.hourly_wage ?? null,
                    signedContractUrl: employee?.signed_contract_url || null,
                    slackId: employee?.slack_user_id || null,
                    checklist
                };
            });

            setNewHires(mappedHires);
        } catch (error) {
            console.error("Error fetching onboarding data:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchNewHires();

        const channel = supabase
            .channel("onboarding-changes")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "onboarding_new_hires" },
                () => fetchNewHires()
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "onboarding_progress" },
                () => fetchNewHires()
            )
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "employee_directory" },
                () => fetchNewHires()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchNewHires]);

    const getProgress = (checklist: ChecklistItem[]) => {
        const completed = checklist.filter(item => item.status === "completed").length;
        return checklist.length > 0 ? Math.round((completed / checklist.length) * 100) : 0;
    };

    const getCategoryProgress = (checklist: ChecklistItem[], category: string) => {
        const categoryItems = checklist.filter(item => item.category === category);
        const completed = categoryItems.filter(item => item.status === "completed").length;
        return { completed, total: categoryItems.length };
    };

    const updateChecklistItemStatus = async (
        newHireId: string,
        checklistItemId: string,
        newStatus: "pending" | "in_progress" | "completed"
    ) => {
        try {
            const { data: existing } = await supabase
                .from("onboarding_progress")
                .select("id")
                .eq("new_hire_id", newHireId)
                .eq("checklist_item_id", checklistItemId)
                .single();

            if (existing) {
                await supabase
                    .from("onboarding_progress")
                    .update({
                        status: newStatus,
                        completed_at: newStatus === "completed" ? new Date().toISOString() : null,
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", existing.id);
            } else {
                await supabase
                    .from("onboarding_progress")
                    .insert({
                        new_hire_id: newHireId,
                        checklist_item_id: checklistItemId,
                        status: newStatus,
                        completed_at: newStatus === "completed" ? new Date().toISOString() : null
                    });
            }

            await updateNewHireStatus(newHireId);
        } catch (error) {
            console.error("Error updating checklist item:", error);
        }
    };

    const updateNewHireStatus = async (newHireId: string) => {
        const hire = newHires.find(h => h.id === newHireId);
        if (!hire) return;

        const completed = hire.checklist.filter(i => i.status === "completed").length;
        const total = hire.checklist.length;

        let newStatus: "not_started" | "in_progress" | "completed";
        if (completed === 0) {
            newStatus = "not_started";
        } else if (completed === total) {
            newStatus = "completed";
        } else {
            newStatus = "in_progress";
        }

        await supabase
            .from("onboarding_new_hires")
            .update({
                status: newStatus,
                completed_at: newStatus === "completed" ? new Date().toISOString() : null,
                updated_at: new Date().toISOString()
            })
            .eq("id", newHireId);
    };

    const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
    const [checkingContractId, setCheckingContractId] = useState<string | null>(null);
    const [slackIdInputs, setSlackIdInputs] = useState<Record<string, string>>({});
    const [savingSlackId, setSavingSlackId] = useState<string | null>(null);

    const handleSaveSlackId = async (hire: NewHire) => {
        if (!hire.employeeId) return;
        const slackId = slackIdInputs[hire.id]?.trim();
        if (!slackId) return;

        setSavingSlackId(hire.id);
        try {
            await supabase
                .from("employee_directory")
                .update({ slack_user_id: slackId })
                .eq("id", hire.employeeId);

            // Mark the Slack setup checklist item as completed
            await updateChecklistItemStatus(hire.id, SLACK_SETUP_ITEM_ID, "completed");
            fetchNewHires();
        } catch (error) {
            console.error("Error saving Slack ID:", error);
        } finally {
            setSavingSlackId(null);
        }
    };

    const handleDocumentUpload = async (
        newHireId: string,
        item: ChecklistItem,
        file: File
    ) => {
        setUploadingItemId(item.id);
        try {
            const fileExt = file.name.split(".").pop();
            const fileName = `onboarding/${newHireId}/${item.id}/${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from("employee_documents")
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from("employee_documents")
                .getPublicUrl(fileName);

            const publicUrl = urlData.publicUrl;

            if (item.progressId) {
                await supabase
                    .from("onboarding_progress")
                    .update({
                        document_url: publicUrl,
                        status: "completed",
                        completed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", item.progressId);
            }

            await updateNewHireStatus(newHireId);
        } catch (error) {
            console.error("Error uploading document:", error);
        } finally {
            setUploadingItemId(null);
        }
    };

    const checkContractStatus = async (hire: NewHire) => {
        if (!hire.employeeId) return;
        setCheckingContractId(hire.id);
        try {
            const res = await fetch("/api/docuseal/check-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId: hire.employeeId })
            });
            const result = await res.json();
            if (result.updated) {
                fetchNewHires();
            }
        } catch (error) {
            console.error("Error checking contract status:", error);
        } finally {
            setCheckingContractId(null);
        }
    };

    const handleDeleteNewHire = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            await supabase
                .from("onboarding_progress")
                .delete()
                .eq("new_hire_id", deleteTarget.id);

            const { error } = await supabase
                .from("onboarding_new_hires")
                .delete()
                .eq("id", deleteTarget.id);

            if (error) throw error;

            setNewHires(prev => prev.filter(h => h.id !== deleteTarget.id));
            setDeleteTarget(null);
        } catch (error) {
            console.error("Error deleting new hire:", error);
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredHires = newHires.filter(hire => {
        const matchesSearch =
            `${hire.firstName} ${hire.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
            hire.email.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === "all" || hire.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const stats = {
        total: newHires.length,
        inProgress: newHires.filter(h => h.status === "in_progress").length,
        completed: newHires.filter(h => h.status === "completed").length,
        notStarted: newHires.filter(h => h.status === "not_started").length
    };

    const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

    return (
        <div className="space-y-8 max-w-[1400px] mx-auto">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4"
            >
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-white">
                        Onboarding
                    </h1>
                    <p className="text-zinc-200 mt-2 text-base">
                        Track and manage new agent onboarding progress
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchNewHires}
                        disabled={isLoading}
                        aria-label="Refresh onboarding data"
                        className="p-3 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.1] hover:border-white/[0.14] text-zinc-300 hover:text-white transition-all duration-300 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4.5 h-4.5 ${isLoading ? "animate-spin" : ""}`} />
                    </button>
                    <ShimmerButton
                        onClick={onAddNewHire}
                        shimmerColor="#a78bfa"
                        shimmerSize="0.05em"
                        shimmerDuration="3s"
                        borderRadius="12px"
                        background="rgba(124, 58, 237, 0.9)"
                        className="shadow-lg shadow-purple-500/20"
                    >
                        <span className="flex items-center gap-2.5 text-sm font-semibold text-white">
                            <UserPlus className="w-4.5 h-4.5" />
                            Add New Hire
                        </span>
                    </ShimmerButton>
                </div>
            </motion.div>

            {/* Stats Cards */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-2 lg:grid-cols-4 gap-4"
            >
                {/* Total */}
                <motion.div
                    variants={itemVariants}
                    whileHover={{ scale: 1.03, y: -2 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className="group relative overflow-hidden rounded-2xl border border-white/[0.12] p-6 cursor-default animate-border-pulse"
                    style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)" }}
                >
                    <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.08) 0%, transparent 60%)" }} />
                    <div className="relative flex items-start justify-between">
                        <div>
                            <p className="text-sm font-semibold text-zinc-200 mb-1 tracking-wide uppercase">Total New Hires</p>
                            <p className="text-4xl font-bold text-white tracking-tight" style={{ fontVariantNumeric: "tabular-nums" }}>{stats.total}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-white/[0.1] group-hover:bg-white/[0.16] transition-all duration-300 group-hover:shadow-lg group-hover:shadow-white/[0.04]">
                            <Users className="w-5 h-5 text-white" />
                        </div>
                    </div>
                </motion.div>

                {/* In Progress */}
                <motion.div
                    variants={itemVariants}
                    whileHover={{ scale: 1.03, y: -2 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className="group relative overflow-hidden rounded-2xl border border-amber-400/20 p-6 cursor-default"
                    style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.04) 100%)" }}
                >
                    <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: "radial-gradient(circle at 70% 30%, rgba(245,158,11,0.15) 0%, transparent 60%)" }} />
                    <div className="relative flex items-start justify-between">
                        <div>
                            <p className="text-sm font-semibold text-amber-200 mb-1 tracking-wide uppercase">In Progress</p>
                            <p className="text-4xl font-bold text-amber-50 tracking-tight" style={{ fontVariantNumeric: "tabular-nums" }}>{stats.inProgress}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-amber-500/15 group-hover:bg-amber-500/25 transition-all duration-300 group-hover:shadow-lg group-hover:shadow-amber-500/10">
                            <TrendingUp className="w-5 h-5 text-amber-300" />
                        </div>
                    </div>
                </motion.div>

                {/* Completed */}
                <motion.div
                    variants={itemVariants}
                    whileHover={{ scale: 1.03, y: -2 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className="group relative overflow-hidden rounded-2xl border border-emerald-400/20 p-6 cursor-default"
                    style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.04) 100%)" }}
                >
                    <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: "radial-gradient(circle at 70% 30%, rgba(16,185,129,0.15) 0%, transparent 60%)" }} />
                    <div className="relative flex items-start justify-between">
                        <div>
                            <p className="text-sm font-semibold text-emerald-200 mb-1 tracking-wide uppercase">Completed</p>
                            <p className="text-4xl font-bold text-emerald-50 tracking-tight" style={{ fontVariantNumeric: "tabular-nums" }}>{stats.completed}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-emerald-500/15 group-hover:bg-emerald-500/25 transition-all duration-300 group-hover:shadow-lg group-hover:shadow-emerald-500/10">
                            <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                        </div>
                    </div>
                    {stats.total > 0 && (
                        <div className="relative mt-3 pt-3 border-t border-emerald-400/15">
                            <p className="text-xs text-emerald-200 font-semibold">{completionRate}% completion rate</p>
                        </div>
                    )}
                </motion.div>

                {/* Not Started */}
                <motion.div
                    variants={itemVariants}
                    whileHover={{ scale: 1.03, y: -2 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className="group relative overflow-hidden rounded-2xl border border-white/[0.12] p-6 cursor-default"
                    style={{ background: "linear-gradient(135deg, rgba(161,161,170,0.08) 0%, rgba(161,161,170,0.02) 100%)" }}
                >
                    <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: "radial-gradient(circle at 70% 30%, rgba(161,161,170,0.1) 0%, transparent 60%)" }} />
                    <div className="relative flex items-start justify-between">
                        <div>
                            <p className="text-sm font-semibold text-zinc-200 mb-1 tracking-wide uppercase">Not Started</p>
                            <p className="text-4xl font-bold text-white tracking-tight" style={{ fontVariantNumeric: "tabular-nums" }}>{stats.notStarted}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-white/[0.1] group-hover:bg-white/[0.16] transition-all duration-300 group-hover:shadow-lg group-hover:shadow-white/[0.04]">
                            <Clock className="w-5 h-5 text-zinc-200" />
                        </div>
                    </div>
                </motion.div>
            </motion.div>

            {/* Search and Filter */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
                className="flex flex-col sm:flex-row gap-3"
            >
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-zinc-300" />
                    <input
                        type="text"
                        placeholder="Search by name or email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white placeholder-zinc-300 focus:outline-none focus:bg-white/[0.08] search-focus-glow transition-all duration-300 text-sm"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    aria-label="Filter by status"
                    className="px-4 py-3.5 rounded-xl bg-white/[0.06] border border-white/[0.1] text-zinc-100 focus:outline-none search-focus-glow transition-all duration-300 cursor-pointer text-sm font-medium min-w-[140px]"
                >
                    <option value="all">All Status</option>
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                </select>
            </motion.div>

            {/* Loading State */}
            {isLoading && newHires.length === 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-20"
                >
                    <div className="relative">
                        <div className="w-12 h-12 rounded-full border-2 border-white/[0.08]" />
                        <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-t-white/40 animate-spin" />
                    </div>
                    <p className="text-zinc-400 mt-4 text-sm">Loading onboarding data...</p>
                </motion.div>
            )}

            {/* New Hires List */}
            {!isLoading && (
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="space-y-3"
                >
                    {filteredHires.map((hire, index) => {
                        const progress = getProgress(hire.checklist);
                        const isExpanded = expandedId === hire.id;
                        const config = statusConfig[hire.status];
                        const StatusIcon = config.icon;

                        return (
                            <motion.div
                                key={hire.id}
                                variants={itemVariants}
                                layout
                                className={`rounded-2xl border overflow-hidden transition-all duration-500 ${
                                    isExpanded
                                        ? "bg-white/[0.06] border-white/[0.14]"
                                        : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12]"
                                }`}
                            >
                                {/* Row Header */}
                                <div
                                    onClick={() => setExpandedId(isExpanded ? null : hire.id)}
                                    className="w-full p-5 flex items-center justify-between cursor-pointer group"
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            setExpandedId(isExpanded ? null : hire.id);
                                        }
                                    }}
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        {/* Avatar */}
                                        <div className="relative flex-shrink-0">
                                            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-white/[0.12] to-white/[0.04] flex items-center justify-center text-white/90 font-semibold text-sm tracking-wide border border-white/[0.08]">
                                                {hire.firstName[0]}{hire.lastName[0]}
                                            </div>
                                            {hire.status === "completed" && (
                                                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-zinc-950 flex items-center justify-center">
                                                    <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Name & Info */}
                                        <div className="min-w-0">
                                            <p className="font-semibold text-white text-[15px] leading-tight truncate">
                                                {hire.firstName} {hire.lastName}
                                            </p>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="flex items-center gap-1.5 text-xs text-zinc-300 truncate">
                                                    <Mail className="w-3 h-3 flex-shrink-0 text-zinc-400" />
                                                    {hire.email}
                                                </span>
                                                <span className="flex items-center gap-1 text-xs text-zinc-400">
                                                    <MapPin className="w-3 h-3 flex-shrink-0" />
                                                    {hire.country}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4 flex-shrink-0">
                                        {/* Start Date */}
                                        <div className="hidden lg:flex items-center gap-1.5 text-zinc-300">
                                            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                                            <span className="text-xs" style={{ fontVariantNumeric: "tabular-nums" }}>
                                                {new Date(hire.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                            </span>
                                        </div>

                                        {/* Onboarding Status */}
                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${config.bg} ${config.color} border ${config.border}`}>
                                            <StatusIcon className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">{config.label}</span>
                                        </span>

                                        {/* Contract Status */}
                                        {(() => {
                                            const cs = contractStatusConfig[hire.contractStatus] || contractStatusConfig.not_sent;
                                            const ContractIcon = cs.icon;
                                            return (
                                                <span className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${cs.bg} ${cs.color} border ${cs.border}`}>
                                                    <ContractIcon className="w-3.5 h-3.5" />
                                                    {cs.label}
                                                </span>
                                            );
                                        })()}

                                        {/* Progress */}
                                        <div className="flex items-center gap-3">
                                            <div className="w-24 lg:w-32 h-1.5 bg-white/[0.1] rounded-full overflow-hidden">
                                                <motion.div
                                                    className={`h-full rounded-full ${
                                                        progress === 100
                                                            ? "bg-emerald-400"
                                                            : progress > 50
                                                            ? "bg-white/70"
                                                            : "bg-white/40"
                                                    }`}
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${progress}%` }}
                                                    transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
                                                />
                                            </div>
                                            <span className="text-xs font-bold text-zinc-100 min-w-[32px] text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                                                {progress}%
                                            </span>
                                        </div>

                                        {/* Delete */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setDeleteTarget(hire);
                                            }}
                                            aria-label={`Remove ${hire.firstName} ${hire.lastName} from onboarding`}
                                            className="p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>

                                        {/* Chevron */}
                                        <motion.div
                                            animate={{ rotate: isExpanded ? 180 : 0 }}
                                            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                                        >
                                            <ChevronDown className="w-4.5 h-4.5 text-zinc-500" />
                                        </motion.div>
                                    </div>
                                </div>

                                {/* Expanded Content */}
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                                            className="overflow-hidden"
                                        >
                                            <div className="px-5 pb-6 border-t border-white/[0.08]">
                                                {/* Contract Status Card */}
                                                {hire.contractStatus !== "not_sent" && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 8 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: 0.1 }}
                                                        className={`mt-5 p-5 rounded-xl border ${
                                                            hire.contractStatus === "signed"
                                                                ? "bg-emerald-500/[0.04] border-emerald-500/[0.15]"
                                                                : hire.contractStatus === "failed" || hire.contractStatus === "declined"
                                                                ? "bg-red-500/[0.04] border-red-500/[0.15]"
                                                                : "bg-white/[0.02] border-white/[0.06]"
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`p-2 rounded-lg ${
                                                                    hire.contractStatus === "signed" ? "bg-emerald-500/10" :
                                                                    hire.contractStatus === "failed" || hire.contractStatus === "declined" ? "bg-red-500/10" : "bg-white/[0.06]"
                                                                }`}>
                                                                    <FileSignature className={`w-4.5 h-4.5 ${
                                                                        hire.contractStatus === "signed" ? "text-emerald-300" :
                                                                        hire.contractStatus === "failed" || hire.contractStatus === "declined" ? "text-red-300" : "text-zinc-300"
                                                                    }`} />
                                                                </div>
                                                                <div>
                                                                    <p className="font-semibold text-white text-sm">Employment Contract</p>
                                                                    <p className={`text-xs mt-0.5 ${
                                                                        hire.contractStatus === "signed" ? "text-emerald-300/80" :
                                                                        hire.contractStatus === "failed" || hire.contractStatus === "declined" ? "text-red-300/80" : "text-zinc-400"
                                                                    }`}>
                                                                        {contractStatusConfig[hire.contractStatus]?.label || hire.contractStatus}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {hire.signedContractUrl && (
                                                                    <a
                                                                        href={hire.signedContractUrl}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500/10 text-emerald-300 text-xs font-medium hover:bg-emerald-500/20 border border-emerald-500/20 transition-all duration-200"
                                                                    >
                                                                        <Download className="w-3.5 h-3.5" />
                                                                        Download Signed
                                                                        <ArrowUpRight className="w-3 h-3 opacity-60" />
                                                                    </a>
                                                                )}
                                                                {hire.contractStatus !== "signed" && hire.contractStatus !== "not_sent" && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            checkContractStatus(hire);
                                                                        }}
                                                                        disabled={checkingContractId === hire.id}
                                                                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/[0.04] text-zinc-300 text-xs font-medium hover:bg-white/[0.08] border border-white/[0.06] transition-all duration-200 disabled:opacity-50"
                                                                    >
                                                                        {checkingContractId === hire.id ? (
                                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                        ) : (
                                                                            <RefreshCw className="w-3.5 h-3.5" />
                                                                        )}
                                                                        Check Status
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}

                                                {/* Category Progress Overview */}
                                                <div className="grid grid-cols-3 gap-3 mt-5">
                                                    {(Object.keys(categoryConfig) as Array<keyof typeof categoryConfig>).map((category, catIdx) => {
                                                        const catConfig = categoryConfig[category];
                                                        const CategoryIcon = catConfig.icon;
                                                        const { completed, total } = getCategoryProgress(hire.checklist, category);
                                                        const catProgress = total > 0 ? Math.round((completed / total) * 100) : 0;

                                                        return (
                                                            <motion.div
                                                                key={category}
                                                                initial={{ opacity: 0, y: 8 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                transition={{ delay: 0.15 + catIdx * 0.05 }}
                                                                className={`p-4 rounded-xl border ${catConfig.border} overflow-hidden`}
                                                                style={{ background: `linear-gradient(135deg, ${catConfig.accent}14 0%, ${catConfig.accent}06 100%)`, borderLeftWidth: 3, borderLeftColor: catConfig.accent }}
                                                            >
                                                                <div className="flex items-center gap-2 mb-3">
                                                                    <CategoryIcon className={`w-4 h-4 ${catConfig.color}`} />
                                                                    <span className={`font-semibold text-xs tracking-wide uppercase ${catConfig.color}`}>{catConfig.label}</span>
                                                                </div>
                                                                <div className="flex items-baseline justify-between">
                                                                    <span className="text-2xl font-bold text-white" style={{ fontVariantNumeric: "tabular-nums" }}>{completed}<span className="text-zinc-400 text-sm font-medium">/{total}</span></span>
                                                                    <span className={`text-sm font-bold ${catConfig.color}`} style={{ fontVariantNumeric: "tabular-nums" }}>{catProgress}%</span>
                                                                </div>
                                                                <div className="w-full h-1.5 bg-white/[0.08] rounded-full mt-3 overflow-hidden">
                                                                    <motion.div
                                                                        className="h-full rounded-full"
                                                                        style={{ backgroundColor: catConfig.accent }}
                                                                        initial={{ width: 0 }}
                                                                        animate={{ width: `${catProgress}%` }}
                                                                        transition={{ duration: 0.6, delay: 0.2 + catIdx * 0.05, ease: [0.25, 0.1, 0.25, 1] }}
                                                                    />
                                                                </div>
                                                            </motion.div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Checklist Items by Category */}
                                                <div className="space-y-4 mt-5">
                                                    {(Object.keys(categoryConfig) as Array<keyof typeof categoryConfig>).map((category) => {
                                                        const catConfig = categoryConfig[category];
                                                        const CategoryIcon = catConfig.icon;
                                                        const items = hire.checklist.filter(item => item.category === category);

                                                        if (items.length === 0) return null;

                                                        return (
                                                            <div key={category} className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-4">
                                                                <div className="flex items-center gap-2.5 mb-4 pb-3" style={{ borderBottom: `1px solid ${catConfig.accent}20` }}>
                                                                    <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${catConfig.accent}15` }}>
                                                                        <CategoryIcon className={`w-4 h-4 ${catConfig.color}`} />
                                                                    </div>
                                                                    <h3 className={`font-bold text-sm tracking-wide ${catConfig.color}`}>{catConfig.label}</h3>
                                                                    <span className="text-[11px] text-zinc-500 ml-auto font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
                                                                        {items.filter(i => i.status === "completed").length}/{items.length}
                                                                    </span>
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    {items.map((item) => {
                                                                        const isContractItem = item.id === CONTRACT_CHECKLIST_ITEM_ID;
                                                                        const isMaterialsSent = item.id === MATERIALS_SENT_ITEM_ID;
                                                                        const isPortalTraining = item.id === PORTAL_TRAINING_ITEM_ID;
                                                                        const isSlackSetup = item.id === SLACK_SETUP_ITEM_ID;
                                                                        const isAutoManaged = isContractItem || isMaterialsSent;

                                                                        // Icon for each special item type
                                                                        const getItemIcon = () => {
                                                                            if (isContractItem) return FileSignature;
                                                                            if (isMaterialsSent) return PackageCheck;
                                                                            if (isPortalTraining) return MonitorPlay;
                                                                            if (isSlackSetup) return MessageSquare;
                                                                            if (item.title.includes("Zoom")) return Video;
                                                                            if (item.title.includes("Supervised")) return Headphones;
                                                                            return null;
                                                                        };
                                                                        const SpecialIcon = getItemIcon();

                                                                        return (
                                                                        <div
                                                                            key={item.id}
                                                                            className={`p-3 rounded-lg transition-all duration-200 ${
                                                                                isPortalTraining && item.status !== "completed"
                                                                                    ? "bg-violet-500/[0.04] border border-violet-500/[0.1] border-l-2 border-l-violet-400/40"
                                                                                    : item.status === "completed"
                                                                                    ? "bg-emerald-500/[0.06] border border-emerald-500/[0.12] border-l-2 border-l-emerald-400/60"
                                                                                    : item.status === "in_progress"
                                                                                    ? "bg-amber-500/[0.06] border border-amber-500/[0.12] border-l-2 border-l-amber-400/60"
                                                                                    : "bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.1]"
                                                                            }`}
                                                                        >
                                                                            <div className="flex items-center justify-between">
                                                                            <div className="flex items-center gap-3 min-w-0">
                                                                                {isAutoManaged ? (
                                                                                    /* Auto-managed items - non-clickable status */
                                                                                    <div className="flex-shrink-0" title={isContractItem ? "Auto-managed via DocuSeal" : "Auto-completed when email is sent"}>
                                                                                        {item.status === "completed" ? (
                                                                                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                                                                        ) : item.status === "in_progress" ? (
                                                                                            <div className="relative">
                                                                                                {SpecialIcon ? <SpecialIcon className="w-5 h-5 text-amber-400" /> : <AlertCircle className="w-5 h-5 text-amber-400" />}
                                                                                                <div className="absolute inset-0 w-5 h-5 rounded-full bg-amber-400/20 animate-ping" />
                                                                                            </div>
                                                                                        ) : (
                                                                                            SpecialIcon ? <SpecialIcon className="w-5 h-5 text-zinc-600" /> : <div className="w-5 h-5 rounded-full border-2 border-zinc-600" />
                                                                                        )}
                                                                                    </div>
                                                                                ) : isPortalTraining && item.status !== "completed" ? (
                                                                                    /* Portal training - coming soon placeholder */
                                                                                    <div className="flex-shrink-0" title="Coming Soon">
                                                                                        <Lock className="w-5 h-5 text-violet-400/60" />
                                                                                    </div>
                                                                                ) : (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        const nextStatus =
                                                                                            item.status === "pending" ? "in_progress" :
                                                                                            item.status === "in_progress" ? "completed" : "pending";
                                                                                        updateChecklistItemStatus(hire.id, item.id, nextStatus);
                                                                                    }}
                                                                                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-full flex-shrink-0"
                                                                                    aria-label={`Mark ${item.title} as ${item.status === "pending" ? "in progress" : item.status === "in_progress" ? "completed" : "pending"}`}
                                                                                >
                                                                                    {item.status === "completed" ? (
                                                                                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                                                                    ) : item.status === "in_progress" ? (
                                                                                        <div className="relative">
                                                                                            {SpecialIcon ? <SpecialIcon className="w-5 h-5 text-amber-400" /> : <AlertCircle className="w-5 h-5 text-amber-400" />}
                                                                                            <div className="absolute inset-0 w-5 h-5 rounded-full bg-amber-400/20 animate-ping" />
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="w-5 h-5 rounded-full border-2 border-zinc-500 hover:border-zinc-300 transition-colors duration-200" />
                                                                                    )}
                                                                                </button>
                                                                                )}
                                                                                <div className="min-w-0">
                                                                                    <span className={`text-sm font-medium block truncate ${
                                                                                        isPortalTraining && item.status !== "completed"
                                                                                            ? "text-violet-300/70"
                                                                                            : item.status === "completed" ? "text-zinc-400 line-through decoration-zinc-600" : "text-white"
                                                                                    }`}>
                                                                                        {item.title}
                                                                                        {isPortalTraining && item.status !== "completed" && (
                                                                                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/20">
                                                                                                Coming Soon
                                                                                            </span>
                                                                                        )}
                                                                                    </span>
                                                                                    {isContractItem ? (
                                                                                        <p className="text-xs text-zinc-400 mt-0.5 truncate">
                                                                                            {hire.contractStatus === "signed" ? "Signed via DocuSeal" :
                                                                                             hire.contractStatus === "opened" ? "Opened by employee" :
                                                                                             hire.contractStatus === "sent" ? "Sent — awaiting signature" :
                                                                                             hire.contractStatus === "sending" ? "Sending..." :
                                                                                             "Not sent yet"}
                                                                                        </p>
                                                                                    ) : isMaterialsSent ? (
                                                                                        <p className="text-xs text-zinc-400 mt-0.5 truncate">
                                                                                            {item.status === "completed" ? "Sent with onboarding package" : "Sent automatically with onboarding email"}
                                                                                        </p>
                                                                                    ) : isPortalTraining && item.status !== "completed" ? (
                                                                                        <p className="text-xs text-violet-300/40 mt-0.5 truncate">
                                                                                            Video series, quizzes & certificate — under development
                                                                                        </p>
                                                                                    ) : isSlackSetup ? (
                                                                                        <p className="text-xs text-zinc-400 mt-0.5 truncate">
                                                                                            {hire.slackId ? `@${hire.slackId}` : "Enter Slack ID to complete"}
                                                                                        </p>
                                                                                    ) : item.description ? (
                                                                                        <p className="text-xs text-zinc-400 mt-0.5 truncate">{item.description}</p>
                                                                                    ) : null}
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                                                                                {item.documentUrl && (
                                                                                    <a
                                                                                        href={item.documentUrl}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-500/10 text-emerald-300 text-xs font-medium hover:bg-emerald-500/15 border border-emerald-500/15 transition-all duration-200"
                                                                                    >
                                                                                        <ExternalLink className="w-3 h-3" />
                                                                                        View
                                                                                    </a>
                                                                                )}
                                                                                {isContractItem ? (
                                                                                    /* Contract item: show status badge instead of Upload */
                                                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border ${
                                                                                        hire.contractStatus === "signed"
                                                                                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/15"
                                                                                            : hire.contractStatus === "opened"
                                                                                            ? "bg-amber-500/10 text-amber-300 border-amber-500/15"
                                                                                            : hire.contractStatus === "sent"
                                                                                            ? "bg-blue-500/10 text-blue-300 border-blue-500/15"
                                                                                            : "bg-white/[0.04] text-zinc-400 border-white/[0.06]"
                                                                                    }`}>
                                                                                        {hire.contractStatus === "signed" ? (
                                                                                            <><CheckCircle2 className="w-3 h-3" /> Signed</>
                                                                                        ) : hire.contractStatus === "opened" ? (
                                                                                            <><Eye className="w-3 h-3" /> Opened</>
                                                                                        ) : hire.contractStatus === "sent" ? (
                                                                                            <><Send className="w-3 h-3" /> Sent</>
                                                                                        ) : (
                                                                                            <><XCircle className="w-3 h-3" /> Not Sent</>
                                                                                        )}
                                                                                    </span>
                                                                                ) : isMaterialsSent ? (
                                                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border ${
                                                                                        item.status === "completed"
                                                                                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/15"
                                                                                            : "bg-white/[0.04] text-zinc-400 border-white/[0.06]"
                                                                                    }`}>
                                                                                        {item.status === "completed" ? (
                                                                                            <><CheckCircle2 className="w-3 h-3" /> Sent</>
                                                                                        ) : (
                                                                                            <><Mail className="w-3 h-3" /> Pending</>
                                                                                        )}
                                                                                    </span>
                                                                                ) : isPortalTraining && item.status !== "completed" ? (
                                                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border bg-violet-500/[0.06] text-violet-300/60 border-violet-500/[0.12]">
                                                                                        <Lock className="w-3 h-3" /> Locked
                                                                                    </span>
                                                                                ) : item.category === "documents" ? (
                                                                                    <label
                                                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all duration-200 border ${
                                                                                            uploadingItemId === item.id
                                                                                                ? "bg-purple-500/15 text-purple-200 border-purple-500/20"
                                                                                                : "bg-purple-500/[0.08] text-purple-200 hover:bg-purple-500/15 border-purple-500/15 hover:border-purple-500/25"
                                                                                        }`}
                                                                                    >
                                                                                        {uploadingItemId === item.id ? (
                                                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                                                        ) : (
                                                                                            <Upload className="w-3 h-3" />
                                                                                        )}
                                                                                        {item.documentUrl ? "Replace" : "Upload"}
                                                                                        <input
                                                                                            type="file"
                                                                                            className="hidden"
                                                                                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                                                                            disabled={uploadingItemId === item.id}
                                                                                            onChange={(e) => {
                                                                                                const file = e.target.files?.[0];
                                                                                                if (file) {
                                                                                                    handleDocumentUpload(hire.id, item, file);
                                                                                                }
                                                                                                e.target.value = "";
                                                                                            }}
                                                                                        />
                                                                                    </label>
                                                                                ) : null}
                                                                                {item.completedAt && (
                                                                                    <span className="text-[11px] text-zinc-400 hidden sm:inline font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
                                                                                        {new Date(item.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            </div>
                                                                            {/* Slack ID inline input for setup item */}
                                                                            {isSlackSetup && item.status !== "completed" && (
                                                                                <div className="mt-2.5 flex items-center gap-2 pl-8">
                                                                                    <div className="relative flex-1 max-w-[240px]">
                                                                                        <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                                                                                        <input
                                                                                            type="text"
                                                                                            placeholder="Enter Slack ID..."
                                                                                            value={slackIdInputs[hire.id] || ""}
                                                                                            onChange={(e) => setSlackIdInputs(prev => ({ ...prev, [hire.id]: e.target.value }))}
                                                                                            onClick={(e) => e.stopPropagation()}
                                                                                            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-emerald-500/30 focus:bg-white/[0.07] transition-all"
                                                                                        />
                                                                                    </div>
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleSaveSlackId(hire);
                                                                                        }}
                                                                                        disabled={!slackIdInputs[hire.id]?.trim() || savingSlackId === hire.id}
                                                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 text-xs font-medium hover:bg-emerald-500/20 border border-emerald-500/20 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                                                                                    >
                                                                                        {savingSlackId === hire.id ? (
                                                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                                                        ) : (
                                                                                            <CheckCircle2 className="w-3 h-3" />
                                                                                        )}
                                                                                        Save
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                            {/* Show saved Slack ID when completed */}
                                                                            {isSlackSetup && item.status === "completed" && hire.slackId && (
                                                                                <div className="mt-1.5 pl-8">
                                                                                    <span className="inline-flex items-center gap-1 text-xs text-emerald-300/70">
                                                                                        <Hash className="w-3 h-3" />
                                                                                        {hire.slackId}
                                                                                    </span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })}

                    {filteredHires.length === 0 && !isLoading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex flex-col items-center justify-center py-20"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
                                <Users className="w-7 h-7 text-zinc-600" />
                            </div>
                            <p className="text-zinc-300 text-sm">
                                {newHires.length === 0
                                    ? "No new hires yet"
                                    : "No results matching your criteria"}
                            </p>
                            {newHires.length === 0 && (
                                <button
                                    onClick={onAddNewHire}
                                    className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.06] text-zinc-300 text-sm font-medium hover:bg-white/[0.1] border border-white/[0.06] transition-all duration-200"
                                >
                                    <UserPlus className="w-4 h-4" />
                                    Add your first hire
                                </button>
                            )}
                        </motion.div>
                    )}
                </motion.div>
            )}

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {deleteTarget && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
                        onClick={() => !isDeleting && setDeleteTarget(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-sm mx-4 bg-zinc-900 rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden"
                        >
                            <div className="p-6 space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/15">
                                        <Trash2 className="w-5 h-5 text-red-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-white">Remove from Onboarding</h3>
                                        <p className="text-xs text-zinc-500 mt-0.5">This action cannot be undone</p>
                                    </div>
                                </div>

                                <p className="text-sm text-zinc-300 leading-relaxed">
                                    Are you sure you want to remove <span className="font-semibold text-white">{deleteTarget.firstName} {deleteTarget.lastName}</span>? All checklist progress will be deleted.
                                </p>

                                <div className="flex gap-3 pt-1">
                                    <button
                                        onClick={() => setDeleteTarget(null)}
                                        disabled={isDeleting}
                                        className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-zinc-300 text-sm font-medium hover:bg-white/[0.1] border border-white/[0.06] transition-all duration-200 disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleDeleteNewHire}
                                        disabled={isDeleting}
                                        className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-500 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {isDeleting ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Removing\u2026
                                            </>
                                        ) : (
                                            "Remove"
                                        )}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

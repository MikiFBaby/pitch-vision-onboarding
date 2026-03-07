"use client";

import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
    Rocket,
    Users,
    Mail,
    CheckCircle2,
    UserCheck,
    ToggleLeft,
    ToggleRight,
    Send,
    Eye,
    AlertCircle,
    Loader2,
    RefreshCw,
    AlertTriangle,
    Shield,
} from "lucide-react";

const APP_ROLES = ["agent", "manager", "qa", "hr", "executive", "payroll"] as const;
type AppRole = (typeof APP_ROLES)[number];

const ROLE_LABELS: Record<AppRole, string> = {
    agent: "Agent",
    manager: "Manager",
    qa: "QA",
    hr: "HR",
    executive: "Executive",
    payroll: "Payroll",
};

const ROLE_COLORS: Record<AppRole, string> = {
    agent: "blue",
    manager: "amber",
    qa: "purple",
    hr: "emerald",
    executive: "rose",
    payroll: "cyan",
};

interface RoleStats {
    active: number;
    invited: number;
    signedUp: number;
    completed: number;
    missingEmail: number;
}

interface ProgressData {
    totalActive: number;
    invited: number;
    signedUp: number;
    completed: number;
    missingEmail: number;
    byRole: Record<string, RoleStats>;
    accessByRole: Record<string, boolean>;
}

interface InviteStats {
    total: number;
    sent: number;
    failed: number;
    pending: number;
    missingEmail: number;
    byRole: Record<string, { total: number; sent: number; failed: number; pending: number; missingEmail: number }>;
}

export default function LaunchControlPage() {
    const [stats, setStats] = useState<ProgressData | null>(null);
    const [inviteStats, setInviteStats] = useState<InviteStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState<string | null>(null); // role being sent, or null
    const [sendResult, setSendResult] = useState<{ sent: number; failed: number; role: string } | null>(null);
    const [testEmail, setTestEmail] = useState("");
    const [testRole, setTestRole] = useState<AppRole>("agent");
    const [testSending, setTestSending] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);
    const [previewHtml, setPreviewHtml] = useState<string | null>(null);
    const [previewRole, setPreviewRole] = useState<AppRole>("agent");
    const [showPreview, setShowPreview] = useState(false);
    const [togglingRole, setTogglingRole] = useState<string | null>(null);
    const [confirmSend, setConfirmSend] = useState<AppRole | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const [progressRes, inviteRes] = await Promise.all([
                fetch("/api/onboarding/progress"),
                fetch("/api/onboarding/bulk-invite"),
            ]);
            const progressData = await progressRes.json();
            const inviteData = await inviteRes.json();
            setStats(progressData);
            setInviteStats(inviteData);
        } catch (err) {
            console.error("Failed to fetch launch data:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleToggleRole = async (role: AppRole) => {
        if (!stats || togglingRole) return;
        setTogglingRole(role);
        try {
            const newValue = stats.accessByRole[role] ? "disabled" : "enabled";
            const res = await fetch("/api/onboarding/access-toggle", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "role_toggle", role, value: newValue }),
            });
            const data = await res.json();
            if (data.success) {
                setStats((prev) =>
                    prev
                        ? {
                              ...prev,
                              accessByRole: { ...prev.accessByRole, [role]: data.enabled },
                          }
                        : prev
                );
            }
        } catch (err) {
            console.error("Toggle failed:", err);
        } finally {
            setTogglingRole(null);
        }
    };

    const handleSendInvites = async (role: AppRole) => {
        if (sending) return;
        setConfirmSend(null);
        setSending(role);
        setSendResult(null);
        try {
            const res = await fetch("/api/onboarding/bulk-invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "send", role }),
            });
            const data = await res.json();
            if (data.success) {
                setSendResult({ sent: data.sent, failed: data.failed, role: ROLE_LABELS[role] });
                fetchData();
            }
        } catch (err) {
            console.error("Send failed:", err);
        } finally {
            setSending(null);
        }
    };

    const handleTestEmail = async () => {
        if (!testEmail || testSending) return;
        setTestSending(true);
        setTestResult(null);
        try {
            const res = await fetch("/api/onboarding/bulk-invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "test", email: testEmail, firstName: "Test", role: testRole }),
            });
            const data = await res.json();
            setTestResult(data.success ? `Test email sent (${ROLE_LABELS[testRole]} template)!` : `Failed: ${data.error}`);
        } catch {
            setTestResult("Failed to send test email");
        } finally {
            setTestSending(false);
        }
    };

    const handlePreview = async (role: AppRole) => {
        try {
            setPreviewRole(role);
            const res = await fetch("/api/onboarding/bulk-invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "preview", role }),
            });
            const data = await res.json();
            setPreviewHtml(data.html);
            setShowPreview(true);
        } catch (err) {
            console.error("Preview failed:", err);
        }
    };

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center h-96">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                </div>
            </DashboardLayout>
        );
    }

    const completionPct =
        stats && stats.totalActive > 0
            ? Math.round((stats.completed / stats.totalActive) * 100)
            : 0;

    return (
        <DashboardLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-4xl xl:text-5xl font-bold tracking-tight text-white group cursor-default">
                            Launch Control
                            <Rocket className="inline-block ml-3 w-8 h-8 text-emerald-500" />
                        </h2>
                        <p className="text-white/50 text-base xl:text-lg font-medium">
                            Send invites, track registrations, and control portal access across all roles.
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            setLoading(true);
                            fetchData();
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all text-sm"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                </div>

                {/* Global Stats Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    <StatCard
                        icon={<Users className="w-5 h-5" />}
                        label="Total Active"
                        value={stats?.totalActive || 0}
                        color="blue"
                    />
                    <StatCard
                        icon={<Mail className="w-5 h-5" />}
                        label="Invites Sent"
                        value={stats?.invited || 0}
                        total={stats?.totalActive || 0}
                        color="amber"
                    />
                    <StatCard
                        icon={<UserCheck className="w-5 h-5" />}
                        label="Signed Up"
                        value={stats?.signedUp || 0}
                        total={stats?.totalActive || 0}
                        color="purple"
                    />
                    <StatCard
                        icon={<CheckCircle2 className="w-5 h-5" />}
                        label="Completed"
                        value={stats?.completed || 0}
                        total={stats?.totalActive || 0}
                        color="emerald"
                    />
                    {(stats?.missingEmail || 0) > 0 && (
                        <StatCard
                            icon={<AlertTriangle className="w-5 h-5" />}
                            label="Missing Email"
                            value={stats?.missingEmail || 0}
                            color="rose"
                        />
                    )}
                </div>

                {/* Progress Bar */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-white/70 text-sm font-medium">Overall Registration</span>
                        <span className="text-white font-bold text-lg">{completionPct}%</span>
                    </div>
                    <div className="w-full h-4 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400"
                            initial={{ width: 0 }}
                            animate={{ width: `${completionPct}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                        />
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-white/40">
                        <span>
                            {stats?.completed || 0} of {stats?.totalActive || 0} employees registered
                        </span>
                        {completionPct === 100 && (
                            <span className="text-emerald-400 font-bold">All Registered!</span>
                        )}
                    </div>
                </div>

                {/* Per-Role Breakdown */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-400" />
                        Registration by Role
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {APP_ROLES.map((role) => {
                            const rs = stats?.byRole?.[role];
                            if (!rs || rs.active === 0) return null;
                            const pct = rs.active > 0 ? Math.round((rs.signedUp / rs.active) * 100) : 0;
                            const pending = inviteStats?.byRole?.[role]?.pending || 0;

                            return (
                                <div
                                    key={role}
                                    className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-white font-semibold text-sm">
                                            {ROLE_LABELS[role]}
                                        </span>
                                        <span className="text-white/40 text-xs">{pct}% registered</span>
                                    </div>

                                    {/* Mini progress bar */}
                                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-500"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>

                                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                                        <div>
                                            <p className="text-white/40">Active</p>
                                            <p className="text-white font-bold">{rs.active}</p>
                                        </div>
                                        <div>
                                            <p className="text-white/40">Invited</p>
                                            <p className="text-amber-400 font-bold">{rs.invited}</p>
                                        </div>
                                        <div>
                                            <p className="text-white/40">Signed Up</p>
                                            <p className="text-purple-400 font-bold">{rs.signedUp}</p>
                                        </div>
                                        <div>
                                            <p className="text-white/40">Completed</p>
                                            <p className="text-emerald-400 font-bold">{rs.completed}</p>
                                        </div>
                                    </div>

                                    {rs.missingEmail > 0 && (
                                        <p className="text-xs text-amber-400/70 flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" />
                                            {rs.missingEmail} missing email{rs.missingEmail > 1 ? "s" : ""}
                                        </p>
                                    )}

                                    {/* Per-role actions */}
                                    <div className="flex gap-2 pt-1">
                                        <button
                                            onClick={() => setConfirmSend(role)}
                                            disabled={!!sending || pending === 0}
                                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-medium text-xs hover:from-emerald-500 hover:to-emerald-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            {sending === role ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                                <Send className="w-3 h-3" />
                                            )}
                                            {sending === role
                                                ? "Sending..."
                                                : pending > 0
                                                ? `Send ${pending}`
                                                : "All Sent"}
                                        </button>
                                        <button
                                            onClick={() => handlePreview(role)}
                                            className="px-3 py-2 rounded-lg bg-white/10 text-white/60 hover:text-white hover:bg-white/15 transition-all"
                                            title="Preview email"
                                        >
                                            <Eye className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Send Result */}
                <AnimatePresence>
                    {sendResult && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-sm p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                        >
                            Sent {sendResult.sent} {sendResult.role} invite(s)
                            {sendResult.failed > 0 ? `, ${sendResult.failed} failed` : ""}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Two Column: Test Email + Access Control */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Test Email */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Mail className="w-5 h-5 text-amber-500" />
                            Test Email
                        </h3>
                        <p className="text-white/40 text-sm">
                            Send a test invite to preview how it looks for each role.
                        </p>

                        <div className="flex gap-2">
                            <input
                                type="email"
                                value={testEmail}
                                onChange={(e) => setTestEmail(e.target.value)}
                                placeholder="test@example.com"
                                className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50"
                            />
                            <select
                                value={testRole}
                                onChange={(e) => setTestRole(e.target.value as AppRole)}
                                className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm focus:outline-none focus:border-emerald-500/50"
                            >
                                {APP_ROLES.map((r) => (
                                    <option key={r} value={r} className="bg-gray-900">
                                        {ROLE_LABELS[r]}
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={handleTestEmail}
                                disabled={testSending || !testEmail}
                                className="px-4 py-2 rounded-lg bg-white/10 text-white/70 hover:text-white hover:bg-white/15 transition-all text-sm disabled:opacity-50"
                            >
                                {testSending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send"}
                            </button>
                        </div>
                        {testResult && (
                            <p
                                className={`text-xs mt-1 ${
                                    testResult.includes("sent") ? "text-emerald-400" : "text-red-400"
                                }`}
                            >
                                {testResult}
                            </p>
                        )}
                    </div>

                    {/* Access Control */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Shield className="w-5 h-5 text-indigo-400" />
                            Portal Access Control
                        </h3>
                        <p className="text-white/40 text-sm">
                            Toggle portal access per role. All roles start disabled — enable when ready.
                        </p>

                        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                            {APP_ROLES.map((role) => {
                                const isEnabled = stats?.accessByRole?.[role] || false;
                                const active = stats?.byRole?.[role]?.active || 0;
                                if (active === 0) return null;

                                return (
                                    <div
                                        key={role}
                                        className="bg-white/5 rounded-xl p-3 flex items-center justify-between"
                                    >
                                        <div>
                                            <p className="text-white font-medium text-sm">
                                                {ROLE_LABELS[role]}
                                            </p>
                                            <p className="text-white/40 text-xs">
                                                {isEnabled ? "Enabled" : "Disabled"}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleToggleRole(role)}
                                            disabled={togglingRole === role}
                                            className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${
                                                isEnabled ? "bg-emerald-500" : "bg-white/20"
                                            }`}
                                        >
                                            <motion.div
                                                className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-lg"
                                                animate={{ left: isEnabled ? 26 : 2 }}
                                                transition={{
                                                    type: "spring",
                                                    stiffness: 500,
                                                    damping: 30,
                                                }}
                                            />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="text-xs text-white/30 space-y-1 pt-2 border-t border-white/10">
                            <p>
                                When <strong className="text-white/50">OFF</strong>, users see a
                                &quot;Coming Soon&quot; page after signing up.
                            </p>
                            <p>
                                When <strong className="text-white/50">ON</strong>, users can access their
                                portal.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Send Confirmation Modal */}
            <AnimatePresence>
                {confirmSend && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                        onClick={() => setConfirmSend(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className="text-white font-bold text-lg">Confirm Send</h3>
                            <p className="text-white/60 text-sm">
                                You are about to send{" "}
                                <strong className="text-white">
                                    {inviteStats?.byRole?.[confirmSend]?.pending || 0}
                                </strong>{" "}
                                invite(s) to{" "}
                                <strong className="text-white">{ROLE_LABELS[confirmSend]}</strong> employees.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => handleSendInvites(confirmSend)}
                                    className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-semibold hover:from-emerald-500 hover:to-emerald-400 transition-all"
                                >
                                    Send Invites
                                </button>
                                <button
                                    onClick={() => setConfirmSend(null)}
                                    className="px-4 py-3 rounded-xl bg-white/10 text-white/60 hover:text-white hover:bg-white/15 transition-all"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Email Preview Modal */}
            <AnimatePresence>
                {showPreview && previewHtml && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                        onClick={() => setShowPreview(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between p-4 border-b border-white/10">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-white font-bold">Email Preview</h3>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                        {ROLE_LABELS[previewRole]}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {APP_ROLES.map((r) => (
                                        <button
                                            key={r}
                                            onClick={() => handlePreview(r)}
                                            className={`text-xs px-2 py-1 rounded-lg transition-all ${
                                                previewRole === r
                                                    ? "bg-white/15 text-white"
                                                    : "text-white/40 hover:text-white/70"
                                            }`}
                                        >
                                            {ROLE_LABELS[r]}
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => setShowPreview(false)}
                                        className="text-white/50 hover:text-white ml-2"
                                    >
                                        &times;
                                    </button>
                                </div>
                            </div>
                            <div className="overflow-auto max-h-[70vh]">
                                <iframe
                                    srcDoc={previewHtml}
                                    className="w-full h-[600px] border-0"
                                    title="Email Preview"
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </DashboardLayout>
    );
}

// ---------------------------------------------------------------------------
// Stat Card Component
// ---------------------------------------------------------------------------
function StatCard({
    icon,
    label,
    value,
    total,
    color,
}: {
    icon: React.ReactNode;
    label: string;
    value: number;
    total?: number;
    color: "blue" | "amber" | "purple" | "emerald" | "rose" | "cyan";
}) {
    const colorMap: Record<string, string> = {
        blue: "from-blue-500/20 to-blue-600/10 border-blue-500/20 text-blue-400",
        amber: "from-amber-500/20 to-amber-600/10 border-amber-500/20 text-amber-400",
        purple: "from-purple-500/20 to-purple-600/10 border-purple-500/20 text-purple-400",
        emerald: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/20 text-emerald-400",
        rose: "from-rose-500/20 to-rose-600/10 border-rose-500/20 text-rose-400",
        cyan: "from-cyan-500/20 to-cyan-600/10 border-cyan-500/20 text-cyan-400",
    };

    return (
        <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-2xl p-5`}>
            <div className="flex items-center gap-2 mb-2">
                {icon}
                <span className="text-white/50 text-sm">{label}</span>
            </div>
            <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-white">{value}</span>
                {total !== undefined && <span className="text-white/40 text-sm">/ {total}</span>}
            </div>
        </div>
    );
}

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
} from "lucide-react";

interface ProgressStats {
    totalActive: number;
    invited: number;
    signedUp: number;
    completed: number;
    globalAccess: boolean;
}

interface InviteStats {
    total: number;
    sent: number;
    failed: number;
    pending: number;
}

export default function LaunchControlPage() {
    const [stats, setStats] = useState<ProgressStats | null>(null);
    const [inviteStats, setInviteStats] = useState<InviteStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState(false);
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null);
    const [testEmail, setTestEmail] = useState("");
    const [testSending, setTestSending] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);
    const [previewHtml, setPreviewHtml] = useState<string | null>(null);
    const [showPreview, setShowPreview] = useState(false);

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

    const handleToggleAccess = async () => {
        if (!stats) return;
        setToggling(true);
        try {
            const newValue = stats.globalAccess ? "disabled" : "enabled";
            const res = await fetch("/api/onboarding/access-toggle", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "global", value: newValue }),
            });
            const data = await res.json();
            if (data.success) {
                setStats((prev) => prev ? { ...prev, globalAccess: data.globalAccess } : prev);
            }
        } catch (err) {
            console.error("Toggle failed:", err);
        } finally {
            setToggling(false);
        }
    };

    const handleSendInvites = async () => {
        if (sending) return;
        setSending(true);
        setSendResult(null);
        try {
            const res = await fetch("/api/onboarding/bulk-invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "send" }),
            });
            const data = await res.json();
            if (data.success) {
                setSendResult({ sent: data.sent, failed: data.failed });
                fetchData(); // Refresh stats
            }
        } catch (err) {
            console.error("Send failed:", err);
        } finally {
            setSending(false);
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
                body: JSON.stringify({ action: "test", email: testEmail, firstName: "Test" }),
            });
            const data = await res.json();
            setTestResult(data.success ? "Test email sent!" : `Failed: ${data.error}`);
        } catch (err) {
            setTestResult("Failed to send test email");
        } finally {
            setTestSending(false);
        }
    };

    const handlePreview = async () => {
        try {
            const res = await fetch("/api/onboarding/bulk-invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "preview" }),
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

    const completionPct = stats && stats.totalActive > 0
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
                            Send invites, track onboarding progress, and control portal access.
                        </p>
                    </div>
                    <button
                        onClick={() => { setLoading(true); fetchData(); }}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all text-sm"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                        icon={<Users className="w-5 h-5" />}
                        label="Active Agents"
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
                        label="Profiles Completed"
                        value={stats?.completed || 0}
                        total={stats?.totalActive || 0}
                        color="emerald"
                    />
                </div>

                {/* Progress Bar */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-white/70 text-sm font-medium">Overall Completion</span>
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
                        <span>{stats?.completed || 0} of {stats?.totalActive || 0} agents completed</span>
                        {completionPct === 100 && (
                            <span className="text-emerald-400 font-bold">Ready for Launch!</span>
                        )}
                    </div>
                </div>

                {/* Two Column: Invite Control + Access Control */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Invite Control */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Send className="w-5 h-5 text-amber-500" />
                            Invite Management
                        </h3>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="bg-white/5 rounded-xl p-3">
                                <p className="text-white/50">Pending</p>
                                <p className="text-2xl font-bold text-white">{inviteStats?.pending || 0}</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-3">
                                <p className="text-white/50">Sent</p>
                                <p className="text-2xl font-bold text-emerald-400">{inviteStats?.sent || 0}</p>
                            </div>
                        </div>

                        {inviteStats && inviteStats.failed > 0 && (
                            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 rounded-lg p-3">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                {inviteStats.failed} invite(s) failed to send
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={handleSendInvites}
                                disabled={sending || (inviteStats?.pending === 0)}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-semibold hover:from-emerald-500 hover:to-emerald-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {sending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                                {sending ? "Sending..." : `Send ${inviteStats?.pending || 0} Invites`}
                            </button>
                            <button
                                onClick={handlePreview}
                                className="px-4 py-3 rounded-xl bg-white/10 text-white/70 hover:text-white hover:bg-white/15 transition-all"
                            >
                                <Eye className="w-4 h-4" />
                            </button>
                        </div>

                        <AnimatePresence>
                            {sendResult && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="text-sm p-3 rounded-lg bg-emerald-500/10 text-emerald-400"
                                >
                                    Sent {sendResult.sent} invite(s){sendResult.failed > 0 ? `, ${sendResult.failed} failed` : ""}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Test Email */}
                        <div className="border-t border-white/10 pt-4">
                            <p className="text-white/50 text-xs mb-2">Send test email</p>
                            <div className="flex gap-2">
                                <input
                                    type="email"
                                    value={testEmail}
                                    onChange={(e) => setTestEmail(e.target.value)}
                                    placeholder="test@example.com"
                                    className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50"
                                />
                                <button
                                    onClick={handleTestEmail}
                                    disabled={testSending || !testEmail}
                                    className="px-4 py-2 rounded-lg bg-white/10 text-white/70 hover:text-white hover:bg-white/15 transition-all text-sm disabled:opacity-50"
                                >
                                    {testSending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Test"}
                                </button>
                            </div>
                            {testResult && (
                                <p className={`text-xs mt-2 ${testResult.includes("sent") ? "text-emerald-400" : "text-red-400"}`}>
                                    {testResult}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Access Control */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            {stats?.globalAccess ? (
                                <ToggleRight className="w-5 h-5 text-emerald-500" />
                            ) : (
                                <ToggleLeft className="w-5 h-5 text-white/40" />
                            )}
                            Portal Access Control
                        </h3>

                        <div className="bg-white/5 rounded-xl p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-white font-semibold">Agent Portal Access</p>
                                    <p className="text-white/50 text-sm mt-1">
                                        {stats?.globalAccess
                                            ? "Agents can access their dashboard"
                                            : "Agents see the \"Coming Soon\" screen"}
                                    </p>
                                </div>
                                <button
                                    onClick={handleToggleAccess}
                                    disabled={toggling}
                                    className={`relative w-16 h-8 rounded-full transition-colors duration-300 ${
                                        stats?.globalAccess ? "bg-emerald-500" : "bg-white/20"
                                    }`}
                                >
                                    <motion.div
                                        className="absolute top-1 w-6 h-6 rounded-full bg-white shadow-lg"
                                        animate={{ left: stats?.globalAccess ? 34 : 4 }}
                                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                    />
                                </button>
                            </div>
                        </div>

                        <div className="text-sm text-white/40 space-y-2">
                            <p className="font-medium text-white/60">How access works:</p>
                            <ul className="space-y-1 ml-4 list-disc">
                                <li>When <strong className="text-white/70">OFF</strong>, agents who sign up will see the &quot;Coming Soon&quot; page</li>
                                <li>When <strong className="text-white/70">ON</strong>, all agents with completed profiles can access the portal</li>
                                <li>Per-agent overrides can be set to grant or block individual access</li>
                            </ul>
                        </div>

                        {stats?.globalAccess && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 rounded-lg p-3"
                            >
                                <Rocket className="w-4 h-4" />
                                Portal is LIVE — agents can access their dashboard
                            </motion.div>
                        )}
                    </div>
                </div>
            </div>

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
                                <h3 className="text-white font-bold">Email Preview</h3>
                                <button
                                    onClick={() => setShowPreview(false)}
                                    className="text-white/50 hover:text-white"
                                >
                                    &times;
                                </button>
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
    color: "blue" | "amber" | "purple" | "emerald";
}) {
    const colorMap = {
        blue: "from-blue-500/20 to-blue-600/10 border-blue-500/20 text-blue-400",
        amber: "from-amber-500/20 to-amber-600/10 border-amber-500/20 text-amber-400",
        purple: "from-purple-500/20 to-purple-600/10 border-purple-500/20 text-purple-400",
        emerald: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/20 text-emerald-400",
    };

    return (
        <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-2xl p-5`}>
            <div className="flex items-center gap-2 mb-2">
                {icon}
                <span className="text-white/50 text-sm">{label}</span>
            </div>
            <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-white">{value}</span>
                {total !== undefined && (
                    <span className="text-white/40 text-sm">/ {total}</span>
                )}
            </div>
        </div>
    );
}

"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import {
    AlertTriangle, Eye, TrendingUp, TrendingDown, Minus,
    Mail, Send, X, CheckCircle2, Loader2, Ban, ChevronUp, ChevronDown,
    Calendar, Flame,
} from "lucide-react";
import { toTitleCase } from "@/lib/hr-utils";
import EmployeeProfileDrawer from "./EmployeeProfileDrawer";
import AgentBaseballCard from "./AgentBaseballCard";

type Trend = "worsening" | "improving" | "stable" | "new";

interface WatchListAgent {
    name: string;
    plannedCount: number;
    unplannedCount: number;
    occurrenceScore: number;
    recentScore: number;
    isActive: boolean;
    email?: string;
    employeeId?: string;
    trend: Trend;
    recentCount: number;
    priorCount: number;
    recentPlannedCount: number;
    recentUnplannedCount: number;
}

interface DrawerEmployee {
    id: string;
    first_name: string;
    last_name: string;
    role: string | null;
    email: string | null;
    slack_display_name: string | null;
    slack_user_id: string | null;
    user_image: string | null;
    documents?: { name: string; path: string; type: string; size: number; uploaded_at: string }[];
    phone: string | null;
    country: string | null;
    employee_status: string | null;
    hired_at: string | null;
    contract_status: string | null;
    signed_contract_url: string | null;
    signed_contract_audit_url: string | null;
    contract_signed_at: string | null;
    docuseal_submission_id: string | null;
    hourly_wage: number | null;
    training_start_date: string | null;
    current_campaigns?: string[] | null;
}

interface EmailModalState {
    isOpen: boolean;
    mode: 'single' | 'bulk';
    targetAgent?: WatchListAgent;
    subject: string;
    body: string;
}

/** Parse "13 Feb 2026" or ISO "2026-02-13" to local-time Date object.
 *  Avoids Date.parse() for date-only ISO strings which are treated as UTC. */
function parseAbsenceDate(s: string): Date | null {
    if (!s) return null;
    const trimmed = s.trim();

    // ISO date-only "YYYY-MM-DD" → parse as local time (not UTC)
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    }

    // "13 Feb 2026" (D Mon YYYY)
    const months: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const parts = trimmed.split(/\s+/);
    if (parts.length === 3 && months[parts[1]] !== undefined) {
        return new Date(parseInt(parts[2]), months[parts[1]], parseInt(parts[0]));
    }

    // Fallback — let the browser try
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
}

export default function HRAttendanceWatchList() {
    const [loading, setLoading] = useState(true);
    const [watchList, setWatchList] = useState<WatchListAgent[]>([]);
    const [emailModal, setEmailModal] = useState<EmailModalState>({
        isOpen: false,
        mode: 'single',
        subject: '',
        body: '',
    });
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
    const [hoveredRow, setHoveredRow] = useState<number | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<DrawerEmployee | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isCardOpen, setIsCardOpen] = useState(false);
    const [cardAttendance, setCardAttendance] = useState<{
        recentUnplannedCount: number;
        recentPlannedCount: number; recentScore: number;
        occurrenceScore: number; trend: "worsening" | "improving" | "stable" | "new";
    } | null>(null);
    const COLLAPSED_COUNT = 10;

    const handleAgentClick = useCallback(async (agent: WatchListAgent) => {
        if (!agent.employeeId) return;
        const { data } = await supabase
            .from('employee_directory')
            .select('*')
            .eq('id', agent.employeeId)
            .maybeSingle();
        if (data) {
            setSelectedEmployee(data as DrawerEmployee);
            setCardAttendance({
                recentUnplannedCount: agent.recentUnplannedCount,
                recentPlannedCount: agent.recentPlannedCount,
                recentScore: agent.recentScore,
                occurrenceScore: agent.occurrenceScore,
                trend: agent.trend,
            });
            setIsCardOpen(true);
        }
    }, []);

    const getEmailTemplate = useCallback((agentName: string, unplannedCount: number) => {
        const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        return {
            subject: `Attendance Notice - ${agentName}`,
            body: `Dear ${agentName},

This email is to inform you that as of ${today}, our records indicate you have had ${unplannedCount} unplanned absence${unplannedCount !== 1 ? 's' : ''}.

Consistent attendance is essential for team performance and operational efficiency. We encourage you to review your attendance records and reach out to your supervisor or HR if there are any circumstances we should be aware of.

Please consider this a friendly reminder to maintain regular attendance going forward.

Best regards,
HR Team
Pitch Perfect Solutions`
        };
    }, []);

    const logWriteUp = useCallback(async (agent: WatchListAgent, subject: string, body: string, messageId: string, status: string) => {
        try {
            await supabase.from('employee_write_ups').insert({
                employee_id: agent.employeeId || null,
                employee_name: agent.name,
                employee_email: agent.email || null,
                type: 'attendance_notice',
                subject,
                body,
                sent_by: 'HR Team',
                message_id: messageId,
                status,
            });
        } catch (err) {
            console.error('Failed to log write-up:', err);
        }
    }, []);

    const openEmailModal = useCallback((mode: 'single' | 'bulk', agent?: WatchListAgent) => {
        if (mode === 'single' && agent) {
            const template = getEmailTemplate(agent.name, agent.unplannedCount);
            setEmailModal({
                isOpen: true,
                mode: 'single',
                targetAgent: agent,
                subject: template.subject,
                body: template.body,
            });
        } else {
            setEmailModal({
                isOpen: true,
                mode: 'bulk',
                subject: 'Attendance Notice',
                body: `Dear [Agent Name],

This email is to inform you that as of ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}, our records indicate you have had [Absence Count] unplanned absences.

Consistent attendance is essential for team performance and operational efficiency. We encourage you to review your attendance records and reach out to your supervisor or HR if there are any circumstances we should be aware of.

Please consider this a friendly reminder to maintain regular attendance going forward.

Best regards,
HR Team
Pitch Perfect Solutions`,
            });
        }
        setSendResult(null);
    }, [getEmailTemplate]);

    const closeEmailModal = useCallback(() => {
        setEmailModal(prev => ({ ...prev, isOpen: false }));
        setSendResult(null);
    }, []);

    const sendEmail = useCallback(async () => {
        setSending(true);
        setSendResult(null);

        try {
            if (emailModal.mode === 'single' && emailModal.targetAgent) {
                const agent = emailModal.targetAgent;
                if (!agent.email) {
                    setSendResult({ success: false, message: `No email found for ${agent.name}` });
                    setSending(false);
                    return;
                }

                const res = await fetch('/api/email/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: agent.email,
                        subject: emailModal.subject,
                        text: emailModal.body,
                        html: emailModal.body.replace(/\n/g, '<br/>'),
                        senderName: 'HR Team',
                    }),
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({ error: 'Server error' }));
                    await logWriteUp(agent, emailModal.subject, emailModal.body, '', 'failed');
                    setSendResult({ success: false, message: errData.error || `Server returned ${res.status}` });
                    setSending(false);
                    return;
                }

                const data = await res.json();
                if (data.success && data.messageId) {
                    await logWriteUp(agent, emailModal.subject, emailModal.body, data.messageId, data.simulated ? 'simulated' : 'sent');
                    setSendResult({
                        success: true,
                        message: data.simulated
                            ? `Email queued (simulation mode) for ${agent.name}`
                            : `Email delivered to ${agent.name} (ID: ${data.messageId})`
                    });
                } else {
                    await logWriteUp(agent, emailModal.subject, emailModal.body, '', 'failed');
                    setSendResult({ success: false, message: data.error || 'Email delivery could not be confirmed' });
                }
            } else {
                // Bulk send
                const agentsWithEmail = watchList.filter(a => a.email);
                if (agentsWithEmail.length === 0) {
                    setSendResult({ success: false, message: 'No agents have email addresses on file' });
                    setSending(false);
                    return;
                }

                let sent = 0;
                let failed = 0;

                for (const agent of agentsWithEmail) {
                    const template = getEmailTemplate(agent.name, agent.unplannedCount);
                    try {
                        const res = await fetch('/api/email/send', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                to: agent.email,
                                subject: template.subject,
                                text: template.body,
                                html: template.body.replace(/\n/g, '<br/>'),
                                senderName: 'HR Team',
                            }),
                        });

                        if (!res.ok) {
                            await logWriteUp(agent, template.subject, template.body, '', 'failed');
                            failed++;
                            continue;
                        }

                        const data = await res.json();
                        if (data.success && data.messageId) {
                            await logWriteUp(agent, template.subject, template.body, data.messageId, data.simulated ? 'simulated' : 'sent');
                            sent++;
                        } else {
                            await logWriteUp(agent, template.subject, template.body, '', 'failed');
                            failed++;
                        }
                    } catch {
                        await logWriteUp(agent, template.subject, template.body, '', 'failed');
                        failed++;
                    }
                }

                setSendResult({
                    success: failed === 0,
                    message: `Delivered ${sent} of ${agentsWithEmail.length} emails${failed > 0 ? ` (${failed} failed)` : ''}`
                });
            }
        } catch (error: any) {
            setSendResult({ success: false, message: error.message || 'Failed to send email' });
        } finally {
            setSending(false);
        }
    }, [emailModal, watchList, getEmailTemplate, logWriteUp]);

    const fetchData = useCallback(async () => {
        setLoading(true);

        try {
            // Parallel fetch: employee directory + Non Booked Days Off (sole absence source)
            const [empRes, absRes] = await Promise.all([
                supabase.from('employee_directory').select('id, first_name, last_name, email').eq('employee_status', 'Active'),
                supabase.from('Non Booked Days Off').select('"Agent Name", "Reason", "Date"'),
            ]);

            const emailMap = new Map<string, string>();
            const idMap = new Map<string, string>();
            const activeNames = new Set<string>();
            (empRes.data || []).forEach((emp: any) => {
                const fullName = `${emp.first_name} ${emp.last_name}`.trim().toLowerCase();
                activeNames.add(fullName);
                if (emp.email) emailMap.set(fullName, emp.email);
                idMap.set(fullName, emp.id);
            });

            // Date windows: 90-day lookback for occurrence score, 14/28 days for trend
            const now = new Date();
            const lookbackCutoff = new Date(now);
            lookbackCutoff.setDate(lookbackCutoff.getDate() - 90);
            const recentCutoff = new Date(now);
            recentCutoff.setDate(recentCutoff.getDate() - 14);
            const priorCutoff = new Date(now);
            priorCutoff.setDate(priorCutoff.getDate() - 28);

            // Count absences per agent from Non Booked Days Off (sole source)
            // Scored by recency: 90-day lookback for chronic patterns, 14/28 days for trend
            const absenceCounts = new Map<string, number>();
            const recentAbsenceCounts = new Map<string, number>();
            const recentAbsences = new Map<string, number>();
            const priorAbsences = new Map<string, number>();
            const seen = new Set<string>(); // agent|date dedup
            (absRes.data || []).forEach((row: any) => {
                const name = (row['Agent Name'] || '').trim().toLowerCase();
                if (!name || !(row['Reason'] || '').trim()) return;

                const dateRaw = (row['Date'] || '').trim();
                const d = parseAbsenceDate(dateRaw);
                const isoDate = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : dateRaw;
                const dedupKey = `${name}|${isoDate}`;
                if (seen.has(dedupKey)) return;
                seen.add(dedupKey);

                // Skip events older than 90 days for scoring
                if (d && d < lookbackCutoff) return;

                absenceCounts.set(name, (absenceCounts.get(name) || 0) + 1);

                if (d) {
                    if (d >= recentCutoff) {
                        recentAbsences.set(name, (recentAbsences.get(name) || 0) + 1);
                        recentAbsenceCounts.set(name, (recentAbsenceCounts.get(name) || 0) + 1);
                    } else if (d >= priorCutoff) {
                        priorAbsences.set(name, (priorAbsences.get(name) || 0) + 1);
                    }
                }
            });

            // Compute trend per agent (14d vs prior 14d)
            const getTrend = (nameLower: string): { trend: Trend; recent: number; prior: number } => {
                const recent = recentAbsences.get(nameLower) || 0;
                const prior = priorAbsences.get(nameLower) || 0;
                if (recent === 0 && prior === 0) return { trend: 'new', recent, prior };
                if (recent > prior) return { trend: 'worsening', recent, prior };
                if (recent < prior) return { trend: 'improving', recent, prior };
                return { trend: 'stable', recent, prior };
            };

            // Build watch list from NB absence counts
            const agentMap = new Map<string, WatchListAgent>();
            absenceCounts.forEach((count, nameLower) => {
                if (!activeNames.has(nameLower)) return;
                const { trend, recent, prior } = getTrend(nameLower);
                const recentCount = recentAbsenceCounts.get(nameLower) || 0;
                agentMap.set(nameLower, {
                    name: toTitleCase(nameLower),
                    plannedCount: 0,
                    unplannedCount: count,
                    occurrenceScore: count * 1.5,
                    recentScore: recentCount * 1.5,
                    isActive: true,
                    email: emailMap.get(nameLower),
                    employeeId: idMap.get(nameLower),
                    trend,
                    recentCount: recent,
                    priorCount: prior,
                    recentPlannedCount: 0,
                    recentUnplannedCount: recentCount,
                });
            });

            // Only flag agents with recent (14d) activity OR chronic pattern (3+ in 90 days)
            const processed = Array.from(agentMap.values())
                .filter(a => a.recentScore > 0 || a.occurrenceScore >= 4.5);

            setWatchList(processed);

        } catch (error) {
            console.error("Error fetching attendance watch list:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();

        // Real-time subscriptions for instant updates
        const channels = [
            supabase.channel('attendance_watchlist_absences').on('postgres_changes', { event: '*', schema: 'public', table: 'Non Booked Days Off' }, fetchData).subscribe(),
        ];

        // 15-minute polling backup — Supabase real-time can occasionally disconnect
        const pollInterval = setInterval(fetchData, 15 * 60 * 1000);

        return () => {
            channels.forEach(c => supabase.removeChannel(c));
            clearInterval(pollInterval);
        };
    }, [fetchData]);

    if (loading) {
        return <Skeleton className="h-[300px] w-full rounded-2xl" />;
    }

    // Sort by recent (14-day) score primary, occurrence score secondary
    const sortedList = watchList
        .sort((a, b) => b.recentScore - a.recentScore || b.occurrenceScore - a.occurrenceScore);

    const maxScore = Math.max(...sortedList.map(a => a.recentScore), 1);

    const getSeverity = (agent: WatchListAgent): 'critical' | 'warning' | 'caution' => {
        if (agent.recentScore >= 4) return 'critical';
        if (agent.recentScore >= 2) return 'warning';
        return 'caution';
    };

    const worseningCount = sortedList.filter(a => a.trend === 'worsening').length;
    const criticalCount = sortedList.filter(a => getSeverity(a) === 'critical').length;

    const trendDelta = (agent: WatchListAgent) => {
        const diff = agent.recentCount - agent.priorCount;
        if (diff > 0) return `+${diff}`;
        if (diff < 0) return `${diff}`;
        return '0';
    };

    // Total recent events for the header
    const totalRecentEvents = sortedList.reduce((sum, a) => sum + a.recentPlannedCount + a.recentUnplannedCount, 0);

    return (
        <>
            <Card className="relative bg-[#0c0f16] border-white/[0.08] text-white overflow-hidden shadow-xl shadow-black/40 h-full flex flex-col">
                {/* Subtle noise texture */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.02]" style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.04) 2px, rgba(255,255,255,0.04) 4px)',
                }} />

                {/* Top severity accent */}
                <div className={`absolute top-0 inset-x-0 h-[2px] ${
                    criticalCount > 0
                        ? 'bg-gradient-to-r from-transparent via-red-500 to-transparent animate-pulse'
                        : sortedList.length > 0
                            ? 'bg-gradient-to-r from-transparent via-rose-500/40 to-transparent'
                            : 'bg-gradient-to-r from-transparent via-white/10 to-transparent'
                }`} />

                <CardHeader className="pb-2 relative z-10">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1.5">
                            <CardTitle className="text-[15px] font-semibold flex items-center gap-2.5 tracking-tight">
                                <div className="relative w-7 h-7 rounded-lg bg-rose-500/15 flex items-center justify-center border border-rose-500/20">
                                    <Eye className="w-3.5 h-3.5 text-rose-400" />
                                    {criticalCount > 0 && (
                                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border border-[#0c0f16] animate-pulse" />
                                    )}
                                </div>
                                Attendance Watch List
                                <span className="text-[11px] font-normal text-white/30 ml-0.5">14-day window</span>
                            </CardTitle>

                            {/* Compact summary stats */}
                            {sortedList.length > 0 && (
                                <div className="flex items-center gap-3 text-[11px] pl-[38px]">
                                    <span className="text-white/50 tabular-nums">
                                        <span className="text-white/80 font-semibold">{sortedList.length}</span> flagged
                                    </span>
                                    {criticalCount > 0 && (
                                        <span className="flex items-center gap-1 text-red-400/90 font-medium">
                                            <Flame className="w-3 h-3" />
                                            {criticalCount} critical
                                        </span>
                                    )}
                                    {worseningCount > 0 && (
                                        <span className="flex items-center gap-1 text-amber-400/80 font-medium">
                                            <TrendingUp className="w-3 h-3" />
                                            {worseningCount} worsening
                                        </span>
                                    )}
                                    <span className="text-white/30 tabular-nums">
                                        {totalRecentEvents} events
                                    </span>
                                </div>
                            )}
                        </div>

                        {sortedList.length > 0 && (
                            <button
                                onClick={() => openEmailModal('bulk')}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white/55 hover:text-white hover:bg-white/[0.1] hover:border-white/[0.18] transition-all text-[11px] font-semibold"
                            >
                                <Send className="w-3 h-3" />
                                Notify All
                            </button>
                        )}
                    </div>
                </CardHeader>

                <CardContent className="pt-0 flex-1 flex flex-col relative z-10">
                    {sortedList.length === 0 ? (
                        <div className="h-[200px] flex flex-col items-center justify-center text-white/30">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-3">
                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            </div>
                            <span className="text-sm font-medium">No attendance issues detected</span>
                            <span className="text-[11px] text-white/20 mt-1">All agents are in good standing</span>
                        </div>
                    ) : (
                        <div className="space-y-0 flex-1 flex flex-col">
                            {/* Column headers */}
                            <div className="flex items-center gap-2 px-2 pb-2 mb-0.5 border-b border-white/[0.08] text-[10px] text-white/40 uppercase tracking-[0.08em] font-semibold select-none">
                                <span className="w-5 shrink-0 text-center">#</span>
                                <span className="flex-1 pl-1">Agent</span>
                                <span className="w-[140px] shrink-0 text-center">Recent Activity</span>
                                <span className="w-[52px] shrink-0 text-center">Trend</span>
                                <span className="w-[42px] shrink-0 text-right">Score</span>
                                <span className="w-7 shrink-0" />
                            </div>

                            <AnimatePresence>
                                {(expanded ? sortedList : sortedList.slice(0, COLLAPSED_COUNT)).map((agent, index) => {
                                    const severity = getSeverity(agent);
                                    const barPct = (agent.recentScore / maxScore) * 100;
                                    const isHovered = hoveredRow === index;
                                    const isWorsening = agent.trend === 'worsening';
                                    const isImproving = agent.trend === 'improving';
                                    const totalAllTime = agent.plannedCount + agent.unplannedCount;

                                    return (
                                        <motion.div
                                            key={agent.name}
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: 0.3, delay: index * 0.03 }}
                                            onMouseEnter={() => setHoveredRow(index)}
                                            onMouseLeave={() => setHoveredRow(null)}
                                            className={`group relative flex items-center gap-2 px-2 py-[9px] rounded-lg transition-all duration-150 ${
                                                isHovered ? 'bg-white/[0.035]' : ''
                                            } ${severity === 'critical'
                                                ? 'border-l-2 border-l-red-500/60'
                                                : severity === 'warning'
                                                    ? 'border-l-2 border-l-amber-500/40'
                                                    : 'border-l-2 border-l-transparent'
                                            }`}
                                        >
                                            {/* Rank */}
                                            <div className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold tabular-nums shrink-0 ${
                                                index === 0 ? 'bg-red-500/25 text-red-300 ring-1 ring-red-500/30'
                                                    : index < 3 ? 'bg-white/[0.08] text-white/70'
                                                        : 'bg-transparent text-white/35'
                                            }`}>
                                                {index + 1}
                                            </div>

                                            {/* Agent name + score bar + all-time context */}
                                            <div className="flex-1 min-w-0 pl-1">
                                                <div className="flex items-baseline gap-2 mb-1">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleAgentClick(agent); }}
                                                        className={`text-[13px] font-semibold leading-none text-left ${
                                                            agent.employeeId
                                                                ? 'text-white/90 hover:text-white hover:underline underline-offset-2 decoration-white/30 cursor-pointer'
                                                                : 'text-white/50 cursor-default'
                                                        } transition-colors`}
                                                        title={agent.employeeId ? `View profile for ${agent.name}` : agent.name}
                                                        disabled={!agent.employeeId}
                                                    >
                                                        {agent.name}
                                                    </button>
                                                    {totalAllTime > 0 && (
                                                        <span className="text-[10px] text-white/25 tabular-nums shrink-0" title={`${totalAllTime} total events (90 days)`}>
                                                            {totalAllTime} total
                                                        </span>
                                                    )}
                                                </div>
                                                {/* Score bar */}
                                                <div className="h-[2px] bg-white/[0.05] rounded-full overflow-hidden">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${barPct}%` }}
                                                        transition={{ duration: 0.6, delay: index * 0.03 + 0.15, ease: "easeOut" }}
                                                        className={`h-full rounded-full ${
                                                            severity === 'critical' ? 'bg-red-500' :
                                                            severity === 'warning' ? 'bg-amber-500' :
                                                            'bg-yellow-500/60'
                                                        }`}
                                                    />
                                                </div>
                                            </div>

                                            {/* Recent activity — single merged column */}
                                            <div className="w-[140px] shrink-0 flex items-center justify-center gap-1.5">
                                                {agent.recentUnplannedCount > 0 && (
                                                    <span
                                                        className="inline-flex items-center gap-[3px] text-[10px] font-semibold tabular-nums px-1.5 py-[2px] rounded bg-amber-500/15 text-amber-300"
                                                        title={`${agent.recentUnplannedCount} unplanned in last 14 days`}
                                                    >
                                                        <AlertTriangle className="w-[10px] h-[10px]" />
                                                        {agent.recentUnplannedCount}
                                                    </span>
                                                )}
                                                {agent.recentPlannedCount > 0 && (
                                                    <span
                                                        className="inline-flex items-center gap-[3px] text-[10px] font-medium tabular-nums px-1.5 py-[2px] rounded bg-white/[0.06] text-white/40"
                                                        title={`${agent.recentPlannedCount} planned in last 14 days`}
                                                    >
                                                        <Calendar className="w-[10px] h-[10px]" />
                                                        {agent.recentPlannedCount}
                                                    </span>
                                                )}
                                                {agent.recentPlannedCount === 0 && agent.recentUnplannedCount === 0 && (
                                                    <span className="text-[10px] text-white/20">no recent</span>
                                                )}
                                            </div>

                                            {/* Trend */}
                                            <div className="w-[52px] shrink-0 flex items-center justify-center">
                                                <div className={`flex items-center gap-0.5 text-[11px] font-bold tabular-nums px-1.5 py-[2px] rounded ${
                                                    isWorsening
                                                        ? 'text-red-400'
                                                        : isImproving
                                                            ? 'text-emerald-400'
                                                            : agent.trend === 'new'
                                                                ? 'text-sky-400/70'
                                                                : 'text-white/25'
                                                }`}>
                                                    {isWorsening && <TrendingUp className="w-3 h-3" />}
                                                    {isImproving && <TrendingDown className="w-3 h-3" />}
                                                    {agent.trend === 'stable' && <Minus className="w-3 h-3" />}
                                                    {agent.trend === 'new' && <span className="text-[8px] font-black tracking-wider">NEW</span>}
                                                    <span>{trendDelta(agent)}</span>
                                                </div>
                                            </div>

                                            {/* Score */}
                                            <div className="w-[42px] shrink-0 text-right">
                                                <span className={`inline-block text-[11px] font-bold tabular-nums px-[6px] py-[2px] rounded ${
                                                    severity === 'critical'
                                                        ? 'bg-red-500/20 text-red-300 ring-1 ring-inset ring-red-500/25'
                                                        : severity === 'warning'
                                                            ? 'bg-amber-500/15 text-amber-300'
                                                            : 'bg-white/[0.06] text-white/50'
                                                }`}>
                                                    {agent.recentScore > 0 ? agent.recentScore.toFixed(1) : agent.occurrenceScore.toFixed(1)}
                                                </span>
                                            </div>

                                            {/* Mail action */}
                                            <button
                                                onClick={() => openEmailModal('single', agent)}
                                                className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md text-white/15 hover:text-white/70 hover:bg-white/[0.08] transition-all opacity-0 group-hover:opacity-100"
                                                title={`Send notice to ${agent.name}`}
                                            >
                                                <Mail className="w-3.5 h-3.5" />
                                            </button>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>

                            {sortedList.length > COLLAPSED_COUNT && (
                                <button
                                    onClick={() => setExpanded(prev => !prev)}
                                    className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all text-[11px] font-semibold"
                                >
                                    {expanded ? (
                                        <>Show Less <ChevronUp className="w-3 h-3" /></>
                                    ) : (
                                        <>Show {sortedList.length - COLLAPSED_COUNT} More <ChevronDown className="w-3 h-3" /></>
                                    )}
                                </button>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Email Compose Modal */}
            <AnimatePresence>
                {emailModal.isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="bg-[#12141c] border border-white/[0.08] rounded-2xl w-full max-w-lg shadow-2xl"
                        >
                            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                                <h3 className="text-white text-sm font-semibold flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-lg bg-rose-500/10 flex items-center justify-center">
                                        <Mail className="w-3 h-3 text-rose-400" />
                                    </div>
                                    {emailModal.mode === 'single'
                                        ? `Send Notice to ${emailModal.targetAgent?.name}`
                                        : `Send Notice to All (${watchList.filter(a => a.email).length} agents)`
                                    }
                                </h3>
                                <button onClick={closeEmailModal} className="text-white/30 hover:text-white/60 p-1 transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="px-6 py-4 space-y-4">
                                {emailModal.mode === 'single' && emailModal.targetAgent && (
                                    <div className="text-[11px] text-white/40">
                                        To: <span className="text-white/70">{emailModal.targetAgent.email || 'No email on file'}</span>
                                    </div>
                                )}

                                {emailModal.mode === 'bulk' && (
                                    <div className="text-[11px] text-white/40">
                                        Sending individualized emails to {watchList.filter(a => a.email).length} agents with emails on file.
                                        {watchList.filter(a => !a.email).length > 0 && (
                                            <span className="text-amber-400/70 ml-1">
                                                ({watchList.filter(a => !a.email).length} missing email)
                                            </span>
                                        )}
                                    </div>
                                )}

                                <div>
                                    <label className="text-[11px] font-medium text-white/40 mb-1.5 block">Subject</label>
                                    <input
                                        type="text"
                                        value={emailModal.subject}
                                        onChange={(e) => setEmailModal(prev => ({ ...prev, subject: e.target.value }))}
                                        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500/30 transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="text-[11px] font-medium text-white/40 mb-1.5 block">Message</label>
                                    <textarea
                                        value={emailModal.body}
                                        onChange={(e) => setEmailModal(prev => ({ ...prev, body: e.target.value }))}
                                        rows={10}
                                        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500/30 transition-colors resize-none"
                                    />
                                </div>

                                {emailModal.mode === 'bulk' && (
                                    <p className="text-[11px] text-white/25">
                                        [Agent Name] and [Absence Count] will be replaced with each agent&apos;s data.
                                    </p>
                                )}

                                {sendResult && (
                                    <div className={`flex items-center gap-2 text-xs px-3 py-2.5 rounded-lg ${
                                        sendResult.success ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'bg-red-500/10 text-red-400 border border-red-500/15'
                                    }`}>
                                        {sendResult.success ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                                        {sendResult.message}
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/[0.06]">
                                <button
                                    onClick={closeEmailModal}
                                    className="px-4 py-2 rounded-lg text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={sendEmail}
                                    disabled={sending || (emailModal.mode === 'single' && !emailModal.targetAgent?.email)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-500/90 text-white font-medium text-xs hover:bg-rose-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {sending ? (
                                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</>
                                    ) : (
                                        <><Send className="w-3.5 h-3.5" /> {emailModal.mode === 'single' ? 'Send Email' : 'Send to All'}</>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Agent Baseball Card */}
            <AgentBaseballCard
                isOpen={isCardOpen}
                onClose={() => { setIsCardOpen(false); setSelectedEmployee(null); setCardAttendance(null); }}
                employee={selectedEmployee as any}
                attendance={cardAttendance || undefined}
                onViewFullProfile={() => {
                    setIsCardOpen(false);
                    setIsDrawerOpen(true);
                }}
            />

            {/* Full Profile Drawer (opened from card's "View Full Profile") */}
            <EmployeeProfileDrawer
                isOpen={isDrawerOpen}
                onClose={() => { setIsDrawerOpen(false); setSelectedEmployee(null); }}
                employee={selectedEmployee as any}
            />
        </>
    );
}

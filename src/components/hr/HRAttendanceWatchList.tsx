"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Eye, TrendingUp, Mail, Send, X, CheckCircle2, Loader2 } from "lucide-react";
import { toTitleCase } from "@/lib/hr-utils";

interface WatchListAgent {
    name: string;
    absenceCount: number;
    isActive: boolean;
    email?: string;
    employeeId?: string;
}

interface EmailModalState {
    isOpen: boolean;
    mode: 'single' | 'bulk';
    targetAgent?: WatchListAgent;
    subject: string;
    body: string;
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

    const getEmailTemplate = useCallback((agentName: string, absenceCount: number) => {
        const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        return {
            subject: `Attendance Notice - ${agentName}`,
            body: `Dear ${agentName},

This email is to inform you that as of ${today}, our records indicate you have had ${absenceCount} unscheduled absence${absenceCount !== 1 ? 's' : ''}.

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
            const template = getEmailTemplate(agent.name, agent.absenceCount);
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

This email is to inform you that as of ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}, our records indicate you have had [Absence Count] unscheduled absences.

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
                    const template = getEmailTemplate(agent.name, agent.absenceCount);
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
            const { data: schedules } = await supabase
                .from('Agent Schedule')
                .select('"First Name", "Last Name"');

            const activeNames = new Set<string>();
            schedules?.forEach((agent: any) => {
                const fullName = `${agent['First Name']} ${agent['Last Name']}`.trim().toLowerCase();
                activeNames.add(fullName);
            });

            // Get emails + IDs from employee directory
            const { data: employees } = await supabase
                .from('employee_directory')
                .select('id, first_name, last_name, email')
                .eq('employee_status', 'Active');

            const emailMap = new Map<string, string>();
            const idMap = new Map<string, string>();
            employees?.forEach((emp: any) => {
                const fullName = `${emp.first_name} ${emp.last_name}`.trim().toLowerCase();
                if (emp.email) emailMap.set(fullName, emp.email);
                idMap.set(fullName, emp.id);
            });

            const { data: watchData } = await supabase
                .from('Agent Attendance Watch List')
                .select('*')
                .order('"COUNTA of Reason"', { ascending: false });

            if (!watchData || watchData.length === 0) {
                setWatchList([]);
                setLoading(false);
                return;
            }

            const processed: WatchListAgent[] = watchData
                .filter((row: any) => row['Agent Name'] && row['Agent Name'].trim() !== '')
                .map((row: any) => {
                    const name = row['Agent Name']?.trim() || '';
                    const nameLower = name.toLowerCase();
                    const isActive = activeNames.has(nameLower);
                    return {
                        name: toTitleCase(name),
                        absenceCount: parseInt(row['COUNTA of Reason']) || 0,
                        isActive,
                        email: emailMap.get(nameLower),
                        employeeId: idMap.get(nameLower),
                    };
                })
                .filter((agent: WatchListAgent) => agent.isActive && agent.absenceCount > 0)
                .slice(0, 10);

            setWatchList(processed);

        } catch (error) {
            console.error("Error fetching attendance watch list:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();

        const channel = supabase
            .channel('attendance_watchlist')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Agent Attendance Watch List' }, fetchData)
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchData]);

    if (loading) {
        return <Skeleton className="h-[300px] w-full rounded-2xl" />;
    }

    const getCountColor = (count: number) => {
        if (count >= 5) return 'text-red-400 bg-red-500/20';
        if (count >= 3) return 'text-amber-400 bg-amber-500/20';
        return 'text-yellow-400 bg-yellow-500/20';
    };

    const getBarWidth = (count: number) => {
        const max = Math.max(...watchList.map(a => a.absenceCount), 1);
        return `${(count / max) * 100}%`;
    };

    return (
        <>
            <Card className="bg-gradient-to-br from-red-500/10 to-orange-500/10 border-white/10 text-white overflow-hidden">
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg font-medium flex items-center gap-2">
                                <Eye className="w-5 h-5 text-amber-400" />
                                Attendance Watch List
                                <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full ml-2">
                                    Active Only
                                </span>
                            </CardTitle>
                            <p className="text-xs text-white/70 mt-1">
                                Agents with repeated unscheduled absences
                            </p>
                        </div>
                        {watchList.length > 0 && (
                            <button
                                onClick={() => openEmailModal('bulk')}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 transition-all text-xs font-medium"
                            >
                                <Send className="w-3.5 h-3.5" />
                                Notify All
                            </button>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {watchList.length === 0 ? (
                        <div className="h-[200px] flex flex-col items-center justify-center text-white/40">
                            <TrendingUp className="w-10 h-10 mb-2 text-green-400" />
                            <span>No attendance issues detected</span>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {watchList.map((agent, index) => (
                                <div key={agent.name} className="flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${index < 3 ? 'bg-red-500 text-white' : 'bg-white/10 text-white/70'}`}>
                                        {index + 1}
                                    </div>

                                    <div className="flex-1">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-sm font-medium text-white truncate max-w-[140px]" title={agent.name}>
                                                {agent.name}
                                            </span>
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getCountColor(agent.absenceCount)}`}>
                                                {agent.absenceCount} {agent.absenceCount === 1 ? 'absence' : 'absences'}
                                            </span>
                                        </div>
                                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${agent.absenceCount >= 5 ? 'bg-red-500' : agent.absenceCount >= 3 ? 'bg-amber-500' : 'bg-yellow-500'}`}
                                                style={{ width: getBarWidth(agent.absenceCount) }}
                                            />
                                        </div>
                                    </div>

                                    {/* Email Button - high contrast */}
                                    <button
                                        onClick={() => openEmailModal('single', agent)}
                                        className="p-1.5 rounded-lg hover:bg-amber-500/20 transition-all text-amber-400/80 hover:text-amber-300"
                                        title={`Send notice to ${agent.name}`}
                                    >
                                        <Mail className="w-4 h-4" />
                                    </button>

                                    {agent.absenceCount >= 3 && (
                                        <AlertTriangle className={`w-4 h-4 shrink-0 ${agent.absenceCount >= 5 ? 'text-red-400' : 'text-amber-400'}`} />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Email Compose Modal */}
            {emailModal.isOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                            <h3 className="text-white font-semibold flex items-center gap-2">
                                <Mail className="w-5 h-5 text-amber-400" />
                                {emailModal.mode === 'single'
                                    ? `Send Notice to ${emailModal.targetAgent?.name}`
                                    : `Send Notice to All (${watchList.filter(a => a.email).length} agents)`
                                }
                            </h3>
                            <button onClick={closeEmailModal} className="text-white/50 hover:text-white p-1">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="px-6 py-4 space-y-4">
                            {emailModal.mode === 'single' && emailModal.targetAgent && (
                                <div className="text-xs text-white/70">
                                    To: <span className="text-white">{emailModal.targetAgent.email || 'No email on file'}</span>
                                </div>
                            )}

                            {emailModal.mode === 'bulk' && (
                                <div className="text-xs text-white/70">
                                    Sending individualized emails to {watchList.filter(a => a.email).length} agents with emails on file.
                                    {watchList.filter(a => !a.email).length > 0 && (
                                        <span className="text-amber-400 ml-1">
                                            ({watchList.filter(a => !a.email).length} missing email)
                                        </span>
                                    )}
                                </div>
                            )}

                            <div>
                                <label className="text-xs font-medium text-white/70 mb-1 block">Subject</label>
                                <input
                                    type="text"
                                    value={emailModal.subject}
                                    onChange={(e) => setEmailModal(prev => ({ ...prev, subject: e.target.value }))}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-medium text-white/70 mb-1 block">Message</label>
                                <textarea
                                    value={emailModal.body}
                                    onChange={(e) => setEmailModal(prev => ({ ...prev, body: e.target.value }))}
                                    rows={10}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 resize-none"
                                />
                            </div>

                            {emailModal.mode === 'bulk' && (
                                <p className="text-xs text-white/60">
                                    [Agent Name] and [Absence Count] will be replaced with each agent's data.
                                </p>
                            )}

                            {sendResult && (
                                <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                                    sendResult.success ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                                }`}>
                                    {sendResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                                    {sendResult.message}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/10">
                            <button
                                onClick={closeEmailModal}
                                className="px-4 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/10 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={sendEmail}
                                disabled={sending || (emailModal.mode === 'single' && !emailModal.targetAgent?.email)}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-black font-medium text-sm hover:bg-amber-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {sending ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                                ) : (
                                    <><Send className="w-4 h-4" /> {emailModal.mode === 'single' ? 'Send Email' : 'Send to All'}</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

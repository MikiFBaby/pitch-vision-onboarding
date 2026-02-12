"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase-client";
import { motion, AnimatePresence } from "framer-motion";
import {
    FileDown, UserMinus, Copy, Briefcase, ShieldCheck, BarChart3, Sparkles,
    Mail, Send, X, Check, CalendarRange, FileText, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    categorizeWorkforce,
    getWeekDateRange,
} from "@/lib/hr-utils";
import {
    generateReportPDF,
    generateReportPDFBase64,
    getReportFilename,
    buildExecutivePDFConfig,
    buildAttritionPDFConfig,
    buildAttendancePDFConfig,
    buildWorkforcePDFConfig,
    buildComprehensivePDFConfig,
} from "@/utils/pdf-report";

type ReportType = 'executive' | 'attrition' | 'attendance' | 'workforce' | 'comprehensive' | null;

const REPORT_TYPES = [
    {
        id: 'comprehensive' as const,
        label: 'Comprehensive Summary',
        description: 'Complete overview covering headcount, attrition, attendance, and workforce data',
        icon: <FileText size={20} />,
        color: 'violet',
    },
    {
        id: 'executive' as const,
        label: 'C-Suite Executive Summary',
        description: 'High-level KPIs, headcount changes, and strategic workforce insights',
        icon: <Briefcase size={20} />,
        color: 'indigo',
    },
    {
        id: 'attrition' as const,
        label: 'Attrition Report',
        description: 'Termination vs resignation breakdown, trends, and top reasons',
        icon: <UserMinus size={20} />,
        color: 'red',
    },
    {
        id: 'attendance' as const,
        label: 'Attendance & Compliance',
        description: 'No-show rates, unplanned absences, booked PTO patterns',
        icon: <ShieldCheck size={20} />,
        color: 'amber',
    },
    {
        id: 'workforce' as const,
        label: 'Workforce Snapshot',
        description: 'Role distribution, full-time vs part-time, country breakdown',
        icon: <BarChart3 size={20} />,
        color: 'emerald',
    },
];

interface ReportData {
    weekLabel: string;
    startDate: string;
    endDate: string;
    hires: any[];
    terminations: any[];
    bookedOff: any[];
    unbookedOff: any[];
    activeAgents: any[];
    fullTimeAgents: any[];
    partTimeAgents: any[];
    campaigns: { name: string; count: number }[];
}

interface ExtendedData {
    totalEmployees: number;
    activeCount: number;
    terminatedCount: number;
    countryBreakdown: { country: string; count: number }[];
    roleBreakdown: { role: string; count: number }[];
    attritionRecords: any[];
    watchList: any[];
}

interface Recipient {
    full_name: string;
    email: string;
    role: string;
}

// Deduplicate rows by a composite key (Google Sheets sync pushes duplicates)
function deduplicateRows(rows: any[], keyFn: (row: any) => string): any[] {
    const seen = new Set<string>();
    return rows.filter(row => {
        const key = keyFn(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export default function HRReports() {
    const [loading, setLoading] = useState(true);
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [extendedData, setExtendedData] = useState<ExtendedData | null>(null);
    const [selectedReport, setSelectedReport] = useState<ReportType>(null);
    const [copied, setCopied] = useState(false);

    // Date range state
    const defaultRange = useMemo(() => getWeekDateRange(0), []);
    const [startDate, setStartDate] = useState(defaultRange.startStr);
    const [endDate, setEndDate] = useState(defaultRange.endStr);

    // Email modal state
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [recipients, setRecipients] = useState<Recipient[]>([]);
    const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [emailSent, setEmailSent] = useState(false);
    const [emailError, setEmailError] = useState<string | null>(null);

    const dateLabel = useMemo(() => {
        const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const year = new Date(startDate + 'T00:00:00').getFullYear();
        return `${fmt(startDate)} - ${fmt(endDate)}, ${year}`;
    }, [startDate, endDate]);

    const fetchReportData = useCallback(async () => {
        try {
            setLoading(true);

            const [hiresRes, termsRes, bookedRes, unbookedRes, empRes, activeEmpRes] = await Promise.all([
                supabase.from("HR Hired").select("*").gte("Hire Date", startDate).lte("Hire Date", endDate),
                supabase.from("HR Fired").select("*").gte("Termination Date", startDate).lte("Termination Date", endDate),
                supabase.from("Booked Days Off").select("*").gte("Date", startDate).lte("Date", endDate),
                supabase.from("Non Booked Days Off").select("*").gte("Date", startDate).lte("Date", endDate),
                supabase.from("employee_directory").select("campaign"),
                supabase.from("employee_directory").select("first_name, last_name, employee_status").eq("employee_status", "Active"),
            ]);

            // Deduplicate all synced tables (Google Sheets sync pushes 2-3x duplicates)
            const hires = deduplicateRows(hiresRes.data || [], r => `${r['Agent Name']}|${r['Hire Date']}`);
            const terminations = deduplicateRows(termsRes.data || [], r => `${r['Agent Name']}|${r['Termination Date']}`);
            const bookedOff = deduplicateRows(bookedRes.data || [], r => `${r['Agent Name']}|${r['Date']}`);
            const unbookedOff = deduplicateRows(unbookedRes.data || [], r => `${r['Agent Name']}|${r['Date']}`);

            // Build set of active employee names from employee_directory (source of truth)
            const activeEmployeeNames = new Set(
                (activeEmpRes.data || []).map(e =>
                    `${e.first_name?.toLowerCase()?.trim()} ${e.last_name?.toLowerCase()?.trim()}`
                )
            );

            // Fetch Agent Schedule and cross-reference with actual active employees
            const { data: scheduleData } = await supabase
                .from("Agent Schedule")
                .select("*")
                .eq("is_active", true);

            const dedupedSchedule = deduplicateRows(scheduleData || [], r =>
                `${r['First Name']} ${r['Last Name']}`
            );

            // Only keep schedule rows that match an active employee in employee_directory
            const matchedAgents = dedupedSchedule.filter(agent => {
                const name = `${agent['First Name']?.toLowerCase()?.trim()} ${agent['Last Name']?.toLowerCase()?.trim()}`;
                return activeEmployeeNames.has(name);
            });

            const { fullTime, partTime } = categorizeWorkforce(matchedAgents);

            const campaignCounts: Record<string, number> = {};
            (empRes.data || []).forEach((e) => {
                const camp = e.campaign || "Unknown";
                campaignCounts[camp] = (campaignCounts[camp] || 0) + 1;
            });
            const campaigns = Object.entries(campaignCounts)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);

            setReportData({
                weekLabel: dateLabel,
                startDate,
                endDate,
                hires,
                terminations,
                bookedOff,
                unbookedOff,
                activeAgents: matchedAgents,
                fullTimeAgents: fullTime,
                partTimeAgents: partTime,
                campaigns,
            });
        } catch (error) {
            console.error("Error fetching report data:", error);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, dateLabel]);

    const fetchExtendedData = async () => {
        try {
            const [empRes, firedRes, watchRes] = await Promise.all([
                supabase.from("employee_directory").select("employee_status, country, role"),
                supabase.from("HR Fired").select("*"),
                supabase.from("Agent Attendance Watch List").select("*"),
            ]);

            const employees = empRes.data || [];
            const activeCount = employees.filter(e => e.employee_status?.toLowerCase() === 'active').length;
            const terminatedCount = employees.filter(e => e.employee_status?.toLowerCase() === 'terminated').length;

            const countryMap: Record<string, number> = {};
            employees.forEach(e => {
                const c = e.country || 'Not Set';
                countryMap[c] = (countryMap[c] || 0) + 1;
            });
            const countryBreakdown = Object.entries(countryMap).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count);

            const roleMap: Record<string, number> = {};
            employees.forEach(e => {
                const r = e.role || 'Unknown';
                roleMap[r] = (roleMap[r] || 0) + 1;
            });
            const roleBreakdown = Object.entries(roleMap).map(([role, count]) => ({ role, count })).sort((a, b) => b.count - a.count);

            // Deduplicate all-time attrition records
            const dedupedAttrition = deduplicateRows(firedRes.data || [], r =>
                `${r['Agent Name']}|${r['Termination Date']}`
            );

            setExtendedData({
                totalEmployees: employees.length,
                activeCount,
                terminatedCount,
                countryBreakdown,
                roleBreakdown,
                attritionRecords: dedupedAttrition,
                watchList: watchRes.data || [],
            });
        } catch (e) {
            console.error("Error fetching extended data:", e);
        }
    };

    const fetchRecipients = async () => {
        try {
            const { data } = await supabase
                .from("employee_directory")
                .select("full_name, email, role")
                .neq("role", "Agent")
                .not("email", "is", null)
                .neq("email", "");

            setRecipients((data || []).filter(r => r.email && r.full_name));
        } catch (e) {
            console.error("Error fetching recipients:", e);
        }
    };

    useEffect(() => {
        fetchReportData();
        fetchExtendedData();
        fetchRecipients();

        const channels = [
            supabase.channel("reports_hires").on("postgres_changes", { event: "*", schema: "public", table: "HR Hired" }, fetchReportData).subscribe(),
            supabase.channel("reports_fires").on("postgres_changes", { event: "*", schema: "public", table: "HR Fired" }, fetchReportData).subscribe(),
            supabase.channel("reports_booked").on("postgres_changes", { event: "*", schema: "public", table: "Booked Days Off" }, fetchReportData).subscribe(),
            supabase.channel("reports_schedule").on("postgres_changes", { event: "*", schema: "public", table: "Agent Schedule" }, fetchReportData).subscribe(),
        ];

        return () => { channels.forEach(c => supabase.removeChannel(c)); };
    }, [fetchReportData]);

    // Unique roles from recipients for the role picker
    const availableRoles = useMemo(() => {
        const roles = [...new Set(recipients.map(r => r.role))].sort();
        return roles;
    }, [recipients]);

    // Filtered recipients based on selected roles
    const filteredRecipients = useMemo(() => {
        if (selectedRoles.length === 0) return recipients;
        return recipients.filter(r => selectedRoles.includes(r.role));
    }, [recipients, selectedRoles]);

    const toggleRole = (role: string) => {
        setSelectedRoles(prev =>
            prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
        );
    };

    const generateReportText = (type: ReportType): string => {
        if (!reportData || !extendedData) return '';
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        const netChange = reportData.hires.length - reportData.terminations.length;
        const totalAbsences = reportData.bookedOff.length + reportData.unbookedOff.length;

        switch (type) {
            case 'comprehensive': {
                const attritionRate = extendedData.totalEmployees > 0
                    ? ((extendedData.attritionRecords.length / extendedData.totalEmployees) * 100).toFixed(1)
                    : '0';
                const ftRatio = reportData.activeAgents.length > 0
                    ? Math.round((reportData.fullTimeAgents.length / reportData.activeAgents.length) * 100)
                    : 0;

                const firedByReason: Record<string, number> = {};
                extendedData.attritionRecords.forEach((r: any) => {
                    const reason = r['Fired/Quit'] || 'Unknown';
                    firedByReason[reason] = (firedByReason[reason] || 0) + 1;
                });
                const reasonLines = Object.entries(firedByReason)
                    .sort((a, b) => b[1] - a[1])
                    .map(([reason, count]) => `  ${reason}: ${count}`);

                const unbookedByAgent: Record<string, number> = {};
                reportData.unbookedOff.forEach((u: any) => {
                    const name = u['Agent Name'] || 'Unknown';
                    unbookedByAgent[name] = (unbookedByAgent[name] || 0) + 1;
                });
                const topUnplanned = Object.entries(unbookedByAgent)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([name, count]) => `  - ${name}: ${count} day(s)`);

                return [
                    `COMPREHENSIVE WORKFORCE REPORT`,
                    `Generated: ${dateStr}`,
                    `Period: ${reportData.weekLabel}`,
                    ``,
                    `HEADCOUNT OVERVIEW`,
                    `  Total Workforce: ${extendedData.totalEmployees}`,
                    `  Active: ${extendedData.activeCount} | Terminated: ${extendedData.terminatedCount}`,
                    `  Country Split: ${extendedData.countryBreakdown.map(c => `${c.country} (${c.count})`).join(', ')}`,
                    ``,
                    `HIRING & TERMINATIONS (${reportData.weekLabel})`,
                    `  New Hires: ${reportData.hires.length}`,
                    `  Terminations: ${reportData.terminations.length}`,
                    `  Net Change: ${netChange >= 0 ? '+' : ''}${netChange}`,
                    ``,
                    `ATTRITION`,
                    `  All-Time Records: ${extendedData.attritionRecords.length}`,
                    `  Attrition Rate: ${attritionRate}%`,
                    `  By Classification:`,
                    ...reasonLines,
                    ``,
                    `ATTENDANCE (${reportData.weekLabel})`,
                    `  Booked Days Off: ${reportData.bookedOff.length}`,
                    `  Unplanned Absences: ${reportData.unbookedOff.length}`,
                    `  Total Absences: ${totalAbsences}`,
                    `  Unplanned Rate: ${totalAbsences > 0 ? ((reportData.unbookedOff.length / totalAbsences) * 100).toFixed(1) : '0'}%`,
                    `  Agents on Watch List: ${extendedData.watchList.length}`,
                    ``,
                    `TOP UNPLANNED ABSENCES`,
                    ...(topUnplanned.length > 0 ? topUnplanned : ['  None in period']),
                    ``,
                    `WORKFORCE COMPOSITION`,
                    `  Full-Time (≥30h) - Commission Eligible: ${reportData.fullTimeAgents.length}`,
                    `  Part-Time (<30h): ${reportData.partTimeAgents.length}`,
                    `  Full-Time Ratio: ${ftRatio}%`,
                    `  Active Agents on Schedule: ${reportData.activeAgents.length}`,
                    ``,
                    `ROLE DISTRIBUTION`,
                    ...extendedData.roleBreakdown.slice(0, 8).map(r => `  ${r.role}: ${r.count}`),
                    ``,
                    `CAMPAIGN STAFFING`,
                    ...reportData.campaigns.slice(0, 6).map(c => `  ${c.name}: ${c.count} agents`),
                ].join('\n');
            }
            case 'executive': {
                const attritionRate = extendedData.totalEmployees > 0
                    ? ((extendedData.attritionRecords.length / extendedData.totalEmployees) * 100).toFixed(1)
                    : '0';
                return [
                    `EXECUTIVE WORKFORCE SUMMARY`,
                    `Generated: ${dateStr}`,
                    `Period: ${reportData.weekLabel}`,
                    ``,
                    `HEADCOUNT`,
                    `  Total Workforce: ${extendedData.totalEmployees}`,
                    `  Active: ${extendedData.activeCount} | Terminated: ${extendedData.terminatedCount}`,
                    `  Country Split: ${extendedData.countryBreakdown.map(c => `${c.country} (${c.count})`).join(', ')}`,
                    ``,
                    `WEEKLY MOVEMENT (${reportData.weekLabel})`,
                    `  New Hires: ${reportData.hires.length}`,
                    `  Terminations: ${reportData.terminations.length}`,
                    `  Net Change: ${netChange >= 0 ? '+' : ''}${netChange}`,
                    ``,
                    `WORKFORCE COMPOSITION`,
                    `  Full-Time (≥30h): ${reportData.fullTimeAgents.length} (Commission Eligible)`,
                    `  Part-Time (<30h): ${reportData.partTimeAgents.length}`,
                    `  Active Agents: ${reportData.activeAgents.length}`,
                    ``,
                    `ATTENDANCE (${reportData.weekLabel})`,
                    `  Booked Days Off: ${reportData.bookedOff.length}`,
                    `  Unplanned Absences: ${reportData.unbookedOff.length}`,
                    `  Total Absences: ${totalAbsences}`,
                    ``,
                    `KEY METRICS`,
                    `  Attrition Rate (All-Time): ${attritionRate}%`,
                    `  Agents on Watch List: ${extendedData.watchList.length}`,
                    `  Full-Time Ratio: ${reportData.activeAgents.length > 0 ? Math.round((reportData.fullTimeAgents.length / reportData.activeAgents.length) * 100) : 0}%`,
                ].join('\n');
            }
            case 'attrition': {
                const firedByReason: Record<string, number> = {};
                extendedData.attritionRecords.forEach((r: any) => {
                    const reason = r['Fired/Quit'] || 'Unknown';
                    firedByReason[reason] = (firedByReason[reason] || 0) + 1;
                });
                const reasonLines = Object.entries(firedByReason)
                    .sort((a, b) => b[1] - a[1])
                    .map(([reason, count]) => `  ${reason}: ${count}`);

                const thisWeekTerms = reportData.terminations;
                const termNames = thisWeekTerms.map((t: any) =>
                    `  - ${t['Agent Name']} (${t['Fired/Quit'] || 'N/A'}) — ${t['Reason for Termination'] || 'No reason recorded'}`
                );

                return [
                    `ATTRITION REPORT`,
                    `Generated: ${dateStr}`,
                    ``,
                    `ALL-TIME ATTRITION BREAKDOWN`,
                    `  Total Records: ${extendedData.attritionRecords.length}`,
                    ``,
                    `  By Classification:`,
                    ...reasonLines,
                    ``,
                    `THIS PERIOD'S TERMINATIONS (${reportData.weekLabel})`,
                    `  Count: ${thisWeekTerms.length}`,
                    ...(termNames.length > 0 ? termNames : ['  None this period']),
                    ``,
                    `ATTRITION RATE`,
                    `  ${extendedData.totalEmployees > 0 ? ((extendedData.attritionRecords.length / extendedData.totalEmployees) * 100).toFixed(1) : '0'}% of total workforce (all-time)`,
                    `  Voluntary (Quit): ${extendedData.attritionRecords.filter((r: any) => r['Fired/Quit']?.toLowerCase() === 'quit').length}`,
                    `  Involuntary (Fired): ${extendedData.attritionRecords.filter((r: any) => r['Fired/Quit']?.toLowerCase()?.includes('fired')).length}`,
                    `  Accounts Removed: ${extendedData.attritionRecords.filter((r: any) => r['Fired/Quit']?.toLowerCase()?.includes('account')).length}`,
                ].join('\n');
            }
            case 'attendance': {
                const bookedByAgent: Record<string, number> = {};
                reportData.bookedOff.forEach((b: any) => {
                    const name = b['Agent Name'] || 'Unknown';
                    bookedByAgent[name] = (bookedByAgent[name] || 0) + 1;
                });
                const unbookedByAgent: Record<string, number> = {};
                reportData.unbookedOff.forEach((u: any) => {
                    const name = u['Agent Name'] || 'Unknown';
                    unbookedByAgent[name] = (unbookedByAgent[name] || 0) + 1;
                });

                const topUnplanned = Object.entries(unbookedByAgent)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([name, count]) => `  - ${name}: ${count} day(s)`);

                return [
                    `ATTENDANCE & COMPLIANCE REPORT`,
                    `Generated: ${dateStr}`,
                    `Period: ${reportData.weekLabel}`,
                    ``,
                    `SUMMARY`,
                    `  Booked Days Off: ${reportData.bookedOff.length}`,
                    `  Unplanned Absences: ${reportData.unbookedOff.length}`,
                    `  Total Absences: ${totalAbsences}`,
                    `  Unplanned Rate: ${totalAbsences > 0 ? ((reportData.unbookedOff.length / totalAbsences) * 100).toFixed(1) : '0'}%`,
                    ``,
                    `TOP UNPLANNED ABSENCES`,
                    ...(topUnplanned.length > 0 ? topUnplanned : ['  None this period']),
                    ``,
                    `WATCH LIST`,
                    `  Agents Currently on Watch: ${extendedData.watchList.length}`,
                    ...(extendedData.watchList.slice(0, 5).map((w: any) =>
                        `  - ${w['Agent Name'] || w['Full Name'] || 'Unknown'}`
                    )),
                ].join('\n');
            }
            case 'workforce': {
                const roleLines = extendedData.roleBreakdown.slice(0, 8).map(r =>
                    `  ${r.role}: ${r.count}`
                );
                const countryLines = extendedData.countryBreakdown.map(c =>
                    `  ${c.country}: ${c.count} (${((c.count / extendedData.totalEmployees) * 100).toFixed(1)}%)`
                );

                return [
                    `WORKFORCE SNAPSHOT`,
                    `Generated: ${dateStr}`,
                    ``,
                    `HEADCOUNT: ${extendedData.totalEmployees}`,
                    `  Active: ${extendedData.activeCount}`,
                    `  Terminated: ${extendedData.terminatedCount}`,
                    ``,
                    `COUNTRY DISTRIBUTION`,
                    ...countryLines,
                    ``,
                    `ROLE DISTRIBUTION`,
                    ...roleLines,
                    ``,
                    `EMPLOYMENT TYPE`,
                    `  Full-Time (≥30h/week): ${reportData.fullTimeAgents.length}`,
                    `  Part-Time (<30h/week): ${reportData.partTimeAgents.length}`,
                    `  Full-Time Ratio: ${reportData.activeAgents.length > 0 ? Math.round((reportData.fullTimeAgents.length / reportData.activeAgents.length) * 100) : 0}%`,
                    ``,
                    `CAMPAIGN STAFFING`,
                    ...reportData.campaigns.slice(0, 5).map(c => `  ${c.name}: ${c.count} agents`),
                ].join('\n');
            }
            default:
                return '';
        }
    };

    const handleCopyReport = () => {
        const text = generateReportText(selectedReport);
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownloadPDF = () => {
        if (!reportData || !extendedData || !selectedReport) return;
        const builders: Record<string, () => ReturnType<typeof buildExecutivePDFConfig>> = {
            comprehensive: () => buildComprehensivePDFConfig(reportData, extendedData),
            executive: () => buildExecutivePDFConfig(reportData, extendedData),
            attrition: () => buildAttritionPDFConfig(reportData, extendedData),
            attendance: () => buildAttendancePDFConfig(reportData, extendedData),
            workforce: () => buildWorkforcePDFConfig(reportData, extendedData),
        };
        const config = builders[selectedReport]();
        generateReportPDF(config);
    };

    const handleSendEmail = async () => {
        if (!reportData || !extendedData || !selectedReport || filteredRecipients.length === 0) return;

        setSendingEmail(true);
        setEmailError(null);
        setEmailSent(false);

        try {
            const builders: Record<string, () => ReturnType<typeof buildExecutivePDFConfig>> = {
                comprehensive: () => buildComprehensivePDFConfig(reportData, extendedData),
                executive: () => buildExecutivePDFConfig(reportData, extendedData),
                attrition: () => buildAttritionPDFConfig(reportData, extendedData),
                attendance: () => buildAttendancePDFConfig(reportData, extendedData),
                workforce: () => buildWorkforcePDFConfig(reportData, extendedData),
            };
            const config = builders[selectedReport]();
            const base64PDF = generateReportPDFBase64(config);
            const filename = getReportFilename(config);
            const reportLabel = REPORT_TYPES.find(r => r.id === selectedReport)?.label || 'Report';

            const toList = filteredRecipients.map(r => r.email).join(', ');

            const res = await fetch('/api/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: toList,
                    subject: `${reportLabel} — ${reportData.weekLabel}`,
                    senderName: 'HR Reports',
                    html: `
                        <div style="font-family: Arial, sans-serif; color: #333;">
                            <h2 style="color: #4F46E5;">${reportLabel}</h2>
                            <p>Please find attached the <strong>${reportLabel}</strong> for the period <strong>${reportData.weekLabel}</strong>.</p>
                            <p style="color: #666; font-size: 13px;">This report was auto-generated by Pitch Perfect Solutions HR system.</p>
                        </div>
                    `,
                    attachments: [
                        {
                            filename,
                            content: base64PDF,
                            encoding: 'base64',
                            contentType: 'application/pdf',
                        },
                    ],
                }),
            });

            const result = await res.json();

            if (!res.ok) {
                throw new Error(result.error || 'Failed to send email');
            }

            setEmailSent(true);
            setTimeout(() => {
                setShowEmailModal(false);
                setEmailSent(false);
                setSelectedRoles([]);
            }, 2000);
        } catch (error: any) {
            setEmailError(error.message || 'Failed to send email');
        } finally {
            setSendingEmail(false);
        }
    };

    // Quick date range presets
    const setDatePreset = (preset: string) => {
        const now = new Date();
        let start: Date;
        let end: Date = now;

        switch (preset) {
            case 'this_week': {
                const range = getWeekDateRange(0);
                start = range.start;
                end = range.end;
                break;
            }
            case 'last_week': {
                const range = getWeekDateRange(-1);
                start = range.start;
                end = range.end;
                break;
            }
            case 'this_month': {
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            }
            case 'last_month': {
                start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                end = new Date(now.getFullYear(), now.getMonth(), 0);
                break;
            }
            case 'last_30': {
                start = new Date(now);
                start.setDate(now.getDate() - 30);
                break;
            }
            case 'last_90': {
                start = new Date(now);
                start.setDate(now.getDate() - 90);
                break;
            }
            case 'ytd': {
                start = new Date(now.getFullYear(), 0, 1);
                break;
            }
            case 'all_time': {
                start = new Date(2020, 0, 1);
                break;
            }
            default:
                return;
        }

        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(end.toISOString().split('T')[0]);
    };

    if (loading && !reportData) {
        return (
            <div className="space-y-6">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-48 bg-white/5 rounded-2xl animate-pulse" />
                ))}
            </div>
        );
    }

    if (!reportData) return null;

    const reportColorMap: Record<string, string> = {
        violet: 'border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20',
        indigo: 'border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20',
        red: 'border-red-500/30 bg-red-500/10 hover:bg-red-500/20',
        amber: 'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20',
        emerald: 'border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20',
    };
    const reportIconColorMap: Record<string, string> = {
        violet: 'bg-violet-500/20 text-violet-400',
        indigo: 'bg-indigo-500/20 text-indigo-400',
        red: 'bg-red-500/20 text-red-400',
        amber: 'bg-amber-500/20 text-amber-400',
        emerald: 'bg-emerald-500/20 text-emerald-400',
    };

    const DATE_PRESETS = [
        { label: 'This Week', value: 'this_week' },
        { label: 'Last Week', value: 'last_week' },
        { label: 'This Month', value: 'this_month' },
        { label: 'Last Month', value: 'last_month' },
        { label: 'Last 30 Days', value: 'last_30' },
        { label: 'Last 90 Days', value: 'last_90' },
        { label: 'Year to Date', value: 'ytd' },
        { label: 'All Time', value: 'all_time' },
    ];

    return (
        <div className="space-y-6">
            {/* Report Generator Section */}
            <div className="glass-card p-6 rounded-2xl border border-white/10 bg-white/5">
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2 bg-violet-500/20 rounded-lg">
                        <Sparkles className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Report Generator</h3>
                        <p className="text-xs text-white/50">Select a report type and date range, then download or email</p>
                    </div>
                </div>

                {/* Date Range Selector */}
                <div className="mb-5 p-4 rounded-xl border border-white/10 bg-white/5">
                    <div className="flex items-center gap-2 mb-3">
                        <CalendarRange className="w-4 h-4 text-violet-400" />
                        <span className="text-sm font-semibold text-white">Report Period</span>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                        {DATE_PRESETS.map(preset => (
                            <button
                                key={preset.value}
                                onClick={() => setDatePreset(preset.value)}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/15 hover:text-white transition-all"
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-white/50">From</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="px-3 py-1.5 text-sm rounded-lg bg-white/10 border border-white/15 text-white focus:outline-none focus:ring-1 focus:ring-violet-500/50 [color-scheme:dark]"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-white/50">To</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="px-3 py-1.5 text-sm rounded-lg bg-white/10 border border-white/15 text-white focus:outline-none focus:ring-1 focus:ring-violet-500/50 [color-scheme:dark]"
                            />
                        </div>
                        <Button
                            size="sm"
                            onClick={() => fetchReportData()}
                            className="bg-violet-600 hover:bg-violet-700 text-white text-xs"
                        >
                            Apply
                        </Button>
                        {loading && (
                            <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                        )}
                    </div>
                </div>

                {/* Report Type Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
                    {REPORT_TYPES.map((rt) => (
                        <button
                            key={rt.id}
                            onClick={() => setSelectedReport(selectedReport === rt.id ? null : rt.id)}
                            className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                                selectedReport === rt.id
                                    ? reportColorMap[rt.color] + ' ring-1 ring-white/20'
                                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                            }`}
                        >
                            <div className={`p-2 rounded-lg w-fit mb-2 ${reportIconColorMap[rt.color]}`}>
                                {rt.icon}
                            </div>
                            <h4 className="text-sm font-bold text-white">{rt.label}</h4>
                            <p className="text-xs text-white/70 mt-1 leading-relaxed">{rt.description}</p>
                        </button>
                    ))}
                </div>

                {/* Report Preview */}
                <AnimatePresence>
                    {selectedReport && reportData && extendedData && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-2 p-5 bg-black/30 rounded-xl border border-white/10">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-bold text-white/80 uppercase tracking-wider">
                                        {REPORT_TYPES.find(r => r.id === selectedReport)?.label}
                                    </h4>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={handleCopyReport}
                                            className="text-white/60 hover:text-white text-xs"
                                        >
                                            <Copy className="w-3.5 h-3.5 mr-1.5" />
                                            {copied ? 'Copied!' : 'Copy'}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={handleDownloadPDF}
                                            className="text-white/60 hover:text-white text-xs"
                                        >
                                            <FileDown className="w-3.5 h-3.5 mr-1.5" />
                                            Download PDF
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => {
                                                setShowEmailModal(true);
                                                setEmailSent(false);
                                                setEmailError(null);
                                            }}
                                            className="text-white/60 hover:text-white text-xs"
                                        >
                                            <Mail className="w-3.5 h-3.5 mr-1.5" />
                                            Email Report
                                        </Button>
                                    </div>
                                </div>
                                <pre className="text-sm text-white/70 font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                                    {generateReportText(selectedReport)}
                                </pre>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Email Modal */}
            <AnimatePresence>
                {showEmailModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                        onClick={(e) => { if (e.target === e.currentTarget) setShowEmailModal(false); }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="w-full max-w-lg mx-4 p-6 bg-[#1a1a2e] border border-white/15 rounded-2xl shadow-2xl"
                        >
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-violet-500/20 rounded-lg">
                                        <Mail className="w-5 h-5 text-violet-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">Email Report</h3>
                                        <p className="text-xs text-white/50">
                                            {REPORT_TYPES.find(r => r.id === selectedReport)?.label} — {reportData?.weekLabel}
                                        </p>
                                    </div>
                                </div>
                                <button onClick={() => setShowEmailModal(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Role Filter */}
                            <div className="mb-4">
                                <label className="text-sm font-semibold text-white/80 mb-2 block">Filter by Role</label>
                                <div className="flex flex-wrap gap-2">
                                    {availableRoles.map(role => (
                                        <button
                                            key={role}
                                            onClick={() => toggleRole(role)}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                                                selectedRoles.includes(role)
                                                    ? 'bg-violet-500/30 border-violet-400/50 text-violet-300'
                                                    : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                            }`}
                                        >
                                            {role}
                                        </button>
                                    ))}
                                    {selectedRoles.length > 0 && (
                                        <button
                                            onClick={() => setSelectedRoles([])}
                                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
                                        >
                                            Clear All
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Recipient List */}
                            <div className="mb-5">
                                <label className="text-sm font-semibold text-white/80 mb-2 block">
                                    Recipients ({filteredRecipients.length})
                                </label>
                                <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-black/20">
                                    {filteredRecipients.length === 0 ? (
                                        <div className="p-4 text-sm text-white/40 text-center">
                                            No recipients match the selected roles
                                        </div>
                                    ) : (
                                        filteredRecipients.map((r, i) => (
                                            <div
                                                key={r.email}
                                                className={`flex items-center justify-between px-3 py-2 ${i % 2 === 0 ? 'bg-white/5' : ''}`}
                                            >
                                                <div>
                                                    <span className="text-sm text-white/90 font-medium">{r.full_name}</span>
                                                    <span className="text-xs text-white/40 ml-2">{r.email}</span>
                                                </div>
                                                <span className="text-xs text-violet-400/80 font-medium">{r.role}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Error / Success */}
                            {emailError && (
                                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-400/30 text-sm text-red-300">
                                    {emailError}
                                </div>
                            )}
                            {emailSent && (
                                <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-400/30 text-sm text-emerald-300 flex items-center gap-2">
                                    <Check className="w-4 h-4" />
                                    Report sent successfully to {filteredRecipients.length} recipient(s)
                                </div>
                            )}

                            {/* Send Button */}
                            <div className="flex justify-end gap-3">
                                <Button
                                    variant="ghost"
                                    onClick={() => setShowEmailModal(false)}
                                    className="text-white/60 hover:text-white"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleSendEmail}
                                    disabled={sendingEmail || filteredRecipients.length === 0 || emailSent}
                                    className="bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
                                >
                                    {sendingEmail ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Sending...
                                        </>
                                    ) : emailSent ? (
                                        <>
                                            <Check className="w-4 h-4 mr-2" />
                                            Sent!
                                        </>
                                    ) : (
                                        <>
                                            <Send className="w-4 h-4 mr-2" />
                                            Send to {filteredRecipients.length} Recipient{filteredRecipients.length !== 1 ? 's' : ''}
                                        </>
                                    )}
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

"use client";


import React, { useState, useMemo, useRef } from 'react';
import { jsPDF } from "jspdf"; // Type only, dynamic import used in utility
import { generateQAComplianceReport } from "@/utils/report-generator";
import { Card } from './ui/Card';
import { CallData, CallStatus } from '@/types/qa-types';
import { isCallCompliant } from "@/utils/qa-utils";
import { format } from 'date-fns';
import {
    Calendar, Download, Mail, Tag, FileText, CheckCircle2, AlertTriangle,
    Filter, Search, Loader2, FileSpreadsheet, BarChart3,
    XCircle, RotateCcw, ShieldAlert, AlertCircle, ShieldCheck, Award, Send
} from 'lucide-react';
import { StatMetric } from './StatMetric';
import { saveAs } from 'file-saver';
import { useAuth } from '@/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
// jsPDF and autoTable are dynamically imported in generatePDF() - This comment is now outdated

interface ReportsViewProps {
    calls: CallData[];
}

export const ReportsView: React.FC<ReportsViewProps> = ({ calls }) => {
    // Report Configuration State
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [startHour, setStartHour] = useState('00:00');
    const [endHour, setEndHour] = useState('23:59');
    const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>({});
    const [selectedTag, setSelectedTag] = useState('');
    const [minScore, setMinScore] = useState(0);
    const [reportTitle, setReportTitle] = useState('Compliance Summary Report');

    const [isExporting, setIsExporting] = useState(false);
    const [exportMessage, setExportMessage] = useState<string | null>(null);

    // Email Modal State
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [emailRecipient, setEmailRecipient] = useState('');
    const [emailSubjectSuffix, setEmailSubjectSuffix] = useState('');
    const [isSendingEmail, setIsSendingEmail] = useState(false);

    const { user, profile } = useAuth();

    // Refs for Date Inputs
    const startDateRef = useRef<HTMLInputElement>(null);
    const endDateRef = useRef<HTMLInputElement>(null);

    // Sync date/time inputs with dateRange state
    React.useEffect(() => {
        const newRange: { start?: Date; end?: Date } = {};

        if (startDate) {
            const [hours, minutes] = startHour.split(':').map(Number);
            // Parse date as LOCAL time by appending T00:00 (otherwise "YYYY-MM-DD" is parsed as UTC)
            const start = new Date(startDate + 'T00:00:00');
            start.setHours(hours || 0, minutes || 0, 0, 0);
            newRange.start = start;
            console.log('[ReportsView] Start filter:', start.toISOString(), 'local:', start.toLocaleString());
        }

        if (endDate) {
            const [hours, minutes] = endHour.split(':').map(Number);
            // Parse date as LOCAL time
            const end = new Date(endDate + 'T00:00:00');
            end.setHours(hours || 23, minutes || 59, 59, 999);
            newRange.end = end;
            console.log('[ReportsView] End filter:', end.toISOString(), 'local:', end.toLocaleString());
        }

        setDateRange(newRange);
    }, [startDate, endDate, startHour, endHour]);

    // Extract all unique tags from calls
    const availableTags = useMemo(() => {
        const tags = new Set<string>();
        calls.forEach(call => {
            if (call.campaignTags) {
                call.campaignTags.forEach(t => tags.add(t));
            }
        });
        return Array.from(tags);
    }, [calls]);

    // Filter Data Logic
    const reportData = useMemo(() => {
        return calls.filter(call => {
            // Try multiple date sources: timestamp, createdAt, or callDate+callTime
            let callDateTime: Date | null = null;

            // First try timestamp (which is createdAt from DB)
            if (call.timestamp) {
                callDateTime = new Date(call.timestamp);
            }
            // Fallback to createdAt
            else if (call.createdAt) {
                callDateTime = new Date(call.createdAt);
            }
            // Fallback to callDate + callTime combination
            else if (call.callDate) {
                const dateStr = call.callDate;
                const timeStr = call.callTime || '00:00';
                // Try parsing YYYY-MM-DD format first, then other formats
                const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
                if (dateMatch) {
                    const [, year, month, day] = dateMatch;
                    const timeParts = timeStr.match(/(\d{1,2}):(\d{2})/);
                    const hours = timeParts ? parseInt(timeParts[1]) : 0;
                    const minutes = timeParts ? parseInt(timeParts[2]) : 0;
                    callDateTime = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), hours, minutes);
                } else {
                    callDateTime = new Date(dateStr);
                }
            }

            // If no valid date found, skip filtering (include the call)
            if (!callDateTime || isNaN(callDateTime.getTime())) {
                console.warn('[ReportsView] Could not parse date for call:', call.id, { timestamp: call.timestamp, createdAt: call.createdAt, callDate: call.callDate });
                return true; // Include calls with unparseable dates
            }

            // Date Filter - dateRange already has hours set correctly from useEffect
            if (dateRange.start && callDateTime < dateRange.start) return false;
            if (dateRange.end && callDateTime > dateRange.end) return false;

            // Tag Filter
            if (selectedTag) {
                if (!call.campaignTags || !call.campaignTags.some(t => t.toLowerCase().includes(selectedTag.toLowerCase()))) {
                    return false;
                }
            }

            // Score Filter
            if (call.complianceScore < minScore) return false;

            return true;
        });
    }, [calls, dateRange, selectedTag, minScore]);

    // Calculate Report Stats
    const stats = useMemo(() => {
        const total = reportData.length;
        if (total === 0) return { avgScore: 0, complianceRate: 0, riskCount: 0 };

        const totalScore = reportData.reduce((acc, curr) => acc + (curr.complianceScore || 0), 0);
        const compliantCount = reportData.filter(c => isCallCompliant(c)).length;
        const riskCount = reportData.filter(c => (c.riskLevel || '').toLowerCase() === 'high' || (c.riskLevel || '').toLowerCase() === 'critical').length;

        return {
            avgScore: Math.round(totalScore / total),
            complianceRate: Math.round((compliantCount / total) * 100),
            riskCount
        };
    }, [reportData]);

    // --- Helpers for Styling (Matched to RecentCallsTable) ---
    const getStatusConfig = (status: string) => {
        const s = (status || '').toLowerCase();

        // Compliant / Success
        if (s.includes('consent') && !s.includes('no')) {
            return {
                bg: 'bg-emerald-50',
                border: 'border-emerald-200',
                text: 'text-emerald-700',
                iconColor: 'text-emerald-600',
                Icon: CheckCircle2,
                label: 'COMPLIANT'
            };
        }
        // Fail / No Consent
        if (s.includes('no consent') || s.includes('rejected') || s.includes('fail')) {
            return {
                bg: 'bg-rose-50',
                border: 'border-rose-200',
                text: 'text-rose-700',
                iconColor: 'text-rose-600',
                Icon: XCircle,
                label: 'NO CONSENT'
            };
        }
        // Review / Default
        return {
            bg: 'bg-amber-50',
            border: 'border-amber-200',
            text: 'text-amber-700',
            iconColor: 'text-amber-600',
            Icon: RotateCcw,
            label: 'NEEDS REVIEW'
        };
    };

    const getRiskConfig = (risk: string) => {
        const r = (risk || '').toLowerCase();

        if (r === 'high' || r === 'critical') {
            return {
                bg: 'bg-rose-50',
                border: 'border-rose-200',
                text: 'text-rose-700',
                iconColor: 'text-rose-600',
                Icon: ShieldAlert,
                label: 'HIGH RISK'
            };
        }
        if (r === 'medium' || r === 'warning') {
            return {
                bg: 'bg-amber-50',
                border: 'border-amber-200',
                text: 'text-amber-700',
                iconColor: 'text-amber-600',
                Icon: AlertCircle,
                label: 'WARNING'
            };
        }
        // Low / Safe
        return {
            bg: 'bg-emerald-50',
            border: 'border-emerald-200',
            text: 'text-emerald-700',
            iconColor: 'text-emerald-600',
            Icon: ShieldCheck,
            label: 'LOW RISK'
        };
    };

    const getScoreStyle = (score: number) => {
        if (score >= 85) return 'text-emerald-600';
        if (score >= 70) return 'text-amber-600';
        return 'text-rose-600';
    };

    const formatAnalyzedAt = (dateStr: string) => {
        if (!dateStr) return '--';
        const date = new Date(dateStr);
        return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Format phone number: 9102177366 → 910 217 7366
    const formatPhoneNumber = (phone: string | undefined): string => {
        if (!phone) return '--';
        const digits = phone.replace(/\D/g, '');
        if (digits.length === 10) {
            return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
        }
        if (digits.length === 11 && digits.startsWith('1')) {
            return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
        }
        return phone;
    };

    // Actions
    const handleExport = (type: 'pdf' | 'email' | 'csv') => {
        if (type === 'pdf') {
            setIsExporting(true);
            generatePDF();
        } else if (type === 'csv') {
            setIsExporting(true);
            generateCSV();
        } else {
            // Open Email Modal
            setIsEmailModalOpen(true);
        }
    };

    const handleSendEmail = async () => {
        if (!emailRecipient || !emailSubjectSuffix) return;

        setIsSendingEmail(true);
        try {
            // Generate PDF Document
            const doc = await generateQAComplianceReport(reportData, {
                title: reportTitle,
                userName: profile?.display_name || user?.email || 'User',
                dateRange: {
                    start: dateRange.start ? format(dateRange.start, 'yyyy-MM-dd') : undefined,
                    end: dateRange.end ? format(dateRange.end, 'yyyy-MM-dd') : undefined
                },
                filters: {
                    minScore: minScore > 0 ? minScore : undefined,
                    riskLevel: 'All' // ReportsView doesn't seem to have specific risk filter state that differs from page.tsx passing it
                }
            });

            // Convert to Base64
            const pdfDataUri = doc.output('datauristring');
            const base64Data = pdfDataUri.split(',')[1];

            // Extract first name from email if possible
            const recipientFirstName = emailRecipient.split('@')[0].split('.')[0];
            const capitalizedName = recipientFirstName.charAt(0).toUpperCase() + recipientFirstName.slice(1).toLowerCase();

            // Send via API - from Aura with her signature
            const response = await fetch('/api/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: emailRecipient,
                    subject: `${reportTitle} - ${format(new Date(), 'MMM dd, yyyy')}`,
                    text: `Hey ${capitalizedName}, here is the ${reportTitle} that was just generated. I put together all the key metrics and insights for you. If you want me to look into anything specific or need anything else, just let me know. Aura`,
                    html: `
                        <div style="font-family: Verdana, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                            <p style="font-size: 14px; color: #212121; line-height: 1.6;">
                                Hey ${capitalizedName},
                            </p>
                            <p style="font-size: 14px; color: #212121; line-height: 1.6;">
                                Here is the <strong>${reportTitle}</strong> that was just generated. I put together all the key metrics and insights for you, ${reportData.length} records covering the data you requested.
                            </p>
                            <p style="font-size: 14px; color: #212121; line-height: 1.6; margin-bottom: 8px;">
                                <strong>Attachment:</strong> ${reportTitle.replace(/[^a-z0-9]/gi, '_')}.pdf
                            </p>
                            <p style="font-size: 14px; color: #212121; line-height: 1.6;">
                                If you want me to look into anything specific or need anything else, just let me know.
                            </p>
                            
                            <!-- Aura AI Signature -->
                            <div dir="ltr" style="margin-top: 40px;">
                                <table style="direction:ltr;border-collapse:collapse;">
                                    <tr><td style="font-size:0;height:40px;line-height:0;"></td></tr>
                                    <tr><td>
                                        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;" width="100%">
                                            <tr><td>
                                                <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;width:100%;line-height:normal;">
                                                    <tr><td height="0" style="height:0;font-family:Verdana;text-align:left">
                                                        <p style="margin:1px;"><img style="height:57px" src="https://d36urhup7zbd7q.cloudfront.net/5566372452040704/no_sig_176896621427/signoff.gif?ck=1768966214.27" alt="Kind regards," height="57"></p>
                                                    </td></tr>
                                                </table>
                                            </td></tr>
                                            <tr><td height="0" style="height:0;line-height:1%;padding-top:16px;font-size:1px;"></td></tr>
                                            <tr><td>
                                                <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;line-height:1.15;">
                                                    <tr>
                                                        <td style="height:1px;width:110px;vertical-align:middle;padding:.01px 1px;">
                                                            <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                                                                <tr><td style="vertical-align:middle;padding:.01px 1px 18px 0.01px;width:96px;text-align:center;">
                                                                    <img border="0" src="https://gifo.srv.wisestamp.com/im/sh/dS9Rb2VKUW5lcFliRS84NzllOTYzNS04YjNmLTQ1MmQtOWZiYy01YjdjMjA5ODA2MzVfXzQwMHg0MDBfXy5qcGVnI2xvZ28=/circle.png" height="96" width="96" alt="photo" style="width:96px;vertical-align:middle;border-radius:50%;height:96px;border:0;display:block;">
                                                                </td></tr>
                                                                <tr><td style="vertical-align:bottom;padding:.01px;width:110px;text-align:center;">
                                                                    <img border="0" src="https://d36urhup7zbd7q.cloudfront.net/u/QoeJQnepYbE/4ff815de-d8f2-4c40-a393-59ba331d1f95__400x200__.jpeg" height="55" width="110" alt="photo" style="width:110px;vertical-align:middle;border-radius:0;height:55px;border:0;display:block;">
                                                                </td></tr>
                                                            </table>
                                                        </td>
                                                        <td valign="top" style="padding:.01px 0.01px 0.01px 18px;vertical-align:top;">
                                                            <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                                                                <tr><td style="line-height:132.0%;font-size:18px;padding-bottom:18px;">
                                                                    <p style="margin:.1px;line-height:132.0%;font-size:18px;">
                                                                        <span style="font-family:Verdana;font-size:18px;font-weight:bold;color:#953DB8;letter-spacing:0;white-space:nowrap;">Aura AI</span><br>
                                                                        <span style="font-family:Verdana;font-size:14px;font-weight:bold;color:#212121;white-space:nowrap;">Support Specialist,&nbsp;</span>
                                                                        <span style="font-family:Verdana;font-size:14px;font-weight:bold;color:#212121;white-space:nowrap;">Pitch Perfect Solutions</span>
                                                                    </p>
                                                                </td></tr>
                                                                <tr><td style="padding:.01px 0.01px 18px 0.01px;border-bottom:solid 5px #953DB8;border-top:solid 5px #953DB8;">
                                                                    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">
                                                                        <tr><td nowrap width="235" height="0" style="height:0;padding-top:18px;white-space:nowrap;width:235px;font-family:Verdana;">
                                                                            <p style="margin:1px;line-height:99%;font-size:12px;">
                                                                                <span style="white-space:nowrap;">
                                                                                    <img src="https://gifo.srv.wisestamp.com/s/rfw1/953DB8/26/trans.png" style="line-height:120%;width:12px;" width="12" alt="icon">&nbsp;
                                                                                    <a href="https://pitchperfectsolutions.com/" target="_blank" style="font-family:Verdana;text-decoration:unset;" rel="nofollow noreferrer">
                                                                                        <span style="line-height:120%;font-family:Verdana;font-size:12px;color:#212121;white-space:nowrap;">pitchperfectsolutions.com/</span>
                                                                                    </a>
                                                                                </span>
                                                                            </p>
                                                                        </td></tr>
                                                                        <tr><td nowrap width="295" height="0" style="height:0;padding-top:10px;white-space:nowrap;width:295px;font-family:Verdana;">
                                                                            <p style="margin:1px;line-height:99%;font-size:12px;">
                                                                                <span style="white-space:nowrap;">
                                                                                    <img src="https://gifo.srv.wisestamp.com/s/rfem1/953DB8/26/trans.png" style="line-height:120%;width:12px;" width="12" alt="icon">&nbsp;
                                                                                    <a href="mailto:reports@pitchperfectsolutions.net" target="_blank" style="font-family:Verdana;text-decoration:unset;" rel="nofollow noreferrer">
                                                                                        <span style="line-height:120%;font-family:Verdana;font-size:12px;color:#212121;white-space:nowrap;">reports@pitchperfectsolutions.net</span>
                                                                                    </a>
                                                                                </span>
                                                                            </p>
                                                                        </td></tr>
                                                                    </table>
                                                                </td></tr>
                                                            </table>
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td></tr>
                                            <tr><td height="0" style="height:0;line-height:1%;padding-top:16px;font-size:1px;"></td></tr>
                                            <tr><td>
                                                <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;width:100%;color:gray;border-top:1px solid gray;line-height:normal;">
                                                    <tr><td height="0" style="height:0;padding:9px 8px 0 0;">
                                                        <p style="color:#888888;text-align:left;font-size:10px;margin:1px;line-height:120%;font-family:Verdana">IMPORTANT: The contents of this email and any attachments are confidential. They are intended for the named recipient(s) only. If you have received this email by mistake, please notify the sender immediately and do not disclose the contents to anyone or make copies thereof.</p>
                                                    </td></tr>
                                                </table>
                                            </td></tr>
                                        </table>
                                    </td></tr>
                                </table>
                            </div>
                        </div>
                    `,
                    attachments: [
                        {
                            filename: `${reportTitle.replace(/[^a-z0-9]/gi, '_')}.pdf`,
                            content: base64Data,
                            encoding: 'base64'
                        }
                    ]
                })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Failed to send email');
            }

            // Success
            setIsEmailModalOpen(false);
            setEmailRecipient('');
            setEmailSubjectSuffix('');
            setExportMessage("Email Sent Successfully!");
            setTimeout(() => setExportMessage(null), 3000);

        } catch (error: any) {
            console.error('Email Error:', error);
            setExportMessage(`Email failed: ${error.message}`); // Show on main screen too
            setTimeout(() => setExportMessage(null), 4000); // And clear
        } finally {
            setIsSendingEmail(false);
        }
    };

    // Export to Analytics Pipeline
    const exportToAnalytics = async () => {
        setIsExporting(true);
        try {
            const response = await fetch('/api/analytics/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})  // Can add externalEndpoint here to push to external server
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Export failed');
            }

            // Download as JSON file
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            saveAs(blob, `analytics-export-${new Date().toISOString().split('T')[0]}.json`);

            setExportMessage(`Exported ${data.recordCount} records for analytics`);
            setTimeout(() => setExportMessage(null), 3000);
        } catch (error: any) {
            setExportMessage(`Export failed: ${error.message}`);
            setTimeout(() => setExportMessage(null), 3000);
        } finally {
            setIsExporting(false);
        }
    };

    const generateCSV = () => {
        try {
            console.log('=== CSV Export Debug ===');
            console.log('reportData length:', reportData.length);

            if (reportData.length === 0) {
                setIsExporting(false);
                setExportMessage("No data to export. Adjust your filters.");
                setTimeout(() => setExportMessage(null), 3000);
                return;
            }

            // CSV Headers
            const headers = ["ID", "Timestamp", "Agent Name", "Compliance Score", "Status", "Duration", "Risk Level", "Campaign", "Summary"];

            // Format rows - handle special characters properly
            const rows = reportData.map(call => [
                String(call.id || ''),
                String(call.timestamp || ''),
                String(call.agentName || '').replace(/"/g, '""'),
                String(call.complianceScore || 0),
                String(call.status || '').replace(/"/g, '""'),
                String(call.duration || ''),
                String(call.riskLevel || 'Low'),
                String(call.campaignType || 'General').replace(/"/g, '""'),
                String(call.summary || '').replace(/"/g, '""').replace(/\n/g, ' ')
            ]);

            // Build CSV content with proper escaping
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
            ].join('\r\n');

            // Add BOM for Excel compatibility
            const BOM = '\uFEFF';
            const finalContent = BOM + csvContent;
            const blob = new Blob([finalContent], { type: 'text/csv;charset=utf-8' });

            // Use file-saver for reliable download with proper filename
            const filename = `${reportTitle.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
            saveAs(blob, filename);

            setIsExporting(false);
            setExportMessage("CSV exported successfully!");
            setTimeout(() => setExportMessage(null), 3000);
        } catch (error) {
            console.error('CSV Export Error:', error);
            setIsExporting(false);
            setExportMessage("Error exporting CSV. Please try again.");
            setTimeout(() => setExportMessage(null), 3000);
        }
    };

    // Generate PDF using shared utility
    const generatePDF = async () => {
        setIsExporting(true);
        try {
            const doc = await generateQAComplianceReport(reportData, {
                title: reportTitle,
                userName: profile?.display_name || user?.email || 'User',
                dateRange: {
                    start: dateRange.start ? format(dateRange.start, 'yyyy-MM-dd') : undefined,
                    end: dateRange.end ? format(dateRange.end, 'yyyy-MM-dd') : undefined
                },
                filters: {
                    minScore: minScore > 0 ? minScore : undefined,
                    riskLevel: 'All' // ReportsView doesn't seem to have specific risk filter state that differs from page.tsx passing it
                }
            });

            // Save PDF
            const filename = `${reportTitle.replace(/[^a-z0-9]/gi, '_')}.pdf`;
            doc.save(filename);

            setIsExporting(false);
            setExportMessage("PDF Report Generated Successfully!");
            setTimeout(() => setExportMessage(null), 3000);
        } catch (error: any) {
            console.error('PDF Export Error:', error);
            setIsExporting(false);
            setExportMessage(`Error: ${error?.message || 'Unknown PDF error'}`);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <style>{`
        /* CSS Hack: Expand the click target of the date picker to the full input */
        .calendar-trigger::-webkit-calendar-picker-indicator {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100%;
            height: 100%;
            opacity: 0;
            cursor: pointer;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 999px;
          background: #9333ea;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          margin-top: -6px;
        }
        input[type=range]::-webkit-slider-runnable-track {
          width: 100%;
          height: 4px;
          cursor: pointer;
          background: #e2e8f0;
          border-radius: 2px;
        }
        .table-row-hover:hover {
          background-color: #f8fafc;
        }
      `}</style>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Compliance Reports</h2>
                    <p className="text-sm text-slate-500">Generate, download, and share campaign insights.</p>
                </div>
                {exportMessage && (
                    <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg text-sm font-semibold border border-emerald-200 shadow-sm animate-in fade-in slide-in-from-right flex items-center gap-2">
                        <CheckCircle2 size={16} /> {exportMessage}
                    </div>
                )}
            </div>

            {/* Configuration Card */}
            <Card className="bg-white border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
                    <Filter size={18} className="text-purple-600" />
                    <h3 className="font-bold text-slate-800 uppercase tracking-wide text-xs">Report Parameters</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Report Title</label>
                        <div className="relative">
                            <FileText className="absolute left-3 top-2.5 text-slate-500 pointer-events-none" size={16} />
                            <input
                                type="text"
                                value={reportTitle}
                                onChange={(e) => setReportTitle(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-900 font-medium placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
                                placeholder="e.g. Q4 Compliance Review"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">From Date</label>
                        <div className="flex gap-2">
                            <div className="relative group flex-1">
                                <Calendar className="absolute left-3 top-2.5 text-slate-500 pointer-events-none group-hover:text-purple-500 transition-colors z-10" size={16} />
                                <input
                                    ref={startDateRef}
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="calendar-trigger w-full pl-10 pr-4 py-2.5 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-900 font-medium focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all cursor-pointer relative"
                                />
                            </div>
                            <input
                                type="time"
                                value={startHour}
                                onChange={(e) => setStartHour(e.target.value)}
                                className="w-24 px-3 py-2.5 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-900 font-medium focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">To Date</label>
                        <div className="flex gap-2">
                            <div className="relative group flex-1">
                                <Calendar className="absolute left-3 top-2.5 text-slate-500 pointer-events-none group-hover:text-purple-500 transition-colors z-10" size={16} />
                                <input
                                    ref={endDateRef}
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="calendar-trigger w-full pl-10 pr-4 py-2.5 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-900 font-medium focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all cursor-pointer relative"
                                />
                            </div>
                            <input
                                type="time"
                                value={endHour}
                                onChange={(e) => setEndHour(e.target.value)}
                                className="w-24 px-3 py-2.5 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-900 font-medium focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Campaign Tag</label>
                        <div className="relative">
                            <Tag className="absolute left-3 top-2.5 text-slate-500 pointer-events-none" size={16} />
                            <input
                                list="campaign-tags"
                                value={selectedTag}
                                onChange={(e) => setSelectedTag(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-900 font-medium placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                                placeholder="Type or select tag..."
                            />
                            <datalist id="campaign-tags">
                                {availableTags.map(tag => (
                                    <option key={tag} value={tag} />
                                ))}
                            </datalist>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Min Score</label>
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${minScore >= 90 ? 'bg-emerald-100 text-emerald-700' : minScore >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{minScore}%</span>
                        </div>
                        <div className="relative flex items-center h-10 px-3 bg-slate-100 border border-slate-300 rounded-lg">
                            <BarChart3 size={14} className="text-slate-400 mr-2 shrink-0" />
                            <input
                                type="range"
                                min="0"
                                max="100"
                                step="5"
                                value={minScore}
                                onChange={(e) => setMinScore(parseInt(e.target.value))}
                                className="w-full h-1 bg-transparent appearance-none cursor-pointer"
                            />
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-slate-50">
                    <button
                        onClick={() => handleExport('email')}
                        disabled={isExporting || reportData.length === 0}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-500 shadow-md transition-all hover:shadow-lg disabled:opacity-50"
                    >
                        <Mail size={16} /> Email Report
                    </button>
                    <button
                        onClick={() => handleExport('csv')}
                        disabled={isExporting || reportData.length === 0}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 shadow-md transition-all hover:shadow-lg disabled:opacity-50"
                    >
                        <FileSpreadsheet size={16} /> Export CSV
                    </button>
                    <button
                        onClick={() => handleExport('pdf')}
                        disabled={isExporting || reportData.length === 0}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 shadow-md transition-all hover:shadow-lg disabled:opacity-50"
                    >
                        {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        Download PDF
                    </button>
                </div>
            </Card>

            {/* Report Preview */}
            {reportData.length > 0 ? (
                <div className="space-y-6">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Search size={20} className="text-purple-500" />
                        Report Preview
                        <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded-full">{reportData.length} records found</span>
                    </h3>

                    {/* Preview Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <StatMetric
                            label="Report Avg Score"
                            value={`${stats.avgScore}%`}
                            icon={CheckCircle2}
                            color={stats.avgScore >= 90 ? 'emerald' : 'amber'}
                        />
                        <StatMetric
                            label="Compliance Rate"
                            value={`${stats.complianceRate}%`}
                            icon={FileText}
                            color="purple"
                        />
                        <StatMetric
                            label="Identified Risks"
                            value={stats.riskCount.toString()}
                            icon={AlertTriangle}
                            color="rose"
                        />
                    </div>

                    {/* Preview Table - MATCHING RECENT CALLS TABLE */}
                    <Card noPadding className="overflow-hidden border border-slate-200">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Call Date</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Analyzed At</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Agent</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Campaign</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Contact</th>
                                        <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Score</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Duration</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                                        <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Risk</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {reportData.map(call => {
                                        const statusConfig = getStatusConfig(call.status);
                                        const riskConfig = getRiskConfig(call.riskLevel);
                                        const scoreColor = getScoreStyle(call.complianceScore);

                                        return (
                                            <tr key={call.id} className="table-row-hover transition-colors">
                                                <td className="px-4 py-5">
                                                    <div className="text-sm font-bold text-slate-800 leading-tight">
                                                        {call.callDate || '--'}
                                                    </div>
                                                    <div className="text-[11px] font-semibold text-slate-400 mt-0.5">
                                                        {call.callTime || '--'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-sm font-semibold text-slate-600 whitespace-nowrap">
                                                        {formatAnalyzedAt(call.analyzedAt)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-sm font-bold text-slate-900">{call.agentName}</div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-sm font-semibold text-slate-600">{call.campaignType || 'General'}</div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="text-sm text-slate-600 font-semibold whitespace-nowrap">
                                                        {formatPhoneNumber(call.phoneNumber)}
                                                    </div>
                                                </td>

                                                {/* Score Column */}
                                                <td className="px-4 py-5 text-center">
                                                    <div className={`flex items-center justify-center gap-1.5 text-sm font-black ${scoreColor}`}>
                                                        <Award size={16} strokeWidth={2.5} />
                                                        {call.complianceScore}%
                                                    </div>
                                                </td>

                                                <td className="px-6 py-5">
                                                    <span className="text-sm font-semibold text-slate-600">{call.duration}</span>
                                                </td>

                                                {/* Status Column */}
                                                <td className="px-6 py-5">
                                                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${statusConfig.bg} ${statusConfig.border}`}>
                                                        <statusConfig.Icon size={14} strokeWidth={2.5} className={statusConfig.iconColor} />
                                                        <span className={`text-[10px] font-black uppercase tracking-widest ${statusConfig.text}`}>
                                                            {statusConfig.label}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Risk Column */}
                                                <td className="px-4 py-5 text-center">
                                                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${riskConfig.bg} ${riskConfig.border}`}>
                                                        <riskConfig.Icon size={14} strokeWidth={2.5} className={riskConfig.iconColor} />
                                                        <span className={`text-[10px] font-black uppercase tracking-widest ${riskConfig.text}`}>
                                                            {riskConfig.label}
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            ) : (
                <div className="text-center py-12 bg-white rounded-xl border border-slate-200 border-dashed">
                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Search className="text-slate-300" size={24} />
                    </div>
                    <h3 className="text-slate-900 font-bold mb-1">No Data Found</h3>
                    <p className="text-slate-500 text-sm">Try adjusting your date range, score, or tags to generate a report.</p>
                </div>
            )}
            {/* Email Modal */}
            <AnimatePresence>
                {isEmailModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setIsEmailModalOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200"
                        >
                            <h3 className="text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
                                <Mail className="text-purple-600" />
                                Email Report
                            </h3>
                            <p className="text-slate-500 text-sm mb-6">
                                Send this report directly to stakeholders via email.
                            </p>

                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-600 uppercase">Recipient</label>
                                    <input
                                        type="email"
                                        value={emailRecipient}
                                        onChange={(e) => setEmailRecipient(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                        placeholder="client@example.com"
                                        autoFocus
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-600 uppercase">Subject Suffix</label>
                                    <div className="flex items-center gap-2 group relative">
                                        <span className="text-sm text-slate-400 font-medium whitespace-nowrap bg-slate-100 px-3 py-2.5 rounded-l-lg border-y border-l border-slate-300">
                                            From QA ({profile?.display_name || 'User'}) -
                                        </span>
                                        <input
                                            type="text"
                                            value={emailSubjectSuffix}
                                            onChange={(e) => setEmailSubjectSuffix(e.target.value)}
                                            className="w-full pl-3 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-r-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none -ml-px"
                                            placeholder="Weekly Summary"
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-400">
                                        Subject will be: From QA ({profile?.display_name || 'User'}) - {emailSubjectSuffix || '...'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end mt-8">
                                <button
                                    onClick={() => setIsEmailModalOpen(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-semibold transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSendEmail}
                                    disabled={!emailRecipient || !emailSubjectSuffix || isSendingEmail}
                                    className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl transition-all"
                                >
                                    {isSendingEmail ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" /> Sending...
                                        </>
                                    ) : (
                                        <>
                                            <Send size={16} /> Send Email
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

"use client";


import React, { useState, useMemo, useRef } from 'react';
import { Card } from './ui/Card';
import { CallData, CallStatus } from '@/types/qa-types';
import {
    Calendar, Download, Mail, Tag, FileText, CheckCircle2, AlertTriangle,
    Filter, Search, Loader2, FileSpreadsheet, BarChart3,
    XCircle, RotateCcw, ShieldAlert, AlertCircle, ShieldCheck, Award
} from 'lucide-react';
import { StatMetric } from './StatMetric';
import { saveAs } from 'file-saver';
// jsPDF and autoTable are dynamically imported in generatePDF()

interface ReportsViewProps {
    calls: CallData[];
}

export const ReportsView: React.FC<ReportsViewProps> = ({ calls }) => {
    // Report Configuration State
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedTag, setSelectedTag] = useState('');
    const [minScore, setMinScore] = useState(0);
    const [reportTitle, setReportTitle] = useState('Compliance Summary Report');

    const [isExporting, setIsExporting] = useState(false);
    const [exportMessage, setExportMessage] = useState<string | null>(null);

    // Refs for Date Inputs
    const startDateRef = useRef<HTMLInputElement>(null);
    const endDateRef = useRef<HTMLInputElement>(null);

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
            const callDate = new Date(call.timestamp);

            // Date Filter
            if (startDate && callDate < new Date(startDate)) return false;
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59); // Include the full end day
                if (callDate > end) return false;
            }

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
    }, [calls, startDate, endDate, selectedTag, minScore]);

    // Calculate Report Stats
    const stats = useMemo(() => {
        const total = reportData.length;
        if (total === 0) return { avgScore: 0, complianceRate: 0, riskCount: 0 };

        const totalScore = reportData.reduce((acc, curr) => acc + (curr.complianceScore || 0), 0);
        const compliantCount = reportData.filter(c => c.status === CallStatus.CONSENT).length;
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
        setIsExporting(true);

        if (type === 'pdf') {
            generatePDF();
        } else if (type === 'csv') {
            generateCSV();
        } else {
            // Mock email
            setTimeout(() => {
                setIsExporting(false);
                setExportMessage('Report sent to admin@pitchvision.com');
                setTimeout(() => setExportMessage(null), 3000);
            }, 1500);
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

    const generatePDF = async () => {
        try {
            const { jsPDF } = await import('jspdf');
            const autoTableModule = await import('jspdf-autotable');

            // 1. Landscape Orientation for Data Density
            const doc = new jsPDF({ orientation: 'landscape' });
            const pageWidth = doc.internal.pageSize.width; // ~297mm
            const pageHeight = doc.internal.pageSize.height; // ~210mm

            // --- Helper: Load Image ---
            const loadImage = (url: string): Promise<HTMLImageElement> => {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.src = url;
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                });
            };

            // --- Colors (Deep Corporate Style) ---
            const THEME_COLOR: [number, number, number] = [30, 41, 59];    // Classic Dark Slate
            const ACCENT_COLOR: [number, number, number] = [147, 51, 234]; // Brand Purple
            const TEXT_MAIN: [number, number, number] = [30, 30, 30];
            const TEXT_LIGHT: [number, number, number] = [100, 100, 100];

            // 2. Header Integration
            // Top thick brand line
            doc.setFillColor(...ACCENT_COLOR);
            doc.rect(0, 0, pageWidth, 3, 'F');

            // Logo & Title Block
            try {
                // Correct Logo: 'logo-header.png' (Pitch Perfect)
                const logoImg = await loadImage('/images/logo-header.png');
                const logoHeight = 12;
                const logoWidth = (logoImg.width / logoImg.height) * logoHeight;
                doc.addImage(logoImg, 'PNG', 14, 10, logoWidth, logoHeight);
            } catch (e) {
                // Fallback text
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(16);
                doc.setTextColor(...THEME_COLOR);
                doc.text("Pitch Vision", 14, 18);
            }

            // Report Title (Right Aligned)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(...THEME_COLOR);
            doc.text("COMPLIANCE AUDIT REPORT", pageWidth - 14, 16, { align: 'right' });

            // Meta Data (Under Title)
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...TEXT_LIGHT);
            const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            doc.text(`Generated: ${dateStr}`, pageWidth - 14, 21, { align: 'right' });
            doc.text(`Period: ${startDate || 'All Time'} - ${endDate || 'Present'}`, pageWidth - 14, 25, { align: 'right' });

            // Divider Line
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.1);
            doc.line(14, 30, pageWidth - 14, 30);

            // --- Table Section ---
            const tableBody = reportData.map(call => {
                const dateObj = new Date(call.timestamp);
                const date = dateObj.toLocaleDateString('en-US');
                const time = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

                // Construct Violation Text
                let violationText = '';
                if (Array.isArray(call.violations) && call.violations.length > 0) {
                    violationText = call.violations.join('\n• ');
                    if (violationText) violationText = '• ' + violationText;
                } else if (call.checklist && Array.isArray(call.checklist)) {
                    const failed = call.checklist.filter(i =>
                        i.status === 'not_met' || i.status === 'FAIL'
                    );
                    violationText = failed.map(i => {
                        return i.evidence ? `• "${i.evidence}"` : `• ${i.name}`;
                    }).join('\n');
                }

                if (!violationText && call.complianceScore < 100 && call.summary) {
                    violationText = call.summary.substring(0, 120) + '...';
                }

                return [
                    date,
                    time,
                    call.agentName || '-',
                    formatPhoneNumber(call.phoneNumber),
                    violationText || '-',
                    `${call.complianceScore}%`,
                    call.riskLevel || 'Low'
                ];
            });

            // AutoTable (Landscape Config)
            autoTableModule.default(doc, {
                startY: 35,
                head: [['DATE', 'TIME', 'AGENT NAME', 'PHONE', 'VIOLATIONS', 'SCORE', 'RISK']],
                body: tableBody,
                theme: 'plain',
                styles: {
                    font: 'helvetica',
                    fontSize: 8,
                    textColor: TEXT_MAIN,
                    cellPadding: 3,
                    lineColor: [230, 230, 230],
                    lineWidth: 0,
                    overflow: 'linebreak',
                    valign: 'middle', // Better vertical alignment
                },
                headStyles: {
                    fillColor: [248, 250, 252],
                    textColor: THEME_COLOR,
                    fontSize: 8,
                    fontStyle: 'bold',
                    halign: 'left',
                    cellPadding: 3,
                },
                // Precise Column Widths for Landscape (Total ~270mm usable)
                columnStyles: {
                    0: { cellWidth: 20 }, // Date
                    1: { cellWidth: 15 }, // Time (Fixed, no wrap)
                    2: { cellWidth: 50, fontStyle: 'bold' }, // Agent Name (Generous)
                    3: { cellWidth: 35 }, // Phone
                    4: { cellWidth: 'auto' }, // Violations (Fills rest)
                    5: { cellWidth: 15, halign: 'right' }, // Score (Fixed, no wrap)
                    6: { cellWidth: 25, fontStyle: 'bold' }  // Risk
                },
                didDrawPage: function (data) {
                    // Header line
                    if (data.cursor) {
                        doc.setDrawColor(30, 41, 59);
                        doc.setLineWidth(0.5);
                        doc.line(14, data.cursor.y, pageWidth - 14, data.cursor.y);
                    }
                },
                didParseCell: (data) => {
                    if (data.section === 'body') {
                        // Risk Color
                        if (data.column.index === 6) {
                            const risk = (data.cell.raw as string).toLowerCase();
                            if (risk === 'high' || risk === 'critical') {
                                data.cell.styles.textColor = [220, 38, 38];
                            } else if (risk === 'medium' || risk === 'warning') {
                                data.cell.styles.textColor = [217, 119, 6];
                            } else {
                                data.cell.styles.textColor = [5, 150, 105];
                            }
                        }
                        // Score Color
                        if (data.column.index === 5) {
                            const score = parseInt((data.cell.raw as string).replace('%', ''));
                            if (score < 70) {
                                data.cell.styles.textColor = [220, 38, 38];
                            } else if (score < 90) {
                                data.cell.styles.textColor = [217, 119, 6];
                            } else {
                                data.cell.styles.textColor = [5, 150, 105];
                            }
                        }
                    }
                },
                didDrawCell: (data) => {
                    if (data.section === 'head' && data.row.index === 0) {
                        doc.setDrawColor(200, 200, 200);
                        doc.setLineWidth(0.1);
                        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
                    }
                    if (data.section === 'body') {
                        doc.setDrawColor(245, 245, 245);
                        doc.setLineWidth(0.1);
                        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
                    }
                }
            });

            // --- Trends & Observations Section ---
            const finalY = (doc as any).lastAutoTable?.finalY || 40;

            // Allow for page break if near bottom
            let currentY = finalY + 15;
            if (currentY > pageHeight - 30) {
                doc.addPage();
                currentY = 20;
            }

            // Section Title
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...ACCENT_COLOR);
            doc.text("TRENDS & OBSERVATIONS", 14, currentY);

            doc.setDrawColor(...ACCENT_COLOR);
            doc.setLineWidth(0.5);
            doc.line(14, currentY + 2, pageWidth - 14, currentY + 2);

            currentY += 10;

            // Trend Analysis Calculation
            // ... (Metrics logic remains same, just ensuring landscape width text)
            const allViolations: string[] = [];
            reportData.forEach(c => {
                if (c.checklist && Array.isArray(c.checklist)) {
                    c.checklist.forEach(i => {
                        if (i.status === 'not_met' || i.status === 'FAIL') allViolations.push(i.name);
                    });
                }
            });
            const violationCounts = allViolations.reduce((acc, curr) => {
                acc[curr] = (acc[curr] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            const topViolations = Object.entries(violationCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

            const agentRisk = reportData.reduce((acc, curr) => {
                const name = curr.agentName || 'Unknown';
                if (!acc[name]) acc[name] = { total: 0, fail: 0 };
                acc[name].total++;
                if (curr.complianceScore < 70 || (curr.riskLevel === 'High' || curr.riskLevel === 'Critical')) acc[name].fail++;
                return acc;
            }, {} as Record<string, { total: number, fail: number }>);
            const riskyAgents = Object.entries(agentRisk)
                .filter(([_, stats]) => stats.fail > 0)
                .map(([name, stats]) => ({ name, rate: (stats.fail / stats.total) * 100 }))
                .sort((a, b) => b.rate - a.rate)
                .slice(0, 3);

            // Draw Observations (Landscape Width)
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...THEME_COLOR);

            // Helper to safely add text
            const addTextWithPageCheck = (text: string) => {
                // Use Landscape width: pageWidth - 28
                const splitText = doc.splitTextToSize(text, pageWidth - 28);
                if (currentY + (splitText.length * 5) > pageHeight - 20) {
                    doc.addPage();
                    currentY = 20;
                }
                doc.text(splitText, 14, currentY);
                currentY += (splitText.length * 5) + 3;
            };

            // Observation 1: Violations
            let obsText1 = "Top Recurring Violations: ";
            if (topViolations.length > 0) {
                obsText1 += topViolations.map(([name, count]) => `${name} (${count} occurrences)`).join(', ') + '.';
            } else {
                obsText1 += "No significant violation trends detected in this batch.";
            }
            addTextWithPageCheck(obsText1);

            // Observation 2: Agents
            if (riskyAgents.length > 0) {
                let obsText2 = "Agent Focus Areas: ";
                obsText2 += riskyAgents.map(a => `${a.name} (${Math.round(a.rate)}% failure rate)`).join(', ') + '.';
                addTextWithPageCheck(obsText2);
            }

            // Observation 3: Summary
            const obsText3 = `Summary: Analyzed ${reportData.length} calls with an average compliance score of ${stats.avgScore}%. ${stats.riskCount} calls were flagged as high risk.`;
            addTextWithPageCheck(obsText3);

            // Footer
            const pageCount = doc.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(...TEXT_LIGHT);
                doc.text("Pitch Vision Solutions - Internal Confidential", 14, pageHeight - 10);
                doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
            }

            // Output
            const filename = `${reportTitle.replace(/[^a-z0-9]/gi, '_')}.pdf`;
            doc.save(filename);

            setIsExporting(false);
            setExportMessage("PDF downloaded successfully!");
            setTimeout(() => setExportMessage(null), 3000);
        } catch (error: any) {
            console.error('PDF Export Error:', error);
            setIsExporting(false);
            setExportMessage(`Error: ${error?.message || 'Unknown PDF error'}`);
            setTimeout(() => setExportMessage(null), 5000);
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
                        <div className="relative group">
                            <Calendar className="absolute left-3 top-2.5 text-slate-500 pointer-events-none group-hover:text-purple-500 transition-colors z-10" size={16} />
                            <input
                                ref={startDateRef}
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="calendar-trigger w-full pl-10 pr-4 py-2.5 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-900 font-medium focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all cursor-pointer relative"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">To Date</label>
                        <div className="relative group">
                            <Calendar className="absolute left-3 top-2.5 text-slate-500 pointer-events-none group-hover:text-purple-500 transition-colors z-10" size={16} />
                            <input
                                ref={endDateRef}
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="calendar-trigger w-full pl-10 pr-4 py-2.5 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-900 font-medium focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all cursor-pointer relative"
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
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 hover:text-purple-600 transition-all disabled:opacity-50"
                    >
                        <Mail size={16} /> Email Report
                    </button>
                    <button
                        onClick={() => handleExport('csv')}
                        disabled={isExporting || reportData.length === 0}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 hover:text-emerald-600 transition-all disabled:opacity-50"
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
                    <button
                        onClick={exportToAnalytics}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-500 shadow-md transition-all hover:shadow-lg disabled:opacity-50"
                    >
                        {isExporting ? <Loader2 size={16} className="animate-spin" /> : <BarChart3 size={16} />}
                        Export Analytics
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
        </div>
    );
};

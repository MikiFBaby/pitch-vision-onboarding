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

            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.width;
            const pageHeight = doc.internal.pageSize.height;

            // --- Helper: Load Image ---
            const loadImage = (url: string): Promise<HTMLImageElement> => {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.src = url;
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                });
            };

            // --- Brand Colors ---
            // Cast as tuples to satisfy jsPDF spread arguments
            const BRAND_PURPLE: [number, number, number] = [147, 51, 234]; // #9333ea
            const SLATE_900: [number, number, number] = [15, 23, 42];      // #0f172a
            const SLATE_500: [number, number, number] = [100, 116, 139];   // #64748b
            const SLATE_50: [number, number, number] = [248, 250, 252];    // #f8fafc

            // --- Header Section ---
            // 1. Top Accent Line (Thicker to match brand)
            doc.setFillColor(...BRAND_PURPLE);
            doc.rect(0, 0, pageWidth, 4, 'F');

            // 2. Logo Integration
            try {
                const logoImg = await loadImage('/images/report-logo.png');
                // Calculate aspect ratio to fit height of 15mm
                const logoHeight = 15;
                const logoWidth = (logoImg.width / logoImg.height) * logoHeight;
                doc.addImage(logoImg, 'PNG', 14, 10, logoWidth, logoHeight);

                // 3. Report Title (Right Aligned - Shifted down slightly)
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(22);
                doc.setTextColor(...SLATE_900);
                doc.text("EXECUTIVE REPORT", pageWidth - 14, 20, { align: 'right' });
            } catch (e) {
                // Fallback text if logo fails
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(22);
                doc.setTextColor(...SLATE_900);
                doc.text("Pitch Perfect", 14, 22);

                doc.setFontSize(14);
                doc.setTextColor(80, 80, 80);
                doc.text("EXECUTIVE REPORT", pageWidth - 14, 22, { align: 'right' });
            }

            // 4. Meta Data (Right Aligned)
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...SLATE_500);
            const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            doc.text(`Generated: ${dateStr}`, pageWidth - 14, 26, { align: 'right' });
            doc.text(`Period: ${startDate || 'All Time'} - ${endDate || 'Present'}`, pageWidth - 14, 31, { align: 'right' });

            // --- Summary Section (Cards) ---
            const startY = 45;
            const cardWidth = (pageWidth - 28 - 10) / 3; // 3 cards, 14px margin sides, 5px gap
            const cardHeight = 24;

            // Helper to draw varied metric cards
            const drawMetricCard = (x: number, label: string, value: string, subtext: string, accentColor: [number, number, number]) => {
                // Card bg
                doc.setFillColor(252, 252, 252);
                doc.setDrawColor(230, 230, 230);
                doc.roundedRect(x, startY, cardWidth, cardHeight, 2, 2, 'FD');

                // Left accent strip
                doc.setFillColor(...accentColor);
                doc.rect(x, startY, 1.5, cardHeight, 'F'); // strip

                // Label
                doc.setFontSize(8);
                doc.setTextColor(...SLATE_500);
                doc.text(label.toUpperCase(), x + 6, startY + 8);

                // Value
                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...SLATE_900);
                doc.text(value, x + 6, startY + 18);
            };

            drawMetricCard(14, "Total Calls", `${reportData.length}`, "Records", [59, 130, 246] as [number, number, number]); // Blue accent
            drawMetricCard(14 + cardWidth + 5, "Avg Score", `${stats.avgScore}%`, "Compliance", [147, 51, 234] as [number, number, number]); // Purple accent
            drawMetricCard(14 + (cardWidth + 5) * 2, "High Risks", `${stats.riskCount}`, "Critical", [239, 68, 68] as [number, number, number]); // Red accent

            // --- Divider ---
            doc.setDrawColor(240, 240, 240);
            doc.line(14, startY + cardHeight + 10, pageWidth - 14, startY + cardHeight + 10);

            // --- Table Data Preparation ---
            // Columns: Date | Agent | Campaign | Duration | Risk | Score | Status
            const tableBody = reportData.map(call => [
                new Date(call.timestamp).toLocaleDateString(),
                call.agentName || '-',
                call.campaignType || '-',
                call.duration || '0:00',
                call.riskLevel || '-',
                `${call.complianceScore}%`,
                (call.status || '-').toUpperCase()
            ]);

            // --- AutoTable ---
            autoTableModule.default(doc, {
                startY: startY + cardHeight + 15,
                head: [['Date', 'Agent', 'Campaign', 'Duration', 'Risk', 'Score', 'Status']],
                body: tableBody,
                theme: 'grid', // 'grid' gives us cleaner borders we can customize
                styles: {
                    font: 'helvetica',
                    fontSize: 8,
                    textColor: [51, 65, 85],
                    cellPadding: 4,
                    lineColor: [241, 245, 249],
                    lineWidth: 0.1,
                },
                headStyles: {
                    fillColor: [30, 41, 59], // Slate 800
                    textColor: [255, 255, 255],
                    fontSize: 8,
                    fontStyle: 'bold',
                    halign: 'left',
                    cellPadding: 4
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252] // Slate 50
                },
                columnStyles: {
                    0: { cellWidth: 25 }, // Date
                    1: { cellWidth: 40 }, // Agent
                    2: { cellWidth: 35 }, // Campaign
                    3: { cellWidth: 15, halign: 'center' }, // Duration
                    4: { cellWidth: 20 }, // Risk
                    5: { cellWidth: 15, halign: 'center', fontStyle: 'bold' }, // Score
                    6: { cellWidth: 30 }  // Status
                },
                didParseCell: function (data) {
                    // Color code the Status and Risk columns
                    if (data.section === 'body') {
                        if (data.column.index === 5) { // Score
                            const score = parseInt(data.cell.raw as string);
                            if (score >= 90) data.cell.styles.textColor = [16, 185, 129]; // Emerald
                            else if (score < 70) data.cell.styles.textColor = [239, 68, 68]; // Red
                        }
                        if (data.column.index === 6) { // Status
                            const text = (data.cell.raw as string) || '';
                            if (text.includes('CONSENT') && !text.includes('NO')) {
                                data.cell.styles.textColor = [16, 185, 129];
                            } else if (text.includes('FAIL') || text.includes('NO')) {
                                data.cell.styles.textColor = [239, 68, 68];
                            } else {
                                data.cell.styles.textColor = [217, 119, 6]; // Amber
                            }
                        }
                        if (data.column.index === 4) { // Risk
                            const text = (data.cell.raw as string).toUpperCase();
                            if (text === 'HIGH' || text === 'CRITICAL') {
                                data.cell.styles.textColor = [220, 38, 38];
                                data.cell.styles.fontStyle = 'bold';
                            }
                        }
                    }
                },
                // Add footer to each page
                didDrawPage: function (data) {
                    // Footer line
                    doc.setDrawColor(240, 240, 240);
                    doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);

                    // Footer Text
                    doc.setFontSize(8);
                    doc.setTextColor(...SLATE_500);
                    doc.text("Pitch Vision Solutions - Confidential - Executive Report", 14, pageHeight - 10);

                    // Page Number
                    const pageStr = `Page ${doc.getNumberOfPages()}`;
                    doc.text(pageStr, pageWidth - 14, pageHeight - 10, { align: 'right' });
                }
            });

            // Save PDF
            const filename = `${reportTitle.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(filename);

            setIsExporting(false);
            setExportMessage("PDF downloaded successfully!");
            setTimeout(() => setExportMessage(null), 3000);
        } catch (error) {
            console.error('PDF Export Error:', error);
            setIsExporting(false);
            setExportMessage("Error generating PDF. Please try again.");
            setTimeout(() => setExportMessage(null), 3000);
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

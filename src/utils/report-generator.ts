
import { CallData } from "@/types/qa-types";
import { format } from "date-fns";
// We use dynamic imports for jsPDF to avoid server-side issues and reduce initial bundle size

interface ReportOptions {
    title?: string;
    userName?: string;
    dateRange?: { start?: string; end?: string };
    filters?: {
        agent?: string;
        riskLevel?: string;
        minScore?: number;
    };
}

export const generateQAComplianceReport = async (calls: CallData[], options: ReportOptions = {}) => {
    try {
        const { jsPDF } = await import('jspdf');
        const autoTableModule = await import('jspdf-autotable');

        // --- 1. CONFIG & COLORS ---
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageWidth = 297;
        const pageHeight = 210;
        const margin = 15;

        // Branding Colors (Matches Tailwind config)
        const BRAND_PURPLE: [number, number, number] = [109, 40, 217]; // #6d28d9 (Purple 700)
        const BRAND_NAVY: [number, number, number] = [15, 23, 42];    // #0f172a (Slate 900)
        const TEXT_PRIMARY: [number, number, number] = [51, 65, 85];  // #334155 (Slate 700)
        const TEXT_LIGHT: [number, number, number] = [100, 116, 139]; // #64748b (Slate 500)
        const ACCENT_GREEN: [number, number, number] = [16, 185, 129]; // #10b981
        const ACCENT_RED: [number, number, number] = [244, 63, 94];   // #f43f5e

        // --- 2. HEADER SECTION ---
        // Logo Placeholder
        doc.setFillColor(...BRAND_PURPLE);
        doc.circle(margin + 5, margin + 5, 5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.text("PV", margin + 3.5, margin + 6); // PV Logo text

        // Company Name
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(...BRAND_NAVY);
        doc.text("Pitch Vision QA", margin + 14, margin + 7);

        // Report Title
        doc.setFontSize(22);
        doc.setTextColor(...BRAND_PURPLE);
        doc.text(options.title || "Compliance Report", margin, margin + 20);

        // Generation Info (Right Aligned)
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...TEXT_LIGHT);
        const today = format(new Date(), "MMM dd, yyyy");
        const generatedBy = options.userName || "System";
        doc.text(`Generated: ${today}`, pageWidth - margin, margin + 6, { align: "right" });
        doc.text(`By: ${generatedBy}`, pageWidth - margin, margin + 11, { align: "right" });

        // Filter Summary
        let filterText = `Period: ${options.dateRange?.start || 'All'} to ${options.dateRange?.end || 'Present'}`;
        if (options.filters?.agent) filterText += ` | Agent: ${options.filters.agent}`;
        if (options.filters?.minScore) filterText += ` | Min Score: ${options.filters.minScore}%`;
        if (options.filters?.riskLevel) filterText += ` | Risk: ${options.filters.riskLevel}`;

        doc.setFontSize(9);
        doc.setTextColor(...TEXT_LIGHT);
        doc.text(filterText, margin, margin + 27);

        // --- 3. EXECUTIVE SUMMARY (METRICS) ---
        const totalCalls = calls.length;
        const avgScore = totalCalls > 0 ? Math.round(calls.reduce((a, b) => a + (b.complianceScore || 0), 0) / totalCalls) : 0;
        const compliantCount = calls.filter(c => (c.complianceScore || 0) >= 85).length;
        const complianceRate = totalCalls > 0 ? Math.round((compliantCount / totalCalls) * 100) : 0;
        const highRiskCount = calls.filter(c => (c.riskLevel || '').toLowerCase() === 'high').length;

        // Draw Metrics Boxes
        const boxWidth = 60;
        const boxHeight = 24;
        const boxY = margin + 35;
        const boxGap = 10;

        // Helper to draw metric box
        const drawMetricBox = (x: number, title: string, value: string, subtext: string, accentColor: readonly [number, number, number]) => {
            doc.setDrawColor(226, 232, 240); // slate-200
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(x, boxY, boxWidth, boxHeight, 3, 3, 'FD');

            // Accent Line
            doc.setDrawColor(...accentColor);
            doc.setLineWidth(1);
            doc.line(x, boxY, x, boxY + boxHeight); // Left border accent

            doc.setFontSize(8);
            doc.setTextColor(...TEXT_LIGHT);
            doc.text(title.toUpperCase(), x + 5, boxY + 8);

            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...BRAND_NAVY);
            doc.text(value, x + 5, boxY + 16);

            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...TEXT_LIGHT);
            doc.text(subtext, x + 5, boxY + 21);
        };

        drawMetricBox(margin, "Total Calls", totalCalls.toString(), "Analyzed Interactions", BRAND_PURPLE);
        drawMetricBox(margin + boxWidth + boxGap, "Avg. Quality", `${avgScore}%`, "Compliance Score", BRAND_PURPLE);
        drawMetricBox(margin + (boxWidth + boxGap) * 2, "Compliance Rate", `${complianceRate}%`, "Target: 85%+", ACCENT_GREEN);
        drawMetricBox(margin + (boxWidth + boxGap) * 3, "High Risk", highRiskCount.toString(), "Requires Attention", ACCENT_RED);

        // --- 4. VIOLATION BREAKDOWN (Chart Placeholder logic) ---
        // Calculate Top Violations
        const violationCounts: Record<string, number> = {};
        calls.forEach(call => {
            if (call.violations && Array.isArray(call.violations)) {
                call.violations.forEach((v: string) => {
                    violationCounts[v] = (violationCounts[v] || 0) + 1;
                });
            }
        });
        const sortedViolations = Object.entries(violationCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const chartY = boxY + boxHeight + 15;

        // Draw "Top Violations" Section
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...BRAND_NAVY);
        doc.text("Top Compliance Violations", margin, chartY);

        // Simple Bar Chart Visualization
        let barY = chartY + 8;
        const labelWidth = 90; // Fixed width for labels
        const maxBarWidth = 100;
        const maxCount = sortedViolations.length > 0 ? sortedViolations[0][1] : 1;

        if (sortedViolations.length === 0) {
            doc.setFont("helvetica", "italic");
            doc.setFontSize(9);
            doc.setTextColor(...TEXT_LIGHT);
            doc.text("No violations detected in this period.", margin, barY + 5);
        } else {
            sortedViolations.forEach(([label, count]) => {
                const barWidth = (count / maxCount) * maxBarWidth;

                // Truncate long labels to fit in labelWidth
                doc.setFont("helvetica", "normal");
                doc.setFontSize(8);
                doc.setTextColor(...TEXT_PRIMARY);

                // Truncate label if too long (approx 40 chars max)
                const maxLabelLen = 35;
                const displayLabel = label.length > maxLabelLen
                    ? label.substring(0, maxLabelLen - 2) + '...'
                    : label;
                doc.text(`${displayLabel} (${count})`, margin, barY + 4);

                // Bar starts after label area
                doc.setFillColor(244, 63, 94); // Red for violations
                doc.rect(margin + labelWidth, barY, barWidth, 5, 'F');
                barY += 9;
            });
        }

        // --- 5. DETAILED CALLS TABLE ---
        // Format table data
        const tableBody = calls.map(call => {
            const date = call.callDate || format(new Date(call.timestamp), 'yyyy-MM-dd');
            const time = call.callTime || format(new Date(call.timestamp), 'HH:mm');

            // Format violations as a single string
            let vText = '';
            if (Array.isArray(call.violations) && call.violations.length > 0) {
                vText = call.violations.join(', ');
            } else if (typeof call.violations === 'string') {
                vText = call.violations;
            }
            if (!vText) vText = '-';

            return [
                date,
                time,
                call.agentName || '-',
                call.phoneNumber || '-',
                vText,
                `${call.complianceScore}%`,
                call.riskLevel || 'Low'
            ];
        });

        autoTableModule.default(doc as any, {
            startY: barY + 10,
            head: [['DATE', 'TIME', 'AGENT', 'PHONE', 'VIOLATIONS', 'SCORE', 'RISK']],
            body: tableBody,
            theme: 'plain',
            styles: {
                font: 'helvetica',
                fontSize: 8,
                textColor: TEXT_PRIMARY,
                cellPadding: 3,
                lineColor: [230, 230, 230],
                lineWidth: 0.1,
                valign: 'middle',
            },
            headStyles: {
                fillColor: [248, 250, 252],
                textColor: BRAND_NAVY,
                fontSize: 8,
                fontStyle: 'bold',
                lineColor: [226, 232, 240],
                lineWidth: 0.1,
                overflow: 'visible', // Prevent header text wrapping
                minCellHeight: 8, // Single line height
            },
            alternateRowStyles: {
                fillColor: [252, 253, 255]
            },
            columnStyles: {
                0: { cellWidth: 22 }, // Date
                1: { cellWidth: 14 }, // Time  
                2: { cellWidth: 30, overflow: 'linebreak' }, // Agent - slightly narrower
                3: { cellWidth: 26 }, // Phone
                4: { cellWidth: 'auto', overflow: 'linebreak' }, // Violations - auto width, wrap
                5: { cellWidth: 16, halign: 'center' }, // Score
                6: { cellWidth: 14, halign: 'center' }, // Risk
            },
            didParseCell: (data: any) => {
                // Color coding for Score and Risk
                if (data.section === 'body') {
                    if (data.column.index === 5) { // Score
                        const score = parseInt(data.cell.raw);
                        if (score >= 85) data.cell.styles.textColor = [22, 163, 74]; // green
                        else if (score < 60) data.cell.styles.textColor = [220, 38, 38]; // red
                        else data.cell.styles.textColor = [234, 179, 8]; // yellow/amber
                    }
                    if (data.column.index === 6) { // Risk
                        const risk = (data.cell.raw as string).toLowerCase();
                        if (risk === 'high' || risk === 'critical') {
                            data.cell.styles.textColor = [220, 38, 38];
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                }
            }
        });

        // Footer (All Pages)
        const pages = doc.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(...TEXT_LIGHT);
            doc.text(`Pitch Perfect Solutions | Confidential`, margin, pageHeight - 8);
            doc.text(`Page ${i} of ${pages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
        }

        return doc;

    } catch (error: any) {
        console.error('PDF Generation Error:', error);
        throw error;
    }
};

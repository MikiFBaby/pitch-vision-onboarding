const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const autoTableModule = require('jspdf-autotable');
const autoTable = autoTableModule.default || autoTableModule;

// --- MOCK DATA ---
const mockReportData = [
    { timestamp: '2026-01-02T09:15:00', agentName: 'Gerald Garcia', complianceScore: 65, riskLevel: 'High', violations: ['Deceptive Opening', 'Missing Discl.'], phoneNumber: '+1 (555) 010-9988' },
    { timestamp: '2026-01-03T10:30:00', agentName: 'Angelica B.', complianceScore: 88, riskLevel: 'Low', violations: [], phoneNumber: '+1 (555) 012-3344' },
    { timestamp: '2026-01-08T14:20:00', agentName: 'Setup Team B', complianceScore: 92, riskLevel: 'Low', violations: [], phoneNumber: '+1 (555) 019-2211' },
    { timestamp: '2026-01-09T11:45:00', agentName: 'Gerald Garcia', complianceScore: 60, riskLevel: 'Critical', violations: ['Hangup', 'Rudeness'], phoneNumber: '+1 (555) 011-7766' },
    // Week 3
    { timestamp: '2026-01-15T16:10:00', agentName: 'Unknown Agent', complianceScore: 78, riskLevel: 'Medium', violations: ['Tone Issue'], phoneNumber: '+1 (555) 015-5533' },
    { timestamp: '2026-01-16T09:05:00', agentName: 'Angelica B.', complianceScore: 95, riskLevel: 'Low', violations: [], phoneNumber: '+1 (555) 014-8899' },
    // Week 4
    { timestamp: '2026-01-18T10:00:00', agentName: 'Gerald Garcia', complianceScore: 72, riskLevel: 'High', violations: ['Missing Discl.'], phoneNumber: '+1 (555) 010-1122' },
    { timestamp: '2026-01-18T13:30:00', agentName: 'Setup Team B', complianceScore: 98, riskLevel: 'Low', violations: [], phoneNumber: '+1 (555) 019-9988' }
];

const stats = {
    avgScore: 81,
    riskCount: 3
};

const generateHybridPDF = () => {
    console.log("Generating Refined Hybrid PDF...");

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = 297;
    const pageHeight = 210;
    const margin = 14;

    // Colors
    const BRAND_NAVY = [10, 25, 47];
    const TEXT_PRIMARY = [51, 51, 51];
    const ACTION_BLUE = [0, 91, 153];
    const PITCH_PURPLE = [147, 51, 234];
    const ALERT_RED = [220, 38, 38];
    const TEXT_LIGHT = [100, 100, 100];

    // Header
    doc.setFillColor(...BRAND_NAVY);
    doc.rect(0, 0, pageWidth, 18, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text("Pitch Perfect", margin, 12);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 200, 200);
    doc.setFontSize(8);
    doc.text("INTERNAL CONFIDENTIAL | January 2026 Audit", pageWidth - margin, 11, { align: 'right' });

    // --- PAGE 1: EXECUTIVE INSIGHTS ---

    // Action Title (Smart Auto-Fit)
    // Simulate Long Violation Name to test wrapping
    const topViolation = "Medicare Disclaimer (Long)";
    const actionTitleRaw = stats.avgScore >= 85
        ? `Compliance remains strong at ${stats.avgScore}%, exceeding targets.`
        : `Action required: Compliance avg is ${stats.avgScore}%, driven by '${topViolation}'.`;

    const maxTitleWidth = pageWidth - (margin * 2);
    let currentFontSize = 22;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...ACTION_BLUE);

    // Shrink font until it fits in 1 line, or stops at 16pt
    while (currentFontSize > 16) {
        doc.setFontSize(currentFontSize);
        if (doc.getTextWidth(actionTitleRaw) <= maxTitleWidth) {
            break;
        }
        currentFontSize -= 1;
    }

    // Now wrap if still needed (at the smallest size)
    const actionTitle = doc.splitTextToSize(actionTitleRaw, maxTitleWidth);
    doc.text(actionTitle, margin, 35);

    // Calculate dynamic height for subtitle adjustment
    const lineHeight = currentFontSize * 0.45; // Approx mm height per line
    const titleHeight = actionTitle.length * lineHeight;

    // Dynamic Y for subtitle
    const subTitleY = 35 + titleHeight - (lineHeight * 0.3); // Adjust tighter
    doc.setTextColor(...TEXT_PRIMARY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(`Analysis of ${mockReportData.length} calls from Jan 2 to Jan 18.`, margin, subTitleY);

    const dividerY = subTitleY + 6;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(margin, dividerY, pageWidth - margin, dividerY);

    // Layout
    const boxY = dividerY + 8;
    const boxWidth = 90;
    const boxHeight = 100;

    // Executive Summary Box
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(200, 200, 200);
    doc.rect(margin, boxY, boxWidth, boxHeight, 'FD');

    doc.setTextColor(...ACTION_BLUE);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text("Executive Summary", margin + 5, boxY + 10);

    doc.setTextColor(...TEXT_PRIMARY);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const summaryPoints = [
        `• Overall compliance Score: ${stats.avgScore}% (Target: 85%).`,
        "",
        `• Total High Risk Calls: ${stats.riskCount} (${Math.round((stats.riskCount / mockReportData.length) * 100)}% of volume).`,
        "",
        `• Top Violation Trend: "${topViolation}" appeared in 3 calls.`,
        "",
        `• Source Distribution: 6 Manual / 0 Automated.`,
        "",
        `• Recommendation: Review 'Gerald Garcia' for compliance gaps.`
    ];

    let textY = boxY + 20;
    summaryPoints.forEach(line => {
        const split = doc.splitTextToSize(line, boxWidth - 10);
        doc.text(split, margin + 5, textY);
        textY += (split.length * 5) + 2;
    });

    // Chart: Trend
    const chartX = margin + boxWidth + 15;
    const chartY = boxY;
    const chartWidth = 100;
    const chartHeight = 60;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEXT_PRIMARY);
    doc.text("Compliance Trend (By Week)", chartX, chartY + 5);

    doc.setDrawColor(100, 100, 100);
    doc.line(chartX, chartY + chartHeight, chartX + chartWidth, chartY + chartHeight);

    const trendBars = [
        { label: 'Week 1', val: 76 },
        { label: 'Week 2', val: 76 },
        { label: 'Week 3', val: 86 },
        { label: 'Week 4', val: 85 }
    ];

    const barWidth = 15;
    const gap = 10;
    let currentX = chartX + 10;
    const scale = 0.5;

    trendBars.forEach(bar => {
        const h = bar.val * scale;
        const color = bar.val >= 85 ? PITCH_PURPLE : [150, 150, 150];
        doc.setFillColor(...color);
        doc.rect(currentX, chartY + chartHeight - h, barWidth, h, 'F');
        doc.setTextColor(...TEXT_PRIMARY);
        doc.setFontSize(9);
        doc.text(`${bar.val}%`, currentX + (barWidth / 2), chartY + chartHeight - h - 2, { align: 'center' });
        doc.text(bar.label, currentX + (barWidth / 2), chartY + chartHeight + 5, { align: 'center' });
        currentX += barWidth + gap;
    });

    // --- SYSTEMIC INSIGHTS (Replacing Table) ---
    const insightsY = chartY + chartHeight + 15;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...ACTION_BLUE);
    doc.text("Top Systemic Failure Points (Hidden Value)", chartX, insightsY);

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'italic');
    doc.text("Adressing these specific violations will yield the highest ROI.", chartX, insightsY + 5);

    let insightListY = insightsY + 12;
    const topSystemic = [
        { name: 'Medicare Disclaimer', stat: '3 occurances (38% of calls)' },
        { name: 'Tone Issue', stat: '1 occurances (12% of calls)' }
    ];

    doc.setFont('helvetica', 'normal');

    topSystemic.forEach((v, idx) => {
        doc.setFillColor(...PITCH_PURPLE);
        doc.circle(chartX + 2, insightListY - 1, 1.5, 'F');

        doc.setTextColor(...TEXT_PRIMARY);
        doc.setFont('helvetica', 'normal');
        doc.text(`${idx + 1}. ${v.name}`, chartX + 6, insightListY);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...ALERT_RED);
        doc.text(v.stat, chartX + 6, insightListY + 5);

        insightListY += 12;
    });

    // --- PAGE 2: DETAILED DATA LOG ---
    doc.addPage();

    doc.setFillColor(...BRAND_NAVY);
    doc.rect(0, 0, pageWidth, 15, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text("Detailed Call Log", margin, 10);

    const tableBody = mockReportData.map(call => {
        const dateObj = new Date(call.timestamp);
        const date = dateObj.toLocaleDateString('en-US');
        const time = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        const vText = call.violations.join(', ') || '-';
        return [date, time, call.agentName, call.phoneNumber, vText, `${call.complianceScore}%`, call.riskLevel];
    });

    autoTable(doc, {
        startY: 20,
        head: [['DATE', 'TIME', 'AGENT NAME', 'PHONE', 'VIOLATIONS', 'SCORE', 'RISK']],
        body: tableBody,
        theme: 'plain',
        styles: { fontSize: 8, cellPadding: 3, textColor: TEXT_PRIMARY, lineColor: [230, 230, 230], lineWidth: 0.1 },
        headStyles: { fillColor: [248, 250, 252], textColor: BRAND_NAVY, fontSize: 8, fontStyle: 'bold' },
        didParseCell: (data) => {
            if (data.section === 'body') {
                if (data.column.index === 6) {
                    const r = (data.cell.raw).toLowerCase();
                    if (r === 'high' || r === 'critical') data.cell.styles.textColor = ALERT_RED;
                    else if (r === 'medium') data.cell.styles.textColor = [217, 119, 6];
                    else data.cell.styles.textColor = [5, 150, 105];
                }
                if (data.column.index === 5) {
                    const s = parseInt((data.cell.raw).replace('%', ''));
                    if (s < 70) data.cell.styles.textColor = ALERT_RED;
                    else data.cell.styles.textColor = [5, 150, 105];
                }
            }
        }
    });

    const desktopPath = path.join(process.env.HOME, 'Desktop', 'PitchPerfect_Refined_Report.pdf');
    doc.save(desktopPath);
    console.log(`PDF saved to: ${desktopPath}`);
};

generateHybridPDF();

import jsPDF from 'jspdf';

interface PDFSection {
    title: string;
    rows: { label: string; value: string }[];
}

interface PDFReportConfig {
    title: string;
    subtitle: string;
    generatedDate: string;
    period?: string;
    sections: PDFSection[];
    footer?: string;
}

const COLORS = {
    primary: [79, 70, 229] as [number, number, number],       // Indigo
    dark: [15, 15, 25] as [number, number, number],            // Near black
    white: [255, 255, 255] as [number, number, number],
    muted: [160, 160, 180] as [number, number, number],
    accent: [139, 92, 246] as [number, number, number],        // Purple
    divider: [50, 50, 70] as [number, number, number],
    sectionBg: [25, 25, 45] as [number, number, number],
};

export { type PDFReportConfig };

function buildPDFDoc(config: PDFReportConfig): jsPDF {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - margin * 2;
    let y = 0;

    // --- Background ---
    doc.setFillColor(...COLORS.dark);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    // --- Header bar ---
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, pageWidth, 3, 'F');

    // --- Company name ---
    y = 22;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.muted);
    doc.text('PITCH PERFECT SOLUTIONS', margin, y);

    // --- Report title ---
    y += 12;
    doc.setFontSize(24);
    doc.setTextColor(...COLORS.white);
    doc.text(config.title, margin, y);

    // --- Subtitle ---
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.muted);
    doc.text(config.subtitle, margin, y);

    // --- Meta info (date + period) ---
    y += 10;
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.accent);
    const metaText = config.period
        ? `Generated: ${config.generatedDate}  |  Period: ${config.period}`
        : `Generated: ${config.generatedDate}`;
    doc.text(metaText, margin, y);

    // --- Divider ---
    y += 6;
    doc.setDrawColor(...COLORS.divider);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // --- Sections ---
    for (const section of config.sections) {
        // Check if we need a new page
        const estimatedHeight = 12 + section.rows.length * 8;
        if (y + estimatedHeight > pageHeight - 30) {
            doc.addPage();
            doc.setFillColor(...COLORS.dark);
            doc.rect(0, 0, pageWidth, pageHeight, 'F');
            y = 20;
        }

        // Section header
        doc.setFillColor(...COLORS.sectionBg);
        doc.roundedRect(margin, y - 3, contentWidth, 9, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.accent);
        doc.text(section.title, margin + 4, y + 3);
        y += 12;

        // Section rows
        for (let i = 0; i < section.rows.length; i++) {
            const row = section.rows[i];

            if (y > pageHeight - 25) {
                doc.addPage();
                doc.setFillColor(...COLORS.dark);
                doc.rect(0, 0, pageWidth, pageHeight, 'F');
                y = 20;
            }

            // Alternating row background
            if (i % 2 === 0) {
                doc.setFillColor(30, 30, 50);
                doc.rect(margin, y - 4, contentWidth, 7, 'F');
            }

            // Label
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...COLORS.muted);
            doc.text(row.label, margin + 4, y);

            // Value - right aligned
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...COLORS.white);
            const valueWidth = doc.getTextWidth(row.value);
            doc.text(row.value, pageWidth - margin - 4 - valueWidth, y);

            y += 7;
        }

        y += 6;
    }

    // --- Footer ---
    const footerY = pageHeight - 12;
    doc.setDrawColor(...COLORS.divider);
    doc.setLineWidth(0.2);
    doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text('Pitch Perfect Solutions - Confidential', margin, footerY);
    doc.text(config.footer || 'Auto-generated report', pageWidth - margin - doc.getTextWidth(config.footer || 'Auto-generated report'), footerY);

    return doc;
}

export function generateReportPDF(config: PDFReportConfig): void {
    const doc = buildPDFDoc(config);
    const filename = `${config.title.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
}

export function generateReportPDFBase64(config: PDFReportConfig): string {
    const doc = buildPDFDoc(config);
    return doc.output('datauristring').split(',')[1]; // base64 only
}

export function getReportFilename(config: PDFReportConfig): string {
    return `${config.title.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.pdf`;
}

/**
 * Build PDF config from report data
 */
export function buildExecutivePDFConfig(
    reportData: any,
    extendedData: any,
): PDFReportConfig {
    const netChange = reportData.hires.length - reportData.terminations.length;
    const totalAbsences = reportData.bookedOff.length + reportData.unbookedOff.length;
    const attritionRate = extendedData.totalEmployees > 0
        ? ((extendedData.attritionRecords.length / extendedData.totalEmployees) * 100).toFixed(1)
        : '0';
    const ftRatio = reportData.activeAgents.length > 0
        ? Math.round((reportData.fullTimeAgents.length / reportData.activeAgents.length) * 100)
        : 0;

    return {
        title: 'Executive Workforce Summary',
        subtitle: 'High-level KPIs, headcount changes, and strategic workforce insights',
        generatedDate: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        period: reportData.weekLabel,
        sections: [
            {
                title: 'HEADCOUNT',
                rows: [
                    { label: 'Total Workforce', value: `${extendedData.totalEmployees}` },
                    { label: 'Active Employees', value: `${extendedData.activeCount}` },
                    { label: 'Terminated', value: `${extendedData.terminatedCount}` },
                    ...extendedData.countryBreakdown.map((c: any) => ({
                        label: c.country, value: `${c.count}`
                    })),
                ],
            },
            {
                title: 'WEEKLY MOVEMENT',
                rows: [
                    { label: 'New Hires', value: `${reportData.hires.length}` },
                    { label: 'Terminations', value: `${reportData.terminations.length}` },
                    { label: 'Net Change', value: `${netChange >= 0 ? '+' : ''}${netChange}` },
                ],
            },
            {
                title: 'WORKFORCE COMPOSITION',
                rows: [
                    { label: 'Full-Time (>=30h) - Commission Eligible', value: `${reportData.fullTimeAgents.length}` },
                    { label: 'Part-Time (<30h)', value: `${reportData.partTimeAgents.length}` },
                    { label: 'Active Agents on Schedule', value: `${reportData.activeAgents.length}` },
                ],
            },
            {
                title: 'ATTENDANCE',
                rows: [
                    { label: 'Booked Days Off', value: `${reportData.bookedOff.length}` },
                    { label: 'Unplanned Absences', value: `${reportData.unbookedOff.length}` },
                    { label: 'Total Absences', value: `${totalAbsences}` },
                ],
            },
            {
                title: 'KEY METRICS',
                rows: [
                    { label: 'Attrition Rate (All-Time)', value: `${attritionRate}%` },
                    { label: 'Agents on Watch List', value: `${extendedData.watchList.length}` },
                    { label: 'Full-Time Ratio', value: `${ftRatio}%` },
                ],
            },
        ],
        footer: 'Auto-generated executive report',
    };
}

export function buildAttritionPDFConfig(
    reportData: any,
    extendedData: any,
): PDFReportConfig {
    const firedByReason: Record<string, number> = {};
    extendedData.attritionRecords.forEach((r: any) => {
        const reason = r['Fired/Quit'] || 'Unknown';
        firedByReason[reason] = (firedByReason[reason] || 0) + 1;
    });

    const thisWeekTerms = reportData.terminations;
    const attritionRate = extendedData.totalEmployees > 0
        ? ((extendedData.attritionRecords.length / extendedData.totalEmployees) * 100).toFixed(1)
        : '0';

    return {
        title: 'Attrition Report',
        subtitle: 'Termination vs resignation breakdown, trends, and top reasons',
        generatedDate: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        sections: [
            {
                title: 'ALL-TIME ATTRITION BREAKDOWN',
                rows: [
                    { label: 'Total Attrition Records', value: `${extendedData.attritionRecords.length}` },
                    ...Object.entries(firedByReason)
                        .sort((a, b) => (b[1] as number) - (a[1] as number))
                        .map(([reason, count]) => ({ label: reason, value: `${count}` })),
                ],
            },
            {
                title: `THIS WEEK'S TERMINATIONS (${reportData.weekLabel})`,
                rows: thisWeekTerms.length > 0
                    ? thisWeekTerms.map((t: any) => ({
                        label: t['Agent Name'] || 'Unknown',
                        value: `${t['Fired/Quit'] || 'N/A'} - ${t['Reason for Termination'] || 'No reason'}`,
                    }))
                    : [{ label: 'No terminations', value: 'this week' }],
            },
            {
                title: 'ATTRITION RATE',
                rows: [
                    { label: 'Rate (All-Time)', value: `${attritionRate}%` },
                    { label: 'Voluntary (Quit)', value: `${extendedData.attritionRecords.filter((r: any) => r['Fired/Quit']?.toLowerCase() === 'quit').length}` },
                    { label: 'Involuntary (Fired)', value: `${extendedData.attritionRecords.filter((r: any) => r['Fired/Quit']?.toLowerCase()?.includes('fired')).length}` },
                    { label: 'Accounts Removed', value: `${extendedData.attritionRecords.filter((r: any) => r['Fired/Quit']?.toLowerCase()?.includes('account')).length}` },
                ],
            },
        ],
        footer: 'Auto-generated attrition report',
    };
}

export function buildAttendancePDFConfig(
    reportData: any,
    extendedData: any,
): PDFReportConfig {
    const totalAbsences = reportData.bookedOff.length + reportData.unbookedOff.length;

    const unbookedByAgent: Record<string, number> = {};
    reportData.unbookedOff.forEach((u: any) => {
        const name = u['Agent Name'] || 'Unknown';
        unbookedByAgent[name] = (unbookedByAgent[name] || 0) + 1;
    });
    const topUnplanned = Object.entries(unbookedByAgent)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    return {
        title: 'Attendance & Compliance Report',
        subtitle: 'No-show rates, unplanned absences, and booked PTO patterns',
        generatedDate: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        period: reportData.weekLabel,
        sections: [
            {
                title: 'SUMMARY',
                rows: [
                    { label: 'Booked Days Off', value: `${reportData.bookedOff.length}` },
                    { label: 'Unplanned Absences', value: `${reportData.unbookedOff.length}` },
                    { label: 'Total Absences', value: `${totalAbsences}` },
                    { label: 'Unplanned Rate', value: `${totalAbsences > 0 ? ((reportData.unbookedOff.length / totalAbsences) * 100).toFixed(1) : '0'}%` },
                ],
            },
            {
                title: 'TOP UNPLANNED ABSENCES',
                rows: topUnplanned.length > 0
                    ? topUnplanned.map(([name, count]) => ({ label: name, value: `${count} day(s)` }))
                    : [{ label: 'None', value: 'this week' }],
            },
            {
                title: 'WATCH LIST',
                rows: [
                    { label: 'Agents Currently on Watch', value: `${extendedData.watchList.length}` },
                    ...extendedData.watchList.slice(0, 8).map((w: any) => ({
                        label: w['Agent Name'] || w['Full Name'] || 'Unknown',
                        value: 'On Watch',
                    })),
                ],
            },
        ],
        footer: 'Auto-generated attendance report',
    };
}

export function buildWorkforcePDFConfig(
    reportData: any,
    extendedData: any,
): PDFReportConfig {
    const ftRatio = reportData.activeAgents.length > 0
        ? Math.round((reportData.fullTimeAgents.length / reportData.activeAgents.length) * 100)
        : 0;

    return {
        title: 'Workforce Snapshot',
        subtitle: 'Role distribution, full-time vs part-time, country breakdown',
        generatedDate: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        sections: [
            {
                title: 'HEADCOUNT',
                rows: [
                    { label: 'Total Employees', value: `${extendedData.totalEmployees}` },
                    { label: 'Active', value: `${extendedData.activeCount}` },
                    { label: 'Terminated', value: `${extendedData.terminatedCount}` },
                ],
            },
            {
                title: 'COUNTRY DISTRIBUTION',
                rows: extendedData.countryBreakdown.map((c: any) => ({
                    label: c.country,
                    value: `${c.count} (${((c.count / extendedData.totalEmployees) * 100).toFixed(1)}%)`,
                })),
            },
            {
                title: 'ROLE DISTRIBUTION',
                rows: extendedData.roleBreakdown.slice(0, 10).map((r: any) => ({
                    label: r.role,
                    value: `${r.count}`,
                })),
            },
            {
                title: 'EMPLOYMENT TYPE',
                rows: [
                    { label: 'Full-Time (>=30h/week)', value: `${reportData.fullTimeAgents.length}` },
                    { label: 'Part-Time (<30h/week)', value: `${reportData.partTimeAgents.length}` },
                    { label: 'Full-Time Ratio', value: `${ftRatio}%` },
                ],
            },
            {
                title: 'CAMPAIGN STAFFING',
                rows: reportData.campaigns.slice(0, 8).map((c: any) => ({
                    label: c.name,
                    value: `${c.count} agents`,
                })),
            },
        ],
        footer: 'Auto-generated workforce report',
    };
}

export function buildComprehensivePDFConfig(
    reportData: any,
    extendedData: any,
): PDFReportConfig {
    const netChange = reportData.hires.length - reportData.terminations.length;
    const totalAbsences = reportData.bookedOff.length + reportData.unbookedOff.length;
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

    const unbookedByAgent: Record<string, number> = {};
    reportData.unbookedOff.forEach((u: any) => {
        const name = u['Agent Name'] || 'Unknown';
        unbookedByAgent[name] = (unbookedByAgent[name] || 0) + 1;
    });
    const topUnplanned = Object.entries(unbookedByAgent)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    return {
        title: 'Comprehensive Workforce Report',
        subtitle: 'Complete overview of headcount, attrition, attendance, and workforce composition',
        generatedDate: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        period: reportData.weekLabel,
        sections: [
            {
                title: 'HEADCOUNT OVERVIEW',
                rows: [
                    { label: 'Total Workforce', value: `${extendedData.totalEmployees}` },
                    { label: 'Active Employees', value: `${extendedData.activeCount}` },
                    { label: 'Terminated', value: `${extendedData.terminatedCount}` },
                    ...extendedData.countryBreakdown.map((c: any) => ({
                        label: c.country, value: `${c.count}`
                    })),
                ],
            },
            {
                title: 'HIRING & TERMINATIONS',
                rows: [
                    { label: 'New Hires (Period)', value: `${reportData.hires.length}` },
                    { label: 'Terminations (Period)', value: `${reportData.terminations.length}` },
                    { label: 'Net Change', value: `${netChange >= 0 ? '+' : ''}${netChange}` },
                ],
            },
            {
                title: 'ATTRITION',
                rows: [
                    { label: 'All-Time Attrition Records', value: `${extendedData.attritionRecords.length}` },
                    { label: 'Attrition Rate', value: `${attritionRate}%` },
                    ...Object.entries(firedByReason)
                        .sort((a, b) => (b[1] as number) - (a[1] as number))
                        .slice(0, 5)
                        .map(([reason, count]) => ({ label: reason, value: `${count}` })),
                ],
            },
            {
                title: 'ATTENDANCE',
                rows: [
                    { label: 'Booked Days Off (Period)', value: `${reportData.bookedOff.length}` },
                    { label: 'Unplanned Absences (Period)', value: `${reportData.unbookedOff.length}` },
                    { label: 'Total Absences', value: `${totalAbsences}` },
                    { label: 'Unplanned Rate', value: `${totalAbsences > 0 ? ((reportData.unbookedOff.length / totalAbsences) * 100).toFixed(1) : '0'}%` },
                    { label: 'Agents on Watch List', value: `${extendedData.watchList.length}` },
                ],
            },
            {
                title: 'TOP UNPLANNED ABSENCES',
                rows: topUnplanned.length > 0
                    ? topUnplanned.map(([name, count]) => ({ label: name, value: `${count} day(s)` }))
                    : [{ label: 'None', value: 'in period' }],
            },
            {
                title: 'WORKFORCE COMPOSITION',
                rows: [
                    { label: 'Full-Time (>=30h) - Commission Eligible', value: `${reportData.fullTimeAgents.length}` },
                    { label: 'Part-Time (<30h)', value: `${reportData.partTimeAgents.length}` },
                    { label: 'Full-Time Ratio', value: `${ftRatio}%` },
                    { label: 'Active Agents on Schedule', value: `${reportData.activeAgents.length}` },
                ],
            },
            {
                title: 'ROLE DISTRIBUTION',
                rows: extendedData.roleBreakdown.slice(0, 8).map((r: any) => ({
                    label: r.role,
                    value: `${r.count}`,
                })),
            },
            {
                title: 'CAMPAIGN STAFFING',
                rows: reportData.campaigns.slice(0, 6).map((c: any) => ({
                    label: c.name,
                    value: `${c.count} agents`,
                })),
            },
        ],
        footer: 'Auto-generated comprehensive report',
    };
}

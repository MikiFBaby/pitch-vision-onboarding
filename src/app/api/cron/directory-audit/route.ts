import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const maxDuration = 120;

const ALERT_RECIPIENTS = ['miki@pitchperfectsolutions.net'];

// Paginated fetch helper (avoids Supabase 1000-row cap)
async function fetchAll<T>(table: string, select: string, filters?: Record<string, string>): Promise<T[]> {
    const all: T[] = [];
    const pageSize = 1000;
    let offset = 0;
    while (true) {
        let q = supabaseAdmin.from(table).select(select).range(offset, offset + pageSize - 1);
        if (filters) {
            for (const [k, v] of Object.entries(filters)) {
                q = q.eq(k, v);
            }
        }
        const { data, error } = await q;
        if (error) { console.error(`[Audit] ${table} fetch error:`, error.message); break; }
        if (!data || data.length === 0) break;
        all.push(...(data as T[]));
        if (data.length < pageSize) break;
        offset += pageSize;
    }
    return all;
}

/**
 * Weekly directory health audit cron.
 * Comprehensive cross-reference: DialedIn, HR Sheets, Payroll, Pitch Health, data completeness, stale agents.
 * Schedule: Once weekly on Monday at 2 PM UTC (9 AM ET)
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Fetch all employees
        const { data: employees } = await supabaseAdmin
            .from('employee_directory')
            .select('id, first_name, last_name, email, slack_user_id, employee_status, role, country, hourly_wage, current_campaigns, dialedin_name, phone, hired_at');

        const all = employees || [];
        const active = all.filter(e => e.employee_status === 'Active');
        const agents = active.filter(e => e.role === 'Agent');

        const sections: AuditSection[] = [];

        // ═══════════════════════════════════════════════════════════
        // SECTION A: DialedIn Cross-Reference
        // ═══════════════════════════════════════════════════════════
        const dialedInSection = await auditDialedIn(agents);
        sections.push(dialedInSection);

        // ═══════════════════════════════════════════════════════════
        // SECTION B: HR Sheets Cross-Reference
        // ═══════════════════════════════════════════════════════════
        const hrSection = await auditHRSheets(active);
        sections.push(hrSection);

        // ═══════════════════════════════════════════════════════════
        // SECTION C: Payroll Cross-Reference
        // ═══════════════════════════════════════════════════════════
        const payrollSection = await auditPayroll(agents);
        sections.push(payrollSection);

        // ═══════════════════════════════════════════════════════════
        // SECTION D: Pitch Health Boundary Check
        // ═══════════════════════════════════════════════════════════
        const phSection = await auditPitchHealth();
        sections.push(phSection);

        // ═══════════════════════════════════════════════════════════
        // SECTION E: Data Completeness
        // ═══════════════════════════════════════════════════════════
        const completenessSection = auditCompleteness(active, agents);
        sections.push(completenessSection);

        // ═══════════════════════════════════════════════════════════
        // SECTION F: Stale Agent Detection
        // ═══════════════════════════════════════════════════════════
        const staleSection = await auditStaleAgents(agents);
        sections.push(staleSection);

        // Compute health score (0-100)
        const totalIssues = sections.reduce((sum, s) => sum + s.issueCount, 0);
        const healthScore = Math.max(0, Math.round(100 - (totalIssues / Math.max(agents.length, 1)) * 100));

        const result = {
            totalActive: active.length,
            totalAgents: agents.length,
            healthScore,
            totalIssues,
            sections: sections.map(s => ({
                name: s.name,
                issueCount: s.issueCount,
                details: s.details,
            })),
        };

        // Send email report
        await sendAuditEmail(active.length, agents.length, healthScore, sections);

        console.log('[DirectoryAudit] Complete:', JSON.stringify({
            totalActive: active.length, totalAgents: agents.length, healthScore, totalIssues,
            sectionCounts: sections.map(s => `${s.name}: ${s.issueCount}`),
        }));

        return NextResponse.json(result);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[DirectoryAudit] Error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// ── Types ─────────────────────────────────────────────────
interface AuditSection {
    name: string;
    issueCount: number;
    issues: string[];       // HTML issue strings
    details: Record<string, number | string | string[]>;
}

type Employee = {
    id: string;
    first_name: string;
    last_name: string;
    email?: string;
    slack_user_id?: string;
    employee_status: string;
    role?: string;
    country?: string;
    hourly_wage?: number;
    current_campaigns?: string[];
    dialedin_name?: string;
    phone?: string;
    hired_at?: string;
};

// ── Section A: DialedIn Cross-Reference ───────────────────
async function auditDialedIn(agents: Employee[]): Promise<AuditSection> {
    const issues: string[] = [];
    const details: Record<string, number | string | string[]> = {};

    // Fetch last 14 days of agent performance (paginated)
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const perfData = await fetchAll<{ agent_name: string; employee_id: string | null; team: string | null; report_date: string }>(
        'dialedin_agent_performance',
        'agent_name, employee_id, team, report_date',
    );
    const recentPerf = perfData.filter(p => p.report_date >= fourteenDaysAgo);

    // Filter out Pitch Health
    const ourPerf = recentPerf.filter(p => !p.team || !p.team.toLowerCase().includes('pitch health'));

    // Unique agent names in DialedIn
    const dialedInNames = new Set(ourPerf.map(p => p.agent_name).filter(Boolean));

    // Agents without employee_id
    const nullEmployeeId = ourPerf.filter(p => !p.employee_id);
    const nullIdNames = new Set(nullEmployeeId.map(p => p.agent_name));
    details.dialedInAgents = dialedInNames.size;
    details.nullEmployeeIdCount = nullIdNames.size;

    if (nullIdNames.size > 0) {
        const names = Array.from(nullIdNames).sort().slice(0, 15);
        issues.push(`<b>${nullIdNames.size} DialedIn agents</b> with NULL employee_id: ${names.join(', ')}${nullIdNames.size > 15 ? ` (+${nullIdNames.size - 15} more)` : ''}`);
    }

    // Active agents missing from DialedIn
    const agentNameSet = new Set(agents.map(a => `${a.first_name} ${a.last_name}`.toLowerCase().trim()));
    const dialedInLower = new Set(Array.from(dialedInNames).map(n => n.toLowerCase().trim()));
    // Also check dialedin_name
    const missingFromDialedIn = agents.filter(a => {
        const full = `${a.first_name} ${a.last_name}`.toLowerCase().trim();
        const dn = a.dialedin_name?.toLowerCase().trim();
        return !dialedInLower.has(full) && (!dn || !dialedInLower.has(dn));
    });

    // Exclude agents hired in last 14 days (too new)
    const recentHires = missingFromDialedIn.filter(a => {
        if (!a.hired_at) return false;
        return a.hired_at >= fourteenDaysAgo;
    });
    const trulyMissing = missingFromDialedIn.filter(a => !recentHires.includes(a));

    details.missingFromDialedIn = trulyMissing.length;
    details.recentHiresExcluded = recentHires.length;

    if (trulyMissing.length > 0) {
        const names = trulyMissing.slice(0, 15).map(a => `${a.first_name} ${a.last_name}`);
        issues.push(`<b>${trulyMissing.length} Active Agents</b> not in DialedIn (last 14 days): ${names.join(', ')}${trulyMissing.length > 15 ? ` (+${trulyMissing.length - 15} more)` : ''}`);
    }

    // Agents missing dialedin_name
    const noDialedInName = agents.filter(a => !a.dialedin_name);
    details.missingDialedInName = noDialedInName.length;
    if (noDialedInName.length > 0) {
        issues.push(`<b>${noDialedInName.length} agents</b> missing dialedin_name`);
    }

    return { name: 'DialedIn Cross-Reference', issueCount: issues.length, issues, details };
}

// ── Section B: HR Sheets Cross-Reference ──────────────────
async function auditHRSheets(active: Employee[]): Promise<AuditSection> {
    const issues: string[] = [];
    const details: Record<string, number | string | string[]> = {};

    // Check HR Hired — recent entries not in directory
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const { data: hiredData } = await supabaseAdmin
        .from('HR Hired')
        .select('Agent Name, Hire Date')
        .gte('Hire Date', thirtyDaysAgo);

    const hiredNames = (hiredData || []).map((h: Record<string, string>) => h['Agent Name']).filter(Boolean);
    const activeNames = new Set(active.map(a => `${a.first_name} ${a.last_name}`.toLowerCase().trim()));

    const hiredNotInDirectory = hiredNames.filter((n: string) => !activeNames.has(n.toLowerCase().trim()));
    details.recentHires = hiredNames.length;
    details.hiredNotInDirectory = hiredNotInDirectory.length;

    if (hiredNotInDirectory.length > 0) {
        issues.push(`<b>${hiredNotInDirectory.length} HR Hired entries</b> (last 30 days) not in directory: ${hiredNotInDirectory.slice(0, 10).join(', ')}${hiredNotInDirectory.length > 10 ? ` (+${hiredNotInDirectory.length - 10} more)` : ''}`);
    }

    // Check HR Fired — entries where directory still says Active
    const { data: firedData } = await supabaseAdmin
        .from('HR Fired')
        .select('Agent Name, Termination Date')
        .gte('Termination Date', thirtyDaysAgo);

    const firedNames = (firedData || []).map((f: Record<string, string>) => f['Agent Name']).filter(Boolean);
    const stillActive = firedNames.filter((n: string) => activeNames.has(n.toLowerCase().trim()));
    details.recentTerminations = firedNames.length;
    details.terminatedButStillActive = stillActive.length;

    if (stillActive.length > 0) {
        issues.push(`<b>${stillActive.length} HR Fired entries</b> still Active in directory: ${stillActive.join(', ')}`);
    }

    return { name: 'HR Sheets Cross-Reference', issueCount: issues.length, issues, details };
}

// ── Section C: Payroll Cross-Reference ────────────────────
async function auditPayroll(agents: Employee[]): Promise<AuditSection> {
    const issues: string[] = [];
    const details: Record<string, number | string | string[]> = {};

    // Get latest payroll period
    const { data: latestPeriod } = await supabaseAdmin
        .from('payroll_periods')
        .select('period_end')
        .order('period_end', { ascending: false })
        .limit(1);

    if (!latestPeriod || latestPeriod.length === 0) {
        details.status = 'No payroll data found';
        return { name: 'Payroll Cross-Reference', issueCount: 0, issues, details };
    }

    const latestEnd = latestPeriod[0].period_end;
    details.latestPeriodEnd = latestEnd;

    // Fetch latest period's payroll
    const { data: payroll } = await supabaseAdmin
        .from('payroll_periods')
        .select('agent_name, hourly_rate, country, employee_id')
        .eq('period_end', latestEnd);

    const payrollRecords = payroll || [];
    details.payrollRecordCount = payrollRecords.length;

    // Wage discrepancies
    const agentById = new Map(agents.map(a => [a.id, a]));
    const discrepancies: string[] = [];
    for (const pr of payrollRecords) {
        if (!pr.employee_id || !pr.hourly_rate) continue;
        const emp = agentById.get(pr.employee_id);
        if (!emp || !emp.hourly_wage) continue;
        const diff = Math.abs(Number(emp.hourly_wage) - Number(pr.hourly_rate));
        if (diff > 0.50) {
            discrepancies.push(`${emp.first_name} ${emp.last_name}: DB $${emp.hourly_wage} vs Payroll $${pr.hourly_rate}`);
        }
    }
    details.wageDiscrepancies = discrepancies.length;
    if (discrepancies.length > 0) {
        issues.push(`<b>${discrepancies.length} wage discrepancies</b> (> $0.50): ${discrepancies.slice(0, 5).join('; ')}${discrepancies.length > 5 ? ` (+${discrepancies.length - 5} more)` : ''}`);
    }

    // Suspicious wages
    const suspicious = agents.filter(a => {
        const w = Number(a.hourly_wage);
        return w > 0 && (w < 12 || w > 35);
    });
    details.suspiciousWages = suspicious.length;
    if (suspicious.length > 0) {
        issues.push(`<b>${suspicious.length} agents</b> with suspicious wages (< $12 or > $35): ${suspicious.slice(0, 5).map(a => `${a.first_name} ${a.last_name} ($${a.hourly_wage})`).join(', ')}`);
    }

    return { name: 'Payroll Cross-Reference', issueCount: issues.length, issues, details };
}

// ── Section D: Pitch Health Boundary Check ────────────────
async function auditPitchHealth(): Promise<AuditSection> {
    const issues: string[] = [];
    const details: Record<string, number | string | string[]> = {};

    // Load blocklist
    let blocklist = new Set<string>();
    try {
        const blocklistPath = path.join(process.cwd(), 'scripts', 'pitch-health-blocklist.json');
        const raw = fs.readFileSync(blocklistPath, 'utf-8');
        const names: string[] = JSON.parse(raw);
        blocklist = new Set(names.map(n => n.toLowerCase().trim()));
    } catch {
        details.blocklistError = 'Could not load blocklist';
    }
    details.blocklistSize = blocklist.size;

    // Fetch recent DialedIn rows with Pitch Health team
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const { data: phPerf } = await supabaseAdmin
        .from('dialedin_agent_performance')
        .select('agent_name, team, report_date')
        .ilike('team', '%pitch health%')
        .gte('report_date', fourteenDaysAgo);

    const phNames = new Set((phPerf || []).map(p => p.agent_name).filter(Boolean));
    details.pitchHealthAgentsInDialedIn = phNames.size;

    // Names on PH team but NOT on blocklist = potential transfers OUT of PH → to us
    const notOnBlocklist = Array.from(phNames).filter(n => !blocklist.has(n.toLowerCase().trim()));
    details.phNotOnBlocklist = notOnBlocklist.length;
    if (notOnBlocklist.length > 0) {
        issues.push(`<b>${notOnBlocklist.length} Pitch Health agents</b> NOT on blocklist (potential transfers?): ${notOnBlocklist.join(', ')}`);
    }

    // Check if any blocklisted names appear in our employee_directory as Active
    const { data: blocklistedInDir } = await supabaseAdmin
        .from('employee_directory')
        .select('first_name, last_name, employee_status')
        .eq('employee_status', 'Active');

    const activeOnBlocklist = (blocklistedInDir || []).filter(e => {
        const full = `${e.first_name} ${e.last_name}`.toLowerCase().trim();
        return blocklist.has(full);
    });
    details.activeOnBlocklist = activeOnBlocklist.length;
    if (activeOnBlocklist.length > 0) {
        const names = activeOnBlocklist.map(e => `${e.first_name} ${e.last_name}`);
        issues.push(`<b>${activeOnBlocklist.length} blocklisted names</b> are Active in our directory: ${names.join(', ')}`);
    }

    return { name: 'Pitch Health Boundary', issueCount: issues.length, issues, details };
}

// ── Section E: Data Completeness ──────────────────────────
function auditCompleteness(active: Employee[], agents: Employee[]): AuditSection {
    const issues: string[] = [];
    const details: Record<string, number | string | string[]> = {};

    const missingWage = agents.filter(e => !e.hourly_wage);
    const missingCountry = active.filter(e => !e.country);
    const missingEmail = active.filter(e => !e.email);
    const missingSlack = active.filter(e => !e.slack_user_id);
    const missingPhone = active.filter(e => !e.phone);
    const noCampaign = agents.filter(e => !e.current_campaigns || e.current_campaigns.length === 0);
    const missingDialedInName = agents.filter(e => !e.dialedin_name);

    // Lowercase names
    const lowercaseNames = active.filter(e => {
        const first = e.first_name || '';
        const last = e.last_name || '';
        return (first.length > 1 && first === first.toLowerCase()) ||
               (last.length > 1 && last === last.toLowerCase());
    });

    // Duplicate emails
    const emailCounts = new Map<string, string[]>();
    for (const e of active) {
        if (!e.email) continue;
        const key = e.email.toLowerCase();
        if (!emailCounts.has(key)) emailCounts.set(key, []);
        emailCounts.get(key)!.push(`${e.first_name} ${e.last_name}`);
    }
    const duplicateEmails = Array.from(emailCounts.entries()).filter(([, names]) => names.length > 1);

    // Duplicate slack_user_id
    const slackCounts = new Map<string, string[]>();
    for (const e of active) {
        if (!e.slack_user_id) continue;
        if (!slackCounts.has(e.slack_user_id)) slackCounts.set(e.slack_user_id, []);
        slackCounts.get(e.slack_user_id)!.push(`${e.first_name} ${e.last_name}`);
    }
    const duplicateSlack = Array.from(slackCounts.entries()).filter(([, names]) => names.length > 1);

    // Duplicate full names
    const nameCounts = new Map<string, number>();
    for (const e of active) {
        const full = `${e.first_name} ${e.last_name}`.toLowerCase().trim();
        nameCounts.set(full, (nameCounts.get(full) || 0) + 1);
    }
    const duplicateNames = Array.from(nameCounts.entries()).filter(([, count]) => count > 1);

    details.missingWage = missingWage.length;
    details.missingCountry = missingCountry.length;
    details.missingEmail = missingEmail.length;
    details.missingSlack = missingSlack.length;
    details.missingPhone = missingPhone.length;
    details.noCampaign = noCampaign.length;
    details.missingDialedInName = missingDialedInName.length;
    details.lowercaseNames = lowercaseNames.length;
    details.duplicateEmails = duplicateEmails.length;
    details.duplicateSlack = duplicateSlack.length;
    details.duplicateNames = duplicateNames.length;

    const fmt = (items: Employee[], limit = 10) => {
        const names = items.slice(0, limit).map(e => `${e.first_name} ${e.last_name}`);
        const more = items.length > limit ? ` (+${items.length - limit} more)` : '';
        return `${names.join(', ')}${more}`;
    };

    if (missingWage.length > 0) issues.push(`<b>${missingWage.length} agents</b> missing hourly wage: ${fmt(missingWage)}`);
    if (missingCountry.length > 0) issues.push(`<b>${missingCountry.length} employees</b> missing country: ${fmt(missingCountry)}`);
    if (missingEmail.length > 0) issues.push(`<b>${missingEmail.length} employees</b> missing email: ${fmt(missingEmail)}`);
    if (missingSlack.length > 0) issues.push(`<b>${missingSlack.length} employees</b> missing Slack ID: ${fmt(missingSlack)}`);
    if (missingPhone.length > 0) issues.push(`<b>${missingPhone.length} employees</b> missing phone: ${fmt(missingPhone)}`);
    if (noCampaign.length > 0) issues.push(`<b>${noCampaign.length} agents</b> not in any campaign channel: ${fmt(noCampaign)}`);
    if (missingDialedInName.length > 0) issues.push(`<b>${missingDialedInName.length} agents</b> missing dialedin_name: ${fmt(missingDialedInName)}`);
    if (lowercaseNames.length > 0) issues.push(`<b>${lowercaseNames.length} employees</b> with lowercase names: ${fmt(lowercaseNames)}`);
    if (duplicateEmails.length > 0) {
        issues.push(`<b>${duplicateEmails.length} duplicate emails</b>: ${duplicateEmails.map(([email, names]) => `${email} (${names.join(', ')})`).join('; ')}`);
    }
    if (duplicateSlack.length > 0) {
        issues.push(`<b>${duplicateSlack.length} duplicate Slack IDs</b>: ${duplicateSlack.map(([sid, names]) => `${sid} (${names.join(', ')})`).join('; ')}`);
    }
    if (duplicateNames.length > 0) {
        issues.push(`<b>${duplicateNames.length} duplicate full names</b>: ${duplicateNames.map(([name, count]) => `${name} (×${count})`).join(', ')}`);
    }

    return { name: 'Data Completeness', issueCount: issues.length, issues, details };
}

// ── Section F: Stale Agent Detection ──────────────────────
async function auditStaleAgents(agents: Employee[]): Promise<AuditSection> {
    const issues: string[] = [];
    const details: Record<string, number | string | string[]> = {};

    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);

    // Get latest appearance per agent in DialedIn
    const { data: latestAppearances } = await supabaseAdmin
        .from('dialedin_agent_performance')
        .select('employee_id, report_date')
        .not('employee_id', 'is', null)
        .order('report_date', { ascending: false });

    // Build map of employee_id → latest report_date
    const latestByEmp = new Map<string, string>();
    for (const row of (latestAppearances || [])) {
        if (!latestByEmp.has(row.employee_id)) {
            latestByEmp.set(row.employee_id, row.report_date);
        }
    }

    // Agents whose last appearance was >14 days ago (possible missed termination)
    const staleAgents = agents.filter(a => {
        // Exclude agents hired in last 14 days
        if (a.hired_at && a.hired_at >= fourteenDaysAgo) return false;
        const lastSeen = latestByEmp.get(a.id);
        if (!lastSeen) return false; // Never appeared in DialedIn — covered by Section A
        return lastSeen < fourteenDaysAgo;
    });

    details.staleAgentCount = staleAgents.length;

    if (staleAgents.length > 0) {
        const staleInfo = staleAgents.slice(0, 15).map(a => {
            const lastSeen = latestByEmp.get(a.id) || 'unknown';
            return `${a.first_name} ${a.last_name} (last: ${lastSeen})`;
        });
        issues.push(`<b>${staleAgents.length} Active Agents</b> last seen in DialedIn >14 days ago (possible missed termination): ${staleInfo.join(', ')}${staleAgents.length > 15 ? ` (+${staleAgents.length - 15} more)` : ''}`);
    }

    return { name: 'Stale Agent Detection', issueCount: issues.length, issues, details };
}

// ── Email ─────────────────────────────────────────────────
async function sendAuditEmail(totalActive: number, totalAgents: number, healthScore: number, sections: AuditSection[]) {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
        console.log('[DirectoryAudit] SMTP not configured, skipping email');
        return;
    }

    const port = Number(process.env.SMTP_PORT) || 465;
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        tls: { rejectUnauthorized: false },
    });

    const totalIssues = sections.reduce((sum, s) => sum + s.issueCount, 0);
    const scoreColor = healthScore >= 80 ? '#16a34a' : healthScore >= 60 ? '#ca8a04' : '#dc2626';

    const sectionHtml = sections.map(s => {
        if (s.issues.length === 0) {
            return `<div style="margin-bottom:16px;">
                <h3 style="color:#16a34a;margin-bottom:4px;">✓ ${s.name}</h3>
                <p style="color:#6b7280;">No issues found</p>
            </div>`;
        }
        return `<div style="margin-bottom:16px;">
            <h3 style="color:#dc2626;margin-bottom:4px;">${s.name} (${s.issueCount} issue${s.issueCount !== 1 ? 's' : ''})</h3>
            <ul style="margin:0;padding-left:20px;">${s.issues.map(i => `<li style="margin-bottom:6px;">${i}</li>`).join('')}</ul>
        </div>`;
    }).join('');

    const html = `
        <div style="font-family:sans-serif;max-width:700px;">
            <h2>Employee Directory Audit Report</h2>
            <div style="display:flex;gap:24px;margin-bottom:16px;">
                <div><strong>${totalActive}</strong> active employees</div>
                <div><strong>${totalAgents}</strong> agents</div>
                <div>Health Score: <strong style="color:${scoreColor};font-size:18px;">${healthScore}/100</strong></div>
                <div><strong>${totalIssues}</strong> total issues</div>
            </div>
            <hr style="border:1px solid #e5e7eb;margin:16px 0;" />
            ${sectionHtml}
            <p style="color:#6b7280;font-size:12px;margin-top:24px;">Sent by PitchVision Directory Audit — ${new Date().toISOString().slice(0, 10)}</p>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: `"PitchVision Alerts" <${process.env.SMTP_USER}>`,
            to: ALERT_RECIPIENTS.join(', '),
            subject: `[Directory Audit] Score ${healthScore}/100 — ${totalIssues} issues — ${totalActive} employees`,
            html,
        });
        console.log('[DirectoryAudit] Audit email sent');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[DirectoryAudit] Failed to send email:', message);
    }
}

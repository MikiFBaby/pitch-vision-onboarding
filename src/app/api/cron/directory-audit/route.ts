import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';
export const maxDuration = 120;

const ALERT_RECIPIENTS = ['miki@pitchperfectsolutions.net'];

/**
 * Weekly directory health audit cron.
 * Checks for data gaps and emails a summary report.
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
            .select('id, first_name, last_name, email, slack_user_id, employee_status, role, country, hourly_wage, current_campaigns');

        const all = employees || [];
        const active = all.filter(e => e.employee_status === 'Active');
        const agents = active.filter(e => e.role === 'Agent');

        // --- Data gap checks ---
        const missingWage = agents.filter(e => !e.hourly_wage);
        const missingCountry = active.filter(e => !e.country);
        const missingEmail = active.filter(e => !e.email);
        const missingSlack = active.filter(e => !e.slack_user_id);
        const noCampaign = agents.filter(e => !e.current_campaigns || e.current_campaigns.length === 0);

        // Name formatting: check for all-lowercase names
        const lowercaseNames = active.filter(e => {
            const first = e.first_name || '';
            const last = e.last_name || '';
            return (first.length > 1 && first === first.toLowerCase()) ||
                   (last.length > 1 && last === last.toLowerCase());
        });

        // Duplicate detection: same email or very similar names
        const emailCounts = new Map<string, string[]>();
        for (const e of active) {
            if (!e.email) continue;
            const key = e.email.toLowerCase();
            if (!emailCounts.has(key)) emailCounts.set(key, []);
            emailCounts.get(key)!.push(`${e.first_name} ${e.last_name}`);
        }
        const duplicateEmails = Array.from(emailCounts.entries()).filter(([, names]) => names.length > 1);

        // Build summary
        const issues: string[] = [];
        const totalActive = active.length;
        const totalAgents = agents.length;

        if (missingWage.length > 0) {
            issues.push(`<b>${missingWage.length} agents</b> missing hourly wage: ${missingWage.slice(0, 10).map(e => `${e.first_name} ${e.last_name}`).join(', ')}${missingWage.length > 10 ? ` (+${missingWage.length - 10} more)` : ''}`);
        }
        if (missingCountry.length > 0) {
            issues.push(`<b>${missingCountry.length} employees</b> missing country: ${missingCountry.slice(0, 10).map(e => `${e.first_name} ${e.last_name}`).join(', ')}${missingCountry.length > 10 ? ` (+${missingCountry.length - 10} more)` : ''}`);
        }
        if (missingEmail.length > 0) {
            issues.push(`<b>${missingEmail.length} employees</b> missing email: ${missingEmail.slice(0, 10).map(e => `${e.first_name} ${e.last_name}`).join(', ')}${missingEmail.length > 10 ? ` (+${missingEmail.length - 10} more)` : ''}`);
        }
        if (missingSlack.length > 0) {
            issues.push(`<b>${missingSlack.length} employees</b> missing Slack ID: ${missingSlack.slice(0, 10).map(e => `${e.first_name} ${e.last_name}`).join(', ')}${missingSlack.length > 10 ? ` (+${missingSlack.length - 10} more)` : ''}`);
        }
        if (noCampaign.length > 0) {
            issues.push(`<b>${noCampaign.length} agents</b> not in any campaign channel: ${noCampaign.slice(0, 10).map(e => `${e.first_name} ${e.last_name}`).join(', ')}${noCampaign.length > 10 ? ` (+${noCampaign.length - 10} more)` : ''}`);
        }
        if (lowercaseNames.length > 0) {
            issues.push(`<b>${lowercaseNames.length} employees</b> with lowercase names: ${lowercaseNames.slice(0, 10).map(e => `${e.first_name} ${e.last_name}`).join(', ')}${lowercaseNames.length > 10 ? ` (+${lowercaseNames.length - 10} more)` : ''}`);
        }
        if (duplicateEmails.length > 0) {
            issues.push(`<b>${duplicateEmails.length} duplicate emails</b>: ${duplicateEmails.map(([email, names]) => `${email} (${names.join(', ')})`).join('; ')}`);
        }

        const result = {
            totalActive,
            totalAgents,
            issues: issues.length,
            missingWage: missingWage.length,
            missingCountry: missingCountry.length,
            missingEmail: missingEmail.length,
            missingSlack: missingSlack.length,
            noCampaign: noCampaign.length,
            lowercaseNames: lowercaseNames.length,
            duplicateEmails: duplicateEmails.length,
        };

        // Send email if there are any issues
        if (issues.length > 0) {
            await sendAuditEmail(totalActive, totalAgents, issues);
        }

        console.log('[DirectoryAudit] Complete:', JSON.stringify(result));
        return NextResponse.json(result);
    } catch (err: any) {
        console.error('[DirectoryAudit] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

async function sendAuditEmail(totalActive: number, totalAgents: number, issues: string[]) {
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

    const issueList = issues.map(i => `<li style="margin-bottom:8px;">${i}</li>`).join('');

    const html = `
        <div style="font-family:sans-serif;max-width:600px;">
            <h2>Weekly Employee Directory Audit</h2>
            <p><strong>${totalActive}</strong> active employees (<strong>${totalAgents}</strong> agents)</p>
            <h3 style="color:#dc2626;">${issues.length} Issue${issues.length !== 1 ? 's' : ''} Found</h3>
            <ul>${issueList}</ul>
            <p style="color:#6b7280;font-size:12px;margin-top:24px;">Sent by PitchVision Directory Audit</p>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: `"PitchVision Alerts" <${process.env.SMTP_USER}>`,
            to: ALERT_RECIPIENTS.join(', '),
            subject: `[Directory Audit] ${issues.length} issue${issues.length !== 1 ? 's' : ''} found — ${totalActive} active employees`,
            html,
        });
        console.log('[DirectoryAudit] Audit email sent');
    } catch (err: any) {
        console.error('[DirectoryAudit] Failed to send email:', err.message);
    }
}

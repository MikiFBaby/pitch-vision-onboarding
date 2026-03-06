import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Resend } from 'resend';
import { mapDirectoryRoleToAppRole, APP_ROLES, ROLE_LABELS, type AppRole } from '@/lib/role-mapping';

// Allow up to 120s for bulk sends (Vercel Pro supports up to 300s)
export const maxDuration = 120;

const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder');
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.pitchvision.io';
const MAX_SENDS_PER_INVOCATION = 90; // Safe limit within timeout window (90 × 0.6s = 54s)

// GET — Return invite stats (all roles, with per-role breakdown)
export async function GET(request: NextRequest) {
    try {
        const roleFilter = request.nextUrl.searchParams.get('role'); // optional filter

        // Fetch all active employees with invite status
        const query = supabaseAdmin
            .from('employee_directory')
            .select('id, role, email, invite_status, invite_sent_at')
            .eq('employee_status', 'Active');

        const { data: employees, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const all = employees || [];

        // Build per-role stats
        const byRole: Record<string, { total: number; sent: number; failed: number; pending: number; missingEmail: number }> = {};
        for (const role of APP_ROLES) {
            byRole[role] = { total: 0, sent: 0, failed: 0, pending: 0, missingEmail: 0 };
        }

        for (const emp of all) {
            const appRole = mapDirectoryRoleToAppRole(emp.role);
            byRole[appRole].total++;
            if (!emp.email) {
                byRole[appRole].missingEmail++;
            } else if (emp.invite_status === 'sent') {
                byRole[appRole].sent++;
            } else if (emp.invite_status === 'failed') {
                byRole[appRole].failed++;
            } else {
                byRole[appRole].pending++;
            }
        }

        // Aggregate totals (filtered or global)
        const roles = roleFilter && APP_ROLES.includes(roleFilter as AppRole) ? [roleFilter as AppRole] : [...APP_ROLES];
        const totals = roles.reduce(
            (acc, r) => ({
                total: acc.total + byRole[r].total,
                sent: acc.sent + byRole[r].sent,
                failed: acc.failed + byRole[r].failed,
                pending: acc.pending + byRole[r].pending,
                missingEmail: acc.missingEmail + byRole[r].missingEmail,
            }),
            { total: 0, sent: 0, failed: 0, pending: 0, missingEmail: 0 }
        );

        return NextResponse.json({ ...totals, byRole });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// POST — Send bulk invites, test email, preview, or audit
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action } = body;

        if (action === 'preview') {
            const role: AppRole = body.role || 'agent';
            return NextResponse.json({
                html: buildEmailHtml('{{first_name}}', '{{email}}', role),
                subject: getEmailContent(role).subject,
            });
        }

        if (action === 'test') {
            const { email, firstName, role: testRole } = body;
            if (!email) {
                return NextResponse.json({ error: 'Missing email for test' }, { status: 400 });
            }
            const appRole: AppRole = testRole || 'agent';
            const content = getEmailContent(appRole);

            const { data, error } = await resend.emails.send({
                from: process.env.RESEND_FROM_EMAIL || 'Pitch Vision <onboarding@pitchvision.io>',
                to: email,
                subject: content.subject,
                html: buildEmailHtml(firstName || 'Team Member', email, appRole),
            });

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, messageId: data?.id });
        }

        if (action === 'audit') {
            // Return employees with missing or invalid emails
            const { data: employees, error } = await supabaseAdmin
                .from('employee_directory')
                .select('id, first_name, last_name, email, role')
                .eq('employee_status', 'Active');

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });

            const missing: any[] = [];
            const invalid: any[] = [];
            const valid: any[] = [];

            for (const emp of employees || []) {
                if (!emp.email) {
                    missing.push({ id: emp.id, name: `${emp.first_name} ${emp.last_name}`, role: emp.role });
                } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emp.email)) {
                    invalid.push({ id: emp.id, name: `${emp.first_name} ${emp.last_name}`, role: emp.role, email: emp.email });
                } else {
                    valid.push(emp);
                }
            }

            return NextResponse.json({ valid: valid.length, missing, invalid });
        }

        if (action === 'send') {
            const targetRole: AppRole | undefined = body.role; // optional: send to specific role only

            // Fetch active employees who haven't been invited yet
            let query = supabaseAdmin
                .from('employee_directory')
                .select('id, first_name, last_name, email, role')
                .eq('employee_status', 'Active')
                .is('invite_sent_at', null)
                .not('email', 'is', null);

            // If targeting a specific app role, we need to filter by directory roles that map to it
            // Since the mapping isn't 1:1 by column value, fetch all and filter in code
            const { data: employees, error: fetchError } = await query;

            if (fetchError) {
                return NextResponse.json({ error: fetchError.message }, { status: 500 });
            }

            // Filter to target role if specified
            let targets = employees || [];
            if (targetRole && APP_ROLES.includes(targetRole)) {
                targets = targets.filter((emp) => mapDirectoryRoleToAppRole(emp.role) === targetRole);
            }

            if (targets.length === 0) {
                return NextResponse.json({ success: true, sent: 0, remaining: 0, message: 'No pending invites to send.' });
            }

            // Cap per invocation to stay within Vercel timeout; call again for remaining
            const totalPending = targets.length;
            if (targets.length > MAX_SENDS_PER_INVOCATION) {
                targets = targets.slice(0, MAX_SENDS_PER_INVOCATION);
            }

            let sentCount = 0;
            let failedCount = 0;

            // Send emails sequentially with delay to respect Resend's 2 req/sec rate limit
            for (let i = 0; i < targets.length; i++) {
                const emp = targets[i];
                try {
                    const appRole = mapDirectoryRoleToAppRole(emp.role);
                    const content = getEmailContent(appRole);

                    const { error: sendError } = await resend.emails.send({
                        from: process.env.RESEND_FROM_EMAIL || 'Pitch Vision <onboarding@pitchvision.io>',
                        to: emp.email,
                        subject: content.subject,
                        html: buildEmailHtml(emp.first_name || 'Team Member', emp.email, appRole),
                    });

                    const status = sendError ? 'failed' : 'sent';
                    if (status === 'sent') sentCount++;
                    else failedCount++;

                    await supabaseAdmin
                        .from('employee_directory')
                        .update({
                            invite_sent_at: new Date().toISOString(),
                            invite_status: status,
                        })
                        .eq('id', emp.id);
                } catch {
                    failedCount++;
                    await supabaseAdmin
                        .from('employee_directory')
                        .update({
                            invite_sent_at: new Date().toISOString(),
                            invite_status: 'failed',
                        })
                        .eq('id', emp.id);
                }

                // 600ms delay between sends (safe for Resend's 2 req/sec limit)
                if (i < targets.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 600));
                }
            }

            const remaining = totalPending - targets.length;
            return NextResponse.json({
                success: true,
                sent: sentCount,
                failed: failedCount,
                remaining,
                ...(remaining > 0 ? { message: `Sent ${sentCount}/${totalPending}. Call again to send remaining ${remaining}.` } : {})
            });
        }

        return NextResponse.json({ error: 'Invalid action. Must be "send", "test", "preview", or "audit".' }, { status: 400 });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// Role-specific email content
// ---------------------------------------------------------------------------
interface EmailContent {
    subject: string;
    intro: string;
    features: string[];
}

function getEmailContent(role: AppRole): EmailContent {
    const content: Record<AppRole, EmailContent> = {
        agent: {
            subject: 'Welcome to Pitch Vision — Your Performance Hub Awaits',
            intro: 'Access your schedules, training materials, performance analytics, and Pitch Points rewards — all in one intelligent platform built for your success.',
            features: [
                'Real-time performance dashboards',
                'Daily schedule and break tracking',
                'Training resources and compliance tools',
                'Pitch Points rewards system',
            ],
        },
        manager: {
            subject: 'Welcome to Pitch Vision — Your Team Command Center',
            intro: 'Lead your team with precision using advanced dashboards, coaching tools, and real-time agent performance tracking — everything you need to drive results.',
            features: [
                'Team performance dashboards and KPIs',
                'Agent coaching and scouting tools',
                'QA compliance summaries and alerts',
                'Watch list and performance comparisons',
            ],
        },
        qa: {
            subject: 'Welcome to Pitch Vision — Intelligent Compliance Review',
            intro: 'Revolutionize quality assurance with AI-powered call scoring, compliance analytics, and streamlined review workflows designed to elevate standards.',
            features: [
                'AI-powered call analysis and scoring',
                'Compliance dashboard and trend tracking',
                'Auto-fail detection and validation tools',
                'Agent performance scoreboard and reports',
            ],
        },
        hr: {
            subject: 'Welcome to Pitch Vision — Complete Workforce Management',
            intro: 'Streamline your operations with real-time attendance tracking, digital onboarding, and comprehensive employee insights — all in one central hub.',
            features: [
                'Real-time attendance monitoring',
                'Digital onboarding and contract signing',
                'Employee directory and profiles',
                'Workforce analytics and reports',
            ],
        },
        executive: {
            subject: 'Welcome to Pitch Vision — Strategic Command Center',
            intro: 'Access the executive command center with P&L analytics, revenue dashboards, and strategic insights to drive your business forward with clarity.',
            features: [
                'Real-time revenue and P&L analytics',
                'Operational efficiency tracking',
                'Workforce cost and ROI insights',
                'Strategic planning dashboards',
            ],
        },
        payroll: {
            subject: 'Welcome to Pitch Vision — Payroll Operations Hub',
            intro: 'Simplify payroll operations with integrated tools for processing, reporting, and employee compensation tracking — purpose-built for your workflow.',
            features: [
                'Payroll processing interface',
                'Employee compensation tracking',
                'Payroll period management',
                'Integration-ready workflows',
            ],
        },
    };

    return content[role] || content.agent;
}

// ---------------------------------------------------------------------------
// Email HTML template (role-aware)
// ---------------------------------------------------------------------------
function buildEmailHtml(firstName: string, email: string, role: AppRole): string {
    const appRole = role;
    const signupUrl = `${APP_URL}/login?mode=signup&email=${encodeURIComponent(email)}&role=${appRole}`;
    const logoUrl = `${APP_URL}/images/logo-header.png`;
    const content = getEmailContent(appRole);

    const featureListHtml = content.features
        .map(
            (f) =>
                `<tr><td style="padding:4px 0;font-size:14px;color:#9ca3af;line-height:1.6;">
                    <span style="color:#6366f1;margin-right:8px;">&#10003;</span> ${f}
                </td></tr>`
        )
        .join('');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        .cta-btn:hover { border-color: #818cf8 !important; background-color: rgba(99,102,241,0.15) !important; }
    </style>
</head>
<body style="margin:0;padding:0;background-color:#050505;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#050505;padding:48px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;border-radius:20px;overflow:hidden;border:1px solid #1a1a2e;">

                    <!-- Logo Header -->
                    <tr>
                        <td style="padding:44px 40px 0;text-align:center;">
                            <img src="${logoUrl}" alt="Pitch Vision" width="220" style="display:inline-block;max-width:220px;height:auto;" />
                        </td>
                    </tr>

                    <!-- Gradient Divider -->
                    <tr>
                        <td style="padding:24px 40px 0;text-align:center;">
                            <div style="width:80px;height:2px;background:linear-gradient(90deg,#6366f1,#06b6d4);margin:0 auto;border-radius:2px;"></div>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding:32px 44px 16px;">
                            <p style="margin:0 0 20px;font-size:20px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">
                                Hi ${firstName},
                            </p>
                            <p style="margin:0 0 16px;font-size:15px;color:#9ca3af;line-height:1.7;">
                                You've been invited to <strong style="color:#e5e7eb;">Pitch Vision</strong> — ${content.intro}
                            </p>

                            <!-- Feature List -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                                ${featureListHtml}
                            </table>

                            <p style="margin:0 0 32px;font-size:15px;color:#9ca3af;line-height:1.7;">
                                Click below to create your account. It only takes a couple of minutes.
                            </p>

                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center" style="padding:0 0 32px;">
                                        <a href="${signupUrl}" class="cta-btn"
                                           style="display:inline-block;padding:16px 48px;background-color:transparent;color:#c7d2fe;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;border:2px solid #6366f1;letter-spacing:0.5px;transition:all 0.2s ease;">
                                            Get Started
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <!-- Divider -->
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="border-top:1px solid #1f2937;padding-top:20px;">
                                        <p style="margin:0 0 6px;font-size:12px;color:#4b5563;line-height:1.5;">
                                            Or copy this link into your browser:
                                        </p>
                                        <p style="margin:0;font-size:12px;color:#6366f1;word-break:break-all;line-height:1.5;">
                                            ${signupUrl}
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding:28px 44px;border-top:1px solid #111827;text-align:center;">
                            <p style="margin:0 0 4px;font-size:11px;color:#374151;letter-spacing:0.5px;text-transform:uppercase;">
                                Pitch Perfect Solutions Inc.
                            </p>
                            <p style="margin:0;font-size:11px;color:#1f2937;">
                                Powered by Pitch Vision
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

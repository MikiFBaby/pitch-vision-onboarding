import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder');
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.pitchvision.io';

// GET — Return invite stats
export async function GET() {
    try {
        const [totalRes, sentRes, failedRes] = await Promise.all([
            supabaseAdmin
                .from('employee_directory')
                .select('id', { count: 'exact', head: true })
                .eq('employee_status', 'Active')
                .eq('role', 'Agent'),
            supabaseAdmin
                .from('employee_directory')
                .select('id', { count: 'exact', head: true })
                .eq('employee_status', 'Active')
                .eq('role', 'Agent')
                .eq('invite_status', 'sent'),
            supabaseAdmin
                .from('employee_directory')
                .select('id', { count: 'exact', head: true })
                .eq('employee_status', 'Active')
                .eq('role', 'Agent')
                .eq('invite_status', 'failed'),
        ]);

        return NextResponse.json({
            total: totalRes.count || 0,
            sent: sentRes.count || 0,
            failed: failedRes.count || 0,
            pending: (totalRes.count || 0) - (sentRes.count || 0) - (failedRes.count || 0),
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// POST — Send bulk invites, test email, or preview
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action } = body;

        if (action === 'preview') {
            return NextResponse.json({
                html: buildEmailHtml('{{first_name}}', '{{email}}'),
            });
        }

        if (action === 'test') {
            const { email, firstName } = body;
            if (!email) {
                return NextResponse.json({ error: 'Missing email for test' }, { status: 400 });
            }

            const { data, error } = await resend.emails.send({
                from: process.env.RESEND_FROM_EMAIL || 'Pitch Vision <onboarding@resend.dev>',
                to: email,
                subject: 'Welcome to Pitch Vision — Set Up Your Profile',
                html: buildEmailHtml(firstName || 'Team Member', email),
            });

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, messageId: data?.id });
        }

        if (action === 'send') {
            // Fetch all active agents who haven't been invited yet
            const { data: agents, error: fetchError } = await supabaseAdmin
                .from('employee_directory')
                .select('id, first_name, last_name, email')
                .eq('employee_status', 'Active')
                .eq('role', 'Agent')
                .is('invite_sent_at', null)
                .not('email', 'is', null);

            if (fetchError) {
                return NextResponse.json({ error: fetchError.message }, { status: 500 });
            }

            if (!agents || agents.length === 0) {
                return NextResponse.json({ success: true, sent: 0, message: 'No pending invites to send.' });
            }

            let sentCount = 0;
            let failedCount = 0;
            const batchSize = 10; // Resend batch limit

            for (let i = 0; i < agents.length; i += batchSize) {
                const batch = agents.slice(i, i + batchSize);

                const results = await Promise.allSettled(
                    batch.map(async (agent) => {
                        try {
                            const { error: sendError } = await resend.emails.send({
                                from: process.env.RESEND_FROM_EMAIL || 'Pitch Vision <onboarding@resend.dev>',
                                to: agent.email,
                                subject: 'Welcome to Pitch Vision — Set Up Your Profile',
                                html: buildEmailHtml(agent.first_name || 'Team Member', agent.email),
                            });

                            const status = sendError ? 'failed' : 'sent';

                            await supabaseAdmin
                                .from('employee_directory')
                                .update({
                                    invite_sent_at: new Date().toISOString(),
                                    invite_status: status,
                                })
                                .eq('id', agent.id);

                            return status;
                        } catch {
                            await supabaseAdmin
                                .from('employee_directory')
                                .update({
                                    invite_sent_at: new Date().toISOString(),
                                    invite_status: 'failed',
                                })
                                .eq('id', agent.id);
                            return 'failed';
                        }
                    })
                );

                results.forEach((r) => {
                    if (r.status === 'fulfilled' && r.value === 'sent') sentCount++;
                    else failedCount++;
                });

                // Small delay between batches to respect rate limits
                if (i + batchSize < agents.length) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }

            return NextResponse.json({ success: true, sent: sentCount, failed: failedCount });
        }

        return NextResponse.json({ error: 'Invalid action. Must be "send", "test", or "preview".' }, { status: 400 });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// Email HTML template
// ---------------------------------------------------------------------------
function buildEmailHtml(firstName: string, email: string): string {
    const signupUrl = `${APP_URL}/login?mode=signup&email=${encodeURIComponent(email)}&role=agent`;
    const logoUrl = `${APP_URL}/images/logo-header.png`;

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
                                You've been invited to <strong style="color:#e5e7eb;">Pitch Vision</strong> — the new intelligence platform built for your team. Access your schedules, training materials, performance analytics, and more — all in one place.
                            </p>
                            <p style="margin:0 0 32px;font-size:15px;color:#9ca3af;line-height:1.7;">
                                Click below to create your account and set up your profile. It only takes a couple of minutes.
                            </p>

                            <!-- CTA Button with border hover -->
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

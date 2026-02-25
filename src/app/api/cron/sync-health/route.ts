import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';

// Alert if heartbeat is older than this (in minutes)
const STALE_THRESHOLD_MINUTES = 30;

// Who to notify
const ALERT_RECIPIENTS = ['miki@pitchperfectsolutions.net'];

/**
 * Cron endpoint: HR Sheets Sync Health Monitor
 * Checks the sync_heartbeat table to detect when the Apps Script
 * scheduled trigger has stopped firing.
 *
 * Schedule: Every 30 minutes on weekdays (0,30 * * * 1-5)
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 1. Read heartbeat
        const { data: heartbeat, error } = await supabaseAdmin
            .from('sync_heartbeat')
            .select('*')
            .eq('id', 1)
            .maybeSingle();

        if (error) {
            console.error('[SyncHealth] DB error:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // No heartbeat row yet — script hasn't been updated with heartbeat code
        if (!heartbeat) {
            return NextResponse.json({
                status: 'no_heartbeat',
                message: 'No heartbeat row found. Update the Apps Script with the latest version.',
            });
        }

        const lastBeat = new Date(heartbeat.last_beat);
        const now = new Date();
        const minutesAgo = Math.round((now.getTime() - lastBeat.getTime()) / 60000);
        const isStale = minutesAgo > STALE_THRESHOLD_MINUTES;

        // 2. Also check max(created_at) across key tables for extra context
        const tableChecks = await Promise.all([
            supabaseAdmin.from('HR Fired').select('created_at').order('created_at', { ascending: false }).limit(1),
            supabaseAdmin.from('HR Hired').select('created_at').order('created_at', { ascending: false }).limit(1),
            supabaseAdmin.from('Agent Schedule').select('created_at').order('created_at', { ascending: false }).limit(1),
            supabaseAdmin.from('Non Booked Days Off').select('created_at').order('created_at', { ascending: false }).limit(1),
        ]);

        const tableNames = ['HR Fired', 'HR Hired', 'Agent Schedule', 'Non Booked Days Off'];
        const tableStatus = tableNames.map((name, i) => {
            const row = tableChecks[i].data?.[0];
            const lastSync = row ? new Date(row.created_at) : null;
            const age = lastSync ? Math.round((now.getTime() - lastSync.getTime()) / 60000) : null;
            return { table: name, lastSync: lastSync?.toISOString() || 'never', minutesAgo: age };
        });

        const result = {
            status: isStale ? 'stale' : 'healthy',
            heartbeat: {
                lastBeat: lastBeat.toISOString(),
                minutesAgo,
                syncedCount: heartbeat.synced_count,
                skippedCount: heartbeat.skipped_count,
                failedCount: heartbeat.failed_count,
            },
            tables: tableStatus,
        };

        // 3. Send alert email if stale
        if (isStale) {
            console.warn(`[SyncHealth] STALE heartbeat — last beat ${minutesAgo} minutes ago`);
            await sendStaleAlert(minutesAgo, lastBeat, tableStatus);
        }

        return NextResponse.json(result);
    } catch (err: any) {
        console.error('[SyncHealth] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

async function sendStaleAlert(
    minutesAgo: number,
    lastBeat: Date,
    tableStatus: { table: string; lastSync: string; minutesAgo: number | null }[]
) {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
        console.log('[SyncHealth] SMTP not configured, skipping alert email');
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

    const hoursAgo = (minutesAgo / 60).toFixed(1);
    const tableRows = tableStatus
        .map(t => `<tr><td style="padding:4px 12px;border:1px solid #ddd;">${t.table}</td><td style="padding:4px 12px;border:1px solid #ddd;">${t.minutesAgo !== null ? `${t.minutesAgo} min ago` : 'never'}</td></tr>`)
        .join('');

    const html = `
        <div style="font-family:sans-serif;max-width:600px;">
            <h2 style="color:#dc2626;">HR Sheets Sync Has Stopped</h2>
            <p>The Google Sheets → Supabase sync trigger has not run in <strong>${hoursAgo} hours</strong> (${minutesAgo} minutes).</p>
            <p>Last heartbeat: <strong>${lastBeat.toLocaleString('en-US', { timeZone: 'America/Toronto' })} ET</strong></p>
            <h3>Table Freshness</h3>
            <table style="border-collapse:collapse;font-size:14px;">
                <tr style="background:#f3f4f6;"><th style="padding:4px 12px;border:1px solid #ddd;">Table</th><th style="padding:4px 12px;border:1px solid #ddd;">Last Sync</th></tr>
                ${tableRows}
            </table>
            <h3>How to Fix</h3>
            <ol>
                <li>Open the HR Tracker Google Sheet</li>
                <li>Go to <strong>Extensions → Apps Script</strong></li>
                <li>Check the <strong>Triggers</strong> (clock icon) — look for disabled triggers</li>
                <li>Run <code>installTriggers()</code> to re-create them</li>
                <li>Run <code>syncAll()</code> to force an immediate full sync</li>
            </ol>
            <p style="color:#6b7280;font-size:12px;">Sent by PitchVision Sync Health Monitor</p>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: `"PitchVision Alerts" <${process.env.SMTP_USER}>`,
            to: ALERT_RECIPIENTS.join(', '),
            subject: `[ALERT] HR Sheets Sync Stopped — ${hoursAgo}h since last sync`,
            html,
        });
        console.log('[SyncHealth] Alert email sent to', ALERT_RECIPIENTS.join(', '));
    } catch (err: any) {
        console.error('[SyncHealth] Failed to send alert email:', err.message);
    }
}

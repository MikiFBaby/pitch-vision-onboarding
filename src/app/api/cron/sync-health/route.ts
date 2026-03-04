import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';

// Alert if HR heartbeat is older than this (in minutes)
// The Apps Script scheduled sync runs every 5 min but skips unchanged sheets (MD5 hash).
// During quiet periods (no edits), heartbeat stops updating. 6 hours accommodates this.
const HR_STALE_THRESHOLD_MINUTES = 360;

// Alert if DialedIn has no reports ingested in this many hours (weekdays only)
const DIALEDIN_STALE_THRESHOLD_HOURS = 36;

// Alert if intraday scraper has no successful scrape in this many minutes (weekdays 10AM-7PM ET)
const INTRADAY_STALE_THRESHOLD_MINUTES = 15;

// Who to notify
const ALERT_RECIPIENTS = ['miki@pitchperfectsolutions.net'];

/**
 * Cron endpoint: Unified Sync Health Monitor
 * Checks both HR Sheets sync (via sync_heartbeat) and DialedIn report
 * ingestion freshness (via dialedin_reports + dialedin_daily_kpis).
 *
 * Schedule: Once daily at 5 PM UTC (12 PM ET) on weekdays (Vercel Hobby plan — 1/day limit)
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();

    try {
        // ─── HR Sheets Health ───────────────────────────────────────────

        const { data: heartbeat, error } = await supabaseAdmin
            .from('sync_heartbeat')
            .select('*')
            .eq('id', 1)
            .maybeSingle();

        if (error) {
            console.error('[SyncHealth] DB error:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        let hrStatus: Record<string, unknown>;
        let isHrStale = false;

        if (!heartbeat) {
            hrStatus = { status: 'no_heartbeat', message: 'No heartbeat row found.' };
        } else {
            const lastBeat = new Date(heartbeat.last_beat);
            const minutesAgo = Math.round((now.getTime() - lastBeat.getTime()) / 60000);
            isHrStale = minutesAgo > HR_STALE_THRESHOLD_MINUTES;

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

            hrStatus = {
                status: isHrStale ? 'stale' : 'healthy',
                heartbeat: {
                    lastBeat: lastBeat.toISOString(),
                    minutesAgo,
                    syncedCount: heartbeat.synced_count,
                    skippedCount: heartbeat.skipped_count,
                    failedCount: heartbeat.failed_count,
                },
                tables: tableStatus,
            };
        }

        // ─── DialedIn Ingest Health ─────────────────────────────────────

        const todayISO = now.toISOString().split('T')[0];
        const [lastReportRes, lastKpiRes, todayCountRes, recentFailedRes] = await Promise.all([
            // Most recent ingested report
            supabaseAdmin
                .from('dialedin_reports')
                .select('report_date, report_type, created_at, ingestion_status')
                .eq('ingestion_status', 'completed')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
            // Most recent computed KPIs
            supabaseAdmin
                .from('dialedin_daily_kpis')
                .select('report_date, updated_at')
                .order('report_date', { ascending: false })
                .limit(1)
                .maybeSingle(),
            // Count of reports ingested today
            supabaseAdmin
                .from('dialedin_reports')
                .select('id', { count: 'exact', head: true })
                .gte('created_at', todayISO),
            // Recent failed ingestions (last 3 days)
            supabaseAdmin
                .from('dialedin_reports')
                .select('filename, report_type, report_date, ingestion_status, error_message')
                .eq('ingestion_status', 'failed')
                .gte('created_at', new Date(now.getTime() - 3 * 86400000).toISOString())
                .order('created_at', { ascending: false })
                .limit(10),
        ]);

        const lastReport = lastReportRes.data;
        const lastKpi = lastKpiRes.data;
        const todayCount = todayCountRes.count || 0;
        const recentFailed = recentFailedRes.data || [];

        const lastIngestHoursAgo = lastReport
            ? Math.round((now.getTime() - new Date(lastReport.created_at).getTime()) / 3600000)
            : null;

        // Stale if weekday and no reports ingested in threshold period
        const dayOfWeek = now.getUTCDay(); // 0=Sun, 6=Sat
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
        const isDialedinStale = isWeekday && (lastIngestHoursAgo === null || lastIngestHoursAgo > DIALEDIN_STALE_THRESHOLD_HOURS);

        const dialedinStatus = {
            status: isDialedinStale ? 'stale' : 'healthy',
            lastIngest: lastReport ? {
                at: lastReport.created_at,
                hoursAgo: lastIngestHoursAgo,
                reportDate: lastReport.report_date,
                reportType: lastReport.report_type,
            } : null,
            lastKpiDate: lastKpi?.report_date || null,
            reportsIngestedToday: todayCount,
            recentFailures: recentFailed.length,
            failures: recentFailed.length > 0 ? recentFailed.map(f => ({
                file: f.filename,
                type: f.report_type,
                date: f.report_date,
                error: f.error_message,
            })) : undefined,
        };

        // ─── Intraday Scraper Health ─────────────────────────────────────

        const etHourNow = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
        const isBusinessHours = isWeekday && etHourNow >= 10 && etHourNow < 19;

        let intradayStatus: Record<string, unknown> = { status: 'outside_hours' };
        let isIntradayStale = false;

        if (isBusinessHours) {
            const [lastScrapeRes, recentErrorsRes] = await Promise.all([
                supabaseAdmin
                    .from('dialedin_intraday_scrape_log')
                    .select('scraped_at, status, agent_count, snapshot_at, error_message')
                    .eq('status', 'success')
                    .order('scraped_at', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                supabaseAdmin
                    .from('dialedin_intraday_scrape_log')
                    .select('scraped_at, error_message')
                    .eq('status', 'error')
                    .gte('scraped_at', new Date(now.getTime() - 6 * 3600000).toISOString())
                    .order('scraped_at', { ascending: false })
                    .limit(5),
            ]);

            const lastScrape = lastScrapeRes.data;
            const recentErrors = recentErrorsRes.data || [];
            const lastScrapeMinAgo = lastScrape
                ? Math.round((now.getTime() - new Date(lastScrape.scraped_at).getTime()) / 60000)
                : null;

            isIntradayStale = lastScrapeMinAgo === null || lastScrapeMinAgo > INTRADAY_STALE_THRESHOLD_MINUTES;

            intradayStatus = {
                status: isIntradayStale ? 'stale' : 'healthy',
                lastScrape: lastScrape ? {
                    at: lastScrape.scraped_at,
                    minutesAgo: lastScrapeMinAgo,
                    agentCount: lastScrape.agent_count,
                    snapshotAt: lastScrape.snapshot_at,
                } : null,
                recentErrors: recentErrors.length,
                errors: recentErrors.length > 0 ? recentErrors.map(e => ({
                    at: e.scraped_at,
                    error: (e.error_message || '').slice(0, 120),
                })) : undefined,
            };
        }

        // ─── Combined result ────────────────────────────────────────────

        const overallStatus = (isHrStale || isDialedinStale || isIntradayStale) ? 'degraded' : 'healthy';

        const result = {
            status: overallStatus,
            hr: hrStatus,
            dialedin: dialedinStatus,
            intraday: intradayStatus,
        };

        // ─── Send alerts if anything is stale ───────────────────────────

        if (isHrStale || isDialedinStale || isIntradayStale) {
            const hrBeat = heartbeat ? new Date(heartbeat.last_beat) : null;
            const hrMinutes = hrBeat ? Math.round((now.getTime() - hrBeat.getTime()) / 60000) : null;
            const hrTables = (hrStatus as any).tables || [];

            await sendHealthAlert({
                isHrStale,
                isDialedinStale,
                isIntradayStale,
                hrMinutesAgo: hrMinutes,
                hrLastBeat: hrBeat,
                hrTables,
                dialedinHoursAgo: lastIngestHoursAgo,
                dialedinLastReport: lastReport,
                dialedinLastKpiDate: lastKpi?.report_date || null,
                dialedinTodayCount: todayCount,
                dialedinFailures: recentFailed,
                intradayLastScrapeMinAgo: (intradayStatus as any).lastScrape?.minutesAgo ?? null,
                intradayRecentErrors: (intradayStatus as any).errors || [],
            });
        }

        return NextResponse.json(result);
    } catch (err: any) {
        console.error('[SyncHealth] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

interface AlertParams {
    isHrStale: boolean;
    isDialedinStale: boolean;
    isIntradayStale: boolean;
    hrMinutesAgo: number | null;
    hrLastBeat: Date | null;
    hrTables: { table: string; lastSync: string; minutesAgo: number | null }[];
    dialedinHoursAgo: number | null;
    dialedinLastReport: { report_date: string; report_type: string; created_at: string } | null;
    dialedinLastKpiDate: string | null;
    dialedinTodayCount: number;
    dialedinFailures: { filename: string; error_message: string }[];
    intradayLastScrapeMinAgo: number | null;
    intradayRecentErrors: { at: string; error: string }[];
}

async function sendHealthAlert(params: AlertParams) {
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

    let sections = '';

    // HR section
    if (params.isHrStale && params.hrLastBeat) {
        const hoursAgo = ((params.hrMinutesAgo || 0) / 60).toFixed(1);
        const tableRows = params.hrTables
            .map(t => `<tr><td style="padding:4px 12px;border:1px solid #ddd;">${t.table}</td><td style="padding:4px 12px;border:1px solid #ddd;">${t.minutesAgo !== null ? `${t.minutesAgo} min ago` : 'never'}</td></tr>`)
            .join('');

        sections += `
            <h2 style="color:#dc2626;">HR Sheets Sync Has Stopped</h2>
            <p>Last heartbeat: <strong>${params.hrLastBeat.toLocaleString('en-US', { timeZone: 'America/Toronto' })} ET</strong> (${hoursAgo}h ago)</p>
            <table style="border-collapse:collapse;font-size:14px;margin-bottom:16px;">
                <tr style="background:#f3f4f6;"><th style="padding:4px 12px;border:1px solid #ddd;">Table</th><th style="padding:4px 12px;border:1px solid #ddd;">Last Sync</th></tr>
                ${tableRows}
            </table>
            <p><strong>Fix:</strong> Open HR Tracker → Extensions → Apps Script → Triggers → re-enable or run <code>installTriggers()</code></p>
            <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb;" />
        `;
    }

    // DialedIn section
    if (params.isDialedinStale) {
        const lastIngestStr = params.dialedinLastReport
            ? `${new Date(params.dialedinLastReport.created_at).toLocaleString('en-US', { timeZone: 'America/Toronto' })} ET (${params.dialedinHoursAgo}h ago)`
            : 'Never';

        let failureRows = '';
        if (params.dialedinFailures.length > 0) {
            failureRows = `
                <h3>Recent Failures</h3>
                <table style="border-collapse:collapse;font-size:14px;margin-bottom:16px;">
                    <tr style="background:#f3f4f6;"><th style="padding:4px 12px;border:1px solid #ddd;">File</th><th style="padding:4px 12px;border:1px solid #ddd;">Error</th></tr>
                    ${params.dialedinFailures.map(f => `<tr><td style="padding:4px 12px;border:1px solid #ddd;">${f.filename}</td><td style="padding:4px 12px;border:1px solid #ddd;">${f.error_message || 'Unknown'}</td></tr>`).join('')}
                </table>
            `;
        }

        sections += `
            <h2 style="color:#dc2626;">DialedIn Report Ingestion Stale</h2>
            <p>No new DialedIn reports have been ingested in <strong>${params.dialedinHoursAgo ?? '?'}+ hours</strong>.</p>
            <ul style="margin:8px 0;">
                <li>Last ingestion: <strong>${lastIngestStr}</strong></li>
                <li>Last report date: <strong>${params.dialedinLastReport?.report_date || 'N/A'}</strong></li>
                <li>Last KPI date: <strong>${params.dialedinLastKpiDate || 'N/A'}</strong></li>
                <li>Reports ingested today: <strong>${params.dialedinTodayCount}</strong></li>
            </ul>
            ${failureRows}
            <p><strong>Possible causes:</strong></p>
            <ol>
                <li>DialedIn/Chase stopped sending email reports</li>
                <li>IMAP credentials expired or Gmail blocked the connection</li>
                <li>Vercel cron failed to trigger (check Vercel dashboard → Cron Jobs)</li>
                <li>Email sender address changed (check <code>DIALEDIN_SENDERS</code> in dialedin-ingest route)</li>
            </ol>
        `;
    }

    // Intraday scraper section
    if (params.isIntradayStale) {
        const lastMin = params.intradayLastScrapeMinAgo;
        const lastStr = lastMin !== null ? `${lastMin} minutes ago` : 'Never';

        let errorRows = '';
        if (params.intradayRecentErrors.length > 0) {
            errorRows = `
                <h3>Recent Errors</h3>
                <table style="border-collapse:collapse;font-size:14px;margin-bottom:16px;">
                    <tr style="background:#f3f4f6;"><th style="padding:4px 12px;border:1px solid #ddd;">Time</th><th style="padding:4px 12px;border:1px solid #ddd;">Error</th></tr>
                    ${params.intradayRecentErrors.map(e => `<tr><td style="padding:4px 12px;border:1px solid #ddd;">${new Date(e.at).toLocaleString('en-US', { timeZone: 'America/Toronto' })}</td><td style="padding:4px 12px;border:1px solid #ddd;">${e.error}</td></tr>`).join('')}
                </table>
            `;
        }

        sections += `
            <h2 style="color:#dc2626;">Intraday Scraper Stale</h2>
            <p>No successful intraday scrape in <strong>${INTRADAY_STALE_THRESHOLD_MINUTES}+ minutes</strong> during business hours.</p>
            <ul style="margin:8px 0;">
                <li>Last successful scrape: <strong>${lastStr}</strong></li>
            </ul>
            ${errorRows}
            <p><strong>Possible causes:</strong></p>
            <ol>
                <li>VPS/EC2 cron not running (check <code>crontab -l</code> on the VPS)</li>
                <li>Playwright browser crash or DialedIn portal down</li>
                <li>VPS credentials expired (<code>DIALEDIN_PORTAL_USER/PASS</code>)</li>
                <li>VPS instance stopped or rebooted</li>
            </ol>
            <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb;" />
        `;
    }

    // Build subject line
    const problems: string[] = [];
    if (params.isHrStale) problems.push('HR Sync');
    if (params.isDialedinStale) problems.push('DialedIn Ingest');
    if (params.isIntradayStale) problems.push('Intraday Scraper');

    const html = `
        <div style="font-family:sans-serif;max-width:600px;">
            ${sections}
            <p style="color:#6b7280;font-size:12px;margin-top:24px;">Sent by PitchVision Health Monitor</p>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: `"PitchVision Alerts" <${process.env.SMTP_USER}>`,
            to: ALERT_RECIPIENTS.join(', '),
            subject: `[ALERT] ${problems.join(' + ')} — Action Required`,
            html,
        });
        console.log('[SyncHealth] Alert email sent to', ALERT_RECIPIENTS.join(', '));
    } catch (err: any) {
        console.error('[SyncHealth] Failed to send alert email:', err.message);
    }
}

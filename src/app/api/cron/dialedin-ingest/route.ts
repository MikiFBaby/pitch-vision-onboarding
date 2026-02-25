import { NextRequest, NextResponse } from 'next/server';
import { ImapFlow } from 'imapflow';
// @ts-expect-error — mailparser has no type declarations
import { simpleParser } from 'mailparser';
import { ingestFile, computeAndStore, getChecklistStatus } from '@/utils/dialedin-store';
import { extractDateRange, toISODate, identifyReportType } from '@/utils/dialedin-parser';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { ParsedReportData } from '@/types/dialedin-types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const DIALEDIN_SENDERS = [
  'notifications@chasedatacorp.com',
  'noreply@dialedincontactcenter.com',
  'reports@dialedin.com',
];

const LOOKBACK_DAYS = 7;

/**
 * Vercel cron endpoint — fetches DialedIn XLS reports from Gmail via IMAP
 * and feeds them through the existing ETL pipeline.
 *
 * Runs daily at 7 AM. Searches the last 7 days to catch any gaps.
 * Deduplicates against the `dialedin_reports` table (filename + report_type + report_date).
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this header for cron invocations)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Also allow API key for manual triggers
    const apiKey = request.headers.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.DIALEDIN_INGEST_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const imapUser = process.env.SMTP_USER;
  const imapPass = process.env.SMTP_PASS;
  if (!imapUser || !imapPass) {
    return NextResponse.json({ error: 'SMTP_USER/SMTP_PASS not configured' }, { status: 500 });
  }

  const log: string[] = [];
  const addLog = (msg: string) => {
    log.push(`[${new Date().toISOString()}] ${msg}`);
    console.log(`[dialedin-ingest] ${msg}`);
  };

  let client: ImapFlow | null = null;

  try {
    // Connect to Gmail IMAP
    client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user: imapUser, pass: imapPass },
      logger: false,
    });

    await client.connect();
    addLog('Connected to Gmail IMAP');

    // Open INBOX
    await client.mailboxOpen('INBOX');

    // Search for DialedIn emails from the last N days
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - LOOKBACK_DAYS);

    // IMAP search: from any DialedIn sender, since lookback date
    // ImapFlow supports OR queries via nested arrays
    const messages = client.fetch(
      {
        since: sinceDate,
        or: DIALEDIN_SENDERS.map(sender => ({ from: sender })),
      },
      {
        uid: true,
        envelope: true,
        source: true,
      },
    );

    // Collect all XLS attachments grouped by report date
    const filesByDate: Map<string, { filename: string; buffer: Buffer; reportDate: string }[]> = new Map();
    let totalEmails = 0;
    let totalAttachments = 0;
    let totalSkipped = 0;
    let totalIngested = 0;

    for await (const msg of messages) {
      totalEmails++;
      const subject = msg.envelope?.subject || '';
      const source = msg.source;
      if (!source) continue;

      // Parse the email to extract attachments
      const parsed = await simpleParser(source);
      if (!parsed.attachments || parsed.attachments.length === 0) continue;

      for (const att of parsed.attachments) {
        const filename = att.filename;
        if (!filename || !filename.match(/\.(xls|xlsx)$/i)) continue;

        totalAttachments++;

        // Identify report type and date from filename
        const reportType = identifyReportType(filename);
        if (!reportType) {
          addLog(`Skipping unrecognized report: ${filename}`);
          continue;
        }

        const { end } = extractDateRange(filename);
        const reportDate = end ? toISODate(end) : null;
        if (!reportDate) {
          addLog(`Skipping file with no date range: ${filename}`);
          continue;
        }

        // Check if already ingested (dedup)
        const { data: existing } = await supabaseAdmin
          .from('dialedin_reports')
          .select('id')
          .eq('report_type', reportType)
          .eq('report_date', reportDate)
          .in('ingestion_status', ['processing', 'completed'])
          .limit(1)
          .maybeSingle();

        if (existing) {
          totalSkipped++;
          continue;
        }

        addLog(`New report: ${filename} (${reportType}, date: ${reportDate})`);

        if (!filesByDate.has(reportDate)) {
          filesByDate.set(reportDate, []);
        }
        filesByDate.get(reportDate)!.push({
          filename,
          buffer: att.content,
          reportDate,
        });
      }
    }

    addLog(`Scanned ${totalEmails} emails, ${totalAttachments} XLS attachments, ${totalSkipped} already ingested`);

    // Process new files through the existing ETL pipeline
    const results: { reportDate: string; processed: number; computed: boolean; checklist?: { received: number; total: number; missing: string[] } }[] = [];

    for (const [reportDate, files] of filesByDate) {
      const parsedReports: ParsedReportData[] = [];
      const reportIds: string[] = [];
      const errors: string[] = [];

      for (const file of files) {
        const result = await ingestFile(file.buffer, file.filename, 'cron_imap');
        if ('error' in result) {
          errors.push(result.error);
          addLog(`Error ingesting ${file.filename}: ${result.error}`);
          continue;
        }
        parsedReports.push(result.parsed);
        reportIds.push(result.reportId);
        totalIngested++;
        addLog(`Ingested: ${file.filename}`);
      }

      // Run computation for this date if we ingested any files
      if (parsedReports.length > 0) {
        const etlResult = await computeAndStore(parsedReports, reportDate, reportIds);
        const checklist = await getChecklistStatus(reportDate);

        const computed = !('incomplete' in etlResult);
        results.push({
          reportDate,
          processed: parsedReports.length,
          computed,
          checklist: {
            received: checklist.receivedCount,
            total: checklist.totalCount,
            missing: checklist.missing,
          },
        });

        addLog(`Date ${reportDate}: ${parsedReports.length} files ingested, computed=${computed}, checklist=${checklist.receivedCount}/${checklist.totalCount}`);
      }
    }

    // Close IMAP connection
    await client.logout();
    client = null;

    const summary = {
      success: true,
      scanned: totalEmails,
      attachments: totalAttachments,
      skipped: totalSkipped,
      ingested: totalIngested,
      dates: results,
      log,
    };

    addLog(`Done. Ingested ${totalIngested} new files across ${results.length} dates.`);

    return NextResponse.json(summary);
  } catch (err) {
    addLog(`Fatal error: ${err instanceof Error ? err.message : 'Unknown'}`);
    console.error('[dialedin-ingest] Fatal error:', err);

    // Ensure IMAP connection is closed
    if (client) {
      try { await client.logout(); } catch { /* ignore */ }
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cron failed', log },
      { status: 500 },
    );
  }
}

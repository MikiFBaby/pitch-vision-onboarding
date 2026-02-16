import { NextRequest, NextResponse } from 'next/server';
import { ingestFile, computeAndStore, getChecklistStatus } from '@/utils/dialedin-store';
import type { ParsedReportData } from '@/types/dialedin-types';
import { extractDateRange, toISODate } from '@/utils/dialedin-parser';

export const runtime = 'nodejs';

/**
 * Webhook endpoint for Google Apps Script email ingestion.
 * Accepts JSON payload with base64-encoded XLS attachment(s).
 *
 * Expected body:
 * {
 *   "attachments": [
 *     { "filename": "AgentSummaryCampaign_01-15-2026_01-15-2026.xls", "data": "<base64>" }
 *   ],
 *   "sender": "reports@dialedin.com",
 *   "receivedAt": "2026-01-15T06:15:00Z",
 *   "subject": "Report AgentSummaryCampaign ..."
 * }
 */
export async function POST(request: NextRequest) {
  // Validate API key
  const apiKey = request.headers.get('X-API-Key');
  if (!apiKey || apiKey !== process.env.DIALEDIN_INGEST_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const attachments: { filename: string; data: string }[] = body.attachments || [];

    // Support single-file legacy format
    if (!attachments.length && body.filename && body.data) {
      attachments.push({ filename: body.filename, data: body.data });
    }

    if (attachments.length === 0) {
      return NextResponse.json({ error: 'No attachments provided' }, { status: 400 });
    }

    const parsedReports: ParsedReportData[] = [];
    const reportIds: string[] = [];
    let reportDate: string | null = null;
    const errors: string[] = [];

    for (const attachment of attachments) {
      const buffer = Buffer.from(attachment.data, 'base64');
      const result = await ingestFile(buffer, attachment.filename, 'email_apps_script');

      if ('error' in result) {
        errors.push(result.error);
        continue;
      }

      parsedReports.push(result.parsed);
      reportIds.push(result.reportId);

      const { end } = extractDateRange(attachment.filename);
      if (end && !reportDate) {
        reportDate = toISODate(end);
      }
    }

    if (parsedReports.length > 0 && reportDate) {
      const etlResult = await computeAndStore(parsedReports, reportDate, reportIds);
      const checklist = await getChecklistStatus(reportDate);

      if ('incomplete' in etlResult) {
        return NextResponse.json({
          success: true,
          reportDate,
          processed: parsedReports.length,
          skipped: errors.length,
          errors: errors.length > 0 ? errors : undefined,
          computed: false,
          checklist: {
            received: checklist.receivedCount,
            total: checklist.totalCount,
            complete: false,
            missing: checklist.missing,
          },
        });
      }

      return NextResponse.json({
        success: true,
        reportDate,
        processed: parsedReports.length,
        skipped: errors.length,
        errors: errors.length > 0 ? errors : undefined,
        computed: true,
        checklist: {
          received: checklist.receivedCount,
          total: checklist.totalCount,
          complete: true,
          missing: [],
        },
        summary: {
          agents: etlResult.dailyKPIs.total_agents,
          transfers: etlResult.dailyKPIs.total_transfers,
          tph: etlResult.dailyKPIs.transfers_per_hour,
        },
      });
    }

    return NextResponse.json({
      success: false,
      errors,
      error: 'No valid report files could be processed',
    }, { status: 400 });
  } catch (err) {
    console.error('DialedIn ingest error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ingest failed' },
      { status: 500 },
    );
  }
}

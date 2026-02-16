import { NextRequest, NextResponse } from 'next/server';
import { ingestFile, computeAndStore, getChecklistStatus, type ProcessFileResult } from '@/utils/dialedin-store';
import type { ParsedReportData } from '@/types/dialedin-types';
import { extractDateRange, toISODate } from '@/utils/dialedin-parser';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const results: ProcessFileResult[] = [];
    const parsedReports: ParsedReportData[] = [];
    const reportIds: string[] = [];
    let reportDate: string | null = null;

    // Ingest each file
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await ingestFile(buffer, file.name, 'manual');

      if ('error' in result) {
        results.push({
          filename: file.name,
          reportType: 'unknown',
          reportDate: '',
          rowCount: 0,
          success: false,
          error: result.error,
        });
        continue;
      }

      parsedReports.push(result.parsed);
      reportIds.push(result.reportId);

      const { end } = extractDateRange(file.name);
      if (end && !reportDate) {
        reportDate = toISODate(end);
      }

      const rowCount =
        (result.parsed.agentSummary?.length || 0) +
        (result.parsed.subcampaign?.length || 0) +
        (result.parsed.production?.length || 0) +
        (result.parsed.campaignSummary?.length || 0) +
        (result.parsed.shiftReport?.length || 0) +
        (result.parsed.agentSummarySubcampaign?.length || 0) +
        (result.parsed.agentAnalysis?.length || 0) +
        (result.parsed.callsPerHour?.length || 0) +
        (result.parsed.productionSubcampaign?.length || 0) +
        (result.parsed.agentPauseTime?.length || 0) +
        (result.parsed.campaignCallLog?.length || 0);

      results.push({
        filename: file.name,
        reportType: result.parsed.reportType,
        reportDate: reportDate || '',
        rowCount,
        success: true,
      });
    }

    // If we have parsed data, attempt computation (gated on 12/12 completeness)
    if (parsedReports.length > 0 && reportDate) {
      const etlResult = await computeAndStore(parsedReports, reportDate, reportIds);
      const checklist = await getChecklistStatus(reportDate);

      if ('incomplete' in etlResult) {
        return NextResponse.json({
          success: true,
          reportDate,
          files: results,
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
        files: results,
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
          anomalies: etlResult.anomalies.length,
        },
      });
    }

    return NextResponse.json({
      success: false,
      files: results,
      error: 'No valid report files could be processed',
    }, { status: 400 });
  } catch (err) {
    console.error('DialedIn upload error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }
}

/**
 * Shared storage logic for the DialedIn ETL pipeline.
 * Used by both /api/dialedin/upload and /api/dialedin/ingest.
 */
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parseXLSBuffer, identifyReportType, extractDateRange, toISODate } from './dialedin-parser';
import { processDay, type ETLResult } from './dialedin-kpi';
import { postSlackMessage } from './slack-helpers';
import { REPORT_TYPE_CONFIG, type ParsedReportData, type IngestionSource, type ReportType } from '@/types/dialedin-types';
import { uploadReportToS3 } from './s3-upload';

const ALL_REPORT_TYPES = Object.keys(REPORT_TYPE_CONFIG) as ReportType[];

export interface ProcessFileResult {
  filename: string;
  reportType: string;
  reportDate: string;
  rowCount: number;
  success: boolean;
  error?: string;
}

export interface ChecklistStatus {
  received: string[];
  missing: string[];
  complete: boolean;
  receivedCount: number;
  totalCount: number;
}

/**
 * Check which of the 12 report types have been received for a given date.
 */
export async function getChecklistStatus(reportDate: string): Promise<ChecklistStatus> {
  const { data } = await supabaseAdmin
    .from('dialedin_reports')
    .select('report_type')
    .eq('report_date', reportDate)
    .in('ingestion_status', ['processing', 'completed']);

  const receivedSet = new Set((data || []).map((r) => r.report_type));
  const received = ALL_REPORT_TYPES.filter((t) => receivedSet.has(t));
  const missing = ALL_REPORT_TYPES.filter((t) => !receivedSet.has(t));

  return {
    received,
    missing,
    complete: missing.length === 0,
    receivedCount: received.length,
    totalCount: ALL_REPORT_TYPES.length,
  };
}

/**
 * Process a single XLS file buffer through the full ETL pipeline:
 * 1. Upload raw file to Supabase Storage
 * 2. Parse XLS
 * 3. Insert report metadata
 * 4. Return parsed data (caller batches for day-level computation)
 */
export async function ingestFile(
  buffer: Buffer,
  filename: string,
  source: IngestionSource,
): Promise<{ parsed: ParsedReportData; reportId: string } | { error: string }> {
  const reportType = identifyReportType(filename);
  if (!reportType) {
    return { error: `Unrecognized report type for file: ${filename}` };
  }

  const { start, end } = extractDateRange(filename);
  const reportDate = end ? toISODate(end) : new Date().toISOString().split('T')[0];

  // 1. Upload raw file to Supabase Storage + S3 (parallel, S3 non-blocking)
  const storagePath = `raw/${reportDate}/${Date.now()}_${filename}`;
  let rawFileUrl: string | null = null;
  let s3FileKey: string | null = null;

  const [storageResult, s3Result] = await Promise.all([
    supabaseAdmin.storage
      .from('dialedin_reports')
      .upload(storagePath, buffer, { contentType: 'application/vnd.ms-excel', upsert: false }),
    uploadReportToS3(buffer, reportDate, reportType, filename),
  ]);

  if (!storageResult.error) {
    const { data: urlData } = supabaseAdmin.storage
      .from('dialedin_reports')
      .getPublicUrl(storagePath);
    rawFileUrl = urlData?.publicUrl || null;
  }
  s3FileKey = s3Result;

  // 2. Parse XLS
  let parsed: ParsedReportData;
  try {
    parsed = parseXLSBuffer(buffer, filename);
  } catch (err) {
    // Insert failed report metadata
    await supabaseAdmin.from('dialedin_reports').insert({
      filename,
      report_type: reportType,
      report_date: reportDate,
      date_range_start: start ? toISODate(start) : null,
      date_range_end: end ? toISODate(end) : null,
      raw_file_url: rawFileUrl,
      ingestion_source: source,
      ingestion_status: 'failed',
      error_message: err instanceof Error ? err.message : 'Parse error',
    });
    return { error: `Failed to parse ${filename}: ${err instanceof Error ? err.message : 'Unknown error'}` };
  }

  // 3. Calculate row count (across all parsed data types)
  const rowCount =
    (parsed.agentSummary?.length || 0) +
    (parsed.subcampaign?.length || 0) +
    (parsed.production?.length || 0) +
    (parsed.campaignSummary?.length || 0) +
    (parsed.shiftReport?.length || 0) +
    (parsed.agentSummarySubcampaign?.length || 0) +
    (parsed.agentAnalysis?.length || 0) +
    (parsed.callsPerHour?.length || 0) +
    (parsed.productionSubcampaign?.length || 0) +
    (parsed.agentPauseTime?.length || 0) +
    (parsed.campaignCallLog?.length || 0);

  // 4. Insert report metadata (upsert to handle re-uploads)
  // Store ALL parsed data in raw_metadata so we can re-merge when computing across report types
  const rawMetadata: Record<string, unknown> = {};
  if (parsed.agentSummary) rawMetadata.agentSummary = parsed.agentSummary;
  if (parsed.subcampaign) rawMetadata.subcampaign = parsed.subcampaign;
  if (parsed.production) rawMetadata.production = parsed.production;
  if (parsed.campaignSummary) rawMetadata.campaignSummary = parsed.campaignSummary;
  if (parsed.shiftReport) rawMetadata.shiftReport = parsed.shiftReport;
  if (parsed.agentSummarySubcampaign) rawMetadata.agentSummarySubcampaign = parsed.agentSummarySubcampaign;
  if (parsed.agentAnalysis) rawMetadata.agentAnalysis = parsed.agentAnalysis;
  if (parsed.callsPerHour) rawMetadata.callsPerHour = parsed.callsPerHour;
  if (parsed.productionSubcampaign) rawMetadata.productionSubcampaign = parsed.productionSubcampaign;
  if (parsed.agentPauseTime) rawMetadata.agentPauseTime = parsed.agentPauseTime;
  if (parsed.campaignCallLog) rawMetadata.campaignCallLog = parsed.campaignCallLog;

  const { data: reportData, error: reportError } = await supabaseAdmin
    .from('dialedin_reports')
    .upsert(
      {
        filename,
        report_type: reportType,
        report_date: reportDate,
        date_range_start: start ? toISODate(start) : null,
        date_range_end: end ? toISODate(end) : null,
        raw_file_url: rawFileUrl,
        s3_file_key: s3FileKey,
        row_count: rowCount,
        ingestion_source: source,
        ingestion_status: 'processing',
        processed_at: null,
        error_message: null,
        raw_metadata: rawMetadata,
      },
      { onConflict: 'filename,report_type,report_date' },
    )
    .select('id')
    .single();

  if (reportError || !reportData) {
    return { error: `Failed to insert report metadata: ${reportError?.message}` };
  }

  return { parsed, reportId: reportData.id };
}

/**
 * After files for a day have been ingested, check if all 12 report types
 * are present. If complete, run the full KPI computation and store results.
 * If incomplete, return early with checklist status (no computation).
 *
 * Fetches ALL reports for the given date (not just the current batch)
 * so that separate uploads merge correctly.
 */
export async function computeAndStore(
  _reports: ParsedReportData[],
  reportDate: string,
  reportIds: string[],
): Promise<ETLResult | { incomplete: true; checklist: ChecklistStatus }> {
  // Check if all 12 report types are present
  const checklist = await getChecklistStatus(reportDate);

  const isPartial = !checklist.complete;

  // If incomplete and no AgentSummary received yet, just store — can't compute anything
  if (isPartial && !checklist.received.includes('AgentSummary')) {
    const now = new Date().toISOString();
    for (const id of reportIds) {
      await supabaseAdmin
        .from('dialedin_reports')
        .update({ ingestion_status: 'completed', processed_at: now })
        .eq('id', id);
    }
    return { incomplete: true, checklist };
  }

  // Agent Summary available (partial) or all 12 present (full) — run computation
  const { data: allReportsForDate } = await supabaseAdmin
    .from('dialedin_reports')
    .select('id, report_type, raw_metadata')
    .eq('report_date', reportDate)
    .in('ingestion_status', ['processing', 'completed']);

  const mergedReports: ParsedReportData[] = [];
  if (allReportsForDate && allReportsForDate.length > 0) {
    for (const r of allReportsForDate) {
      const meta = r.raw_metadata as Record<string, unknown> | null;
      if (!meta) continue;
      mergedReports.push({
        reportType: r.report_type as ReportType,
        dateLabel: reportDate,
        dateRangeStart: null,
        dateRangeEnd: null,
        filename: '',
        agentSummary: (meta.agentSummary as ParsedReportData['agentSummary']) || undefined,
        subcampaign: (meta.subcampaign as ParsedReportData['subcampaign']) || undefined,
        production: (meta.production as ParsedReportData['production']) || undefined,
        campaignSummary: (meta.campaignSummary as ParsedReportData['campaignSummary']) || undefined,
        shiftReport: (meta.shiftReport as ParsedReportData['shiftReport']) || undefined,
        agentSummarySubcampaign: (meta.agentSummarySubcampaign as ParsedReportData['agentSummarySubcampaign']) || undefined,
        agentAnalysis: (meta.agentAnalysis as ParsedReportData['agentAnalysis']) || undefined,
        callsPerHour: (meta.callsPerHour as ParsedReportData['callsPerHour']) || undefined,
        productionSubcampaign: (meta.productionSubcampaign as ParsedReportData['productionSubcampaign']) || undefined,
        agentPauseTime: (meta.agentPauseTime as ParsedReportData['agentPauseTime']) || undefined,
        campaignCallLog: (meta.campaignCallLog as ParsedReportData['campaignCallLog']) || undefined,
      });
    }
    const allIds = allReportsForDate.map((r) => r.id);
    for (const id of allIds) {
      if (!reportIds.includes(id)) reportIds.push(id);
    }
  }

  const reportsToProcess = mergedReports.length > 0 ? mergedReports : _reports;
  const result = processDay(reportsToProcess, reportDate);

  // Fetch previous day's KPIs for delta computation
  const { data: prevDay } = await supabaseAdmin
    .from('dialedin_daily_kpis')
    .select('total_transfers, transfers_per_hour')
    .lt('report_date', reportDate)
    .order('report_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prevDay) {
    result.dailyKPIs.prev_day_transfers = prevDay.total_transfers;
    result.dailyKPIs.prev_day_tph = prevDay.transfers_per_hour;
    result.dailyKPIs.delta_transfers = result.dailyKPIs.total_transfers - prevDay.total_transfers;
    result.dailyKPIs.delta_tph =
      Math.round((result.dailyKPIs.transfers_per_hour - prevDay.transfers_per_hour) * 100) / 100;
  }

  // Upsert daily KPIs with enrichment data in raw_data
  const { report_date: _, is_partial: _p, ...kpiData } = result.dailyKPIs;
  await supabaseAdmin.from('dialedin_daily_kpis').upsert(
    {
      ...kpiData,
      report_date: reportDate,
      is_partial: isPartial,
      raw_data: result.rawData,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'report_date' },
  );

  // Delete old agent performance for this date then insert fresh
  await supabaseAdmin
    .from('dialedin_agent_performance')
    .delete()
    .eq('report_date', reportDate);

  if (result.agentPerformance.length > 0) {
    for (let i = 0; i < result.agentPerformance.length; i += 100) {
      const batch = result.agentPerformance.slice(i, i + 100);
      await supabaseAdmin.from('dialedin_agent_performance').insert(batch);
    }
  }

  // Delete old skill summary for this date then insert fresh
  await supabaseAdmin
    .from('dialedin_skill_summary')
    .delete()
    .eq('report_date', reportDate);

  if (result.skillSummary.length > 0) {
    await supabaseAdmin.from('dialedin_skill_summary').insert(result.skillSummary);
  }

  // Delete old anomalies for this date then insert fresh
  await supabaseAdmin
    .from('dialedin_anomalies')
    .delete()
    .eq('report_date', reportDate);

  if (result.anomalies.length > 0) {
    await supabaseAdmin.from('dialedin_anomalies').insert(result.anomalies);
  }

  // Mark report records as completed
  const now = new Date().toISOString();
  for (const id of reportIds) {
    await supabaseAdmin
      .from('dialedin_reports')
      .update({ ingestion_status: 'completed', processed_at: now })
      .eq('id', id);
  }

  // Send Slack notification on completion
  await sendCompletionNotification(reportDate, result, isPartial);

  return result;
}

/**
 * Send a Slack notification when reports are analyzed.
 */
async function sendCompletionNotification(reportDate: string, result: ETLResult, isPartial: boolean): Promise<void> {
  const channelId = process.env.DIALEDIN_SLACK_CHANNEL_ID;
  if (!channelId) return;

  const kpi = result.dailyKPIs;
  const sources = (result.rawData.report_sources as Record<string, number>) || {};
  const campAgg = (result.rawData.campaign_aggregate as Record<string, number>) || {};
  const sections = Object.keys(result.rawData).length;

  const dateFormatted = new Date(reportDate + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  const header = isPartial
    ? `*DialedIn Daily Analysis — ${dateFormatted}* (Agent Summary)`
    : `*DialedIn Daily Analysis Complete — ${dateFormatted}*`;
  const subtitle = isPartial
    ? `Agent Summary processed\n`
    : `All 12 reports received and processed\n`;

  const lines = [
    header,
    subtitle,
    `*Agent Summary:* ${kpi.total_agents} agents | ${kpi.total_dials} dials | ${kpi.total_connects} connects | ${kpi.total_transfers} transfers`,
  ];

  if (!isPartial) {
    lines.push(`*Campaigns:* ${campAgg.total_campaigns || 0} campaigns | ${(campAgg.total_system_dials || 0).toLocaleString()} sys dials | ${(campAgg.total_system_connects || 0).toLocaleString()} sys connects`);
    lines.push(`*Pipeline:* ${sources.total_source_rows || 0} source rows → ${sections} analytical sections`);
  }

  lines.push(`\n<${process.env.NEXT_PUBLIC_APP_URL || 'https://pitchvision.io'}/executive/dialedin|View Dashboard>`);

  const text = lines.join('\n');

  try {
    await postSlackMessage(channelId, text);
  } catch (err) {
    console.error('[DialedIn] Slack notification failed:', err);
  }
}

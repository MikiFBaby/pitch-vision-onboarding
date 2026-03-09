import { NextRequest, NextResponse } from 'next/server';
import { processS3Batch } from '@/utils/qa-s3-ingest';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * GET /api/cron/qa-s3-ingest — Vercel cron endpoint
 *
 * Runs every 2 hours. Discovers new recordings in the Chase/DialedIn S3 bucket
 * and submits them to the n8n QA pipeline.
 *
 * Uses the last successful run timestamp to only process new files.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bucket = process.env.QA_RECORDINGS_S3_BUCKET;
  const prefix = process.env.QA_RECORDINGS_S3_PREFIX || '';

  if (!bucket) {
    return NextResponse.json(
      { error: 'QA_RECORDINGS_S3_BUCKET not configured' },
      { status: 500 },
    );
  }

  // Get timestamp of last successful submission for incremental processing
  const { data: lastSubmitted } = await supabaseAdmin
    .from('qa_s3_ingestion_log')
    .select('submitted_at')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Default: look back 24 hours if no previous run
  const since = lastSubmitted?.submitted_at
    ? new Date(lastSubmitted.submitted_at)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const result = await processS3Batch({
      bucket,
      prefix,
      since,
      limit: 200, // Conservative limit per cron run
    });

    console.log(
      `[qa-s3-ingest-cron] Discovered: ${result.discovered}, ` +
      `Submitted: ${result.submitted}, Failed: ${result.failed}, ` +
      `Dupes: ${result.skippedDuplicates}`,
    );

    return NextResponse.json({
      success: true,
      discovered: result.discovered,
      submitted: result.submitted,
      failed: result.failed,
      skippedDuplicates: result.skippedDuplicates,
      skippedNonAudio: result.skippedNonAudio,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[qa-s3-ingest-cron] Error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

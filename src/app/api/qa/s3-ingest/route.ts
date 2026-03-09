import { NextRequest, NextResponse } from 'next/server';
import { processS3Batch, getIngestionStats, type BatchOptions } from '@/utils/qa-s3-ingest';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min — S3 listing + batch submission

/**
 * POST /api/qa/s3-ingest — Trigger S3 recording ingestion
 *
 * Body (JSON):
 *   bucket?:  string — S3 bucket (default: QA_RECORDINGS_S3_BUCKET env)
 *   prefix?:  string — S3 key prefix (default: QA_RECORDINGS_S3_PREFIX env)
 *   since?:   string — ISO date, only process files newer than this
 *   limit?:   number — max files to process (default: 500)
 *   dryRun?:  boolean — list files without submitting to n8n
 *
 * Auth: CRON_SECRET or X-API-Key header
 */
export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  const bucket = body.bucket || process.env.QA_RECORDINGS_S3_BUCKET;
  const prefix = body.prefix || process.env.QA_RECORDINGS_S3_PREFIX || '';

  if (!bucket) {
    return NextResponse.json(
      { error: 'No S3 bucket configured. Set QA_RECORDINGS_S3_BUCKET env var.' },
      { status: 400 },
    );
  }

  const options: BatchOptions = {
    bucket,
    prefix,
    since: body.since ? new Date(body.since) : undefined,
    limit: body.limit ?? 500,
    dryRun: body.dryRun ?? false,
  };

  try {
    const result = await processS3Batch(options);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[qa-s3-ingest] Error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * GET /api/qa/s3-ingest — Return ingestion stats
 */
export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stats = await getIngestionStats();
    return NextResponse.json(stats);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── Auth helper (same pattern as other cron routes) ────────────────

function authorize(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  // Vercel cron sends Bearer token
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  // Allow manual trigger via API key
  const apiKey = request.headers.get('x-api-key');
  if (apiKey && apiKey === cronSecret) return true;

  // In development, allow unauthenticated
  if (process.env.NODE_ENV !== 'production') return true;

  return false;
}

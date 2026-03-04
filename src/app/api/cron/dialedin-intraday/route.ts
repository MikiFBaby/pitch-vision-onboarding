import { NextRequest, NextResponse } from 'next/server';
import { scrapeAndStoreIntraday } from '@/utils/dialedin-scraper';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Cron endpoint — scrapes DialedIn portal for intraday Agent Summary.
 * Runs every 30 min during business hours (9 AM – 8 PM ET, weekdays).
 * Also accepts manual triggers via X-API-Key header.
 */
export async function GET(request: NextRequest) {
  // Auth: Vercel cron secret OR manual API key
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const apiKey = request.headers.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.DIALEDIN_INGEST_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Check if within business hours (9 AM – 8 PM ET)
  const now = new Date();
  const etHour = parseInt(
    now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }),
  );
  const etDay = parseInt(
    now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short' }) === 'Sun'
      ? '0'
      : now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short' }) === 'Sat'
        ? '6'
        : '1', // weekday
  );

  // Allow manual override with ?force=true
  const force = request.nextUrl.searchParams.get('force') === 'true';
  if (!force && (etDay === 0 || etDay === 6 || etHour < 9 || etHour >= 20)) {
    return NextResponse.json({
      skipped: true,
      reason: 'Outside business hours (9 AM – 8 PM ET, Mon–Fri)',
      etHour,
    });
  }

  try {
    const result = await scrapeAndStoreIntraday();

    if (result.success) {
      return NextResponse.json({
        success: true,
        agentCount: result.agentCount,
        durationMs: result.durationMs,
        snapshotAt: result.snapshotAt,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          snapshotAt: result.snapshotAt,
        },
        { status: 500 },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[dialedin-intraday] Unhandled error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { processWebhookEvent } from '@/utils/dialedin-webhook';

export const runtime = 'nodejs';

/**
 * Cron-triggered endpoint that retries failed or stale pending webhook events.
 * Runs every 15 minutes via vercel.json cron.
 *
 * Picks up events that are:
 *   - processing_status = 'failed', OR
 *   - processing_status = 'pending' AND received_at > 5 minutes ago (stale)
 */
export async function GET() {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Fetch failed events and stale pending events
    const { data: events, error } = await supabaseAdmin
      .from('dialedin_webhook_events')
      .select('id, raw_payload, processing_status')
      .or(`processing_status.eq.failed,and(processing_status.eq.pending,received_at.lt.${fiveMinutesAgo})`)
      .order('received_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('[Webhook Retry] Query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!events || events.length === 0) {
      return NextResponse.json({ retried: 0, message: 'No events to retry' });
    }

    let succeeded = 0;
    let failed = 0;

    for (const event of events) {
      try {
        await processWebhookEvent(event.id, event.raw_payload as Record<string, unknown>);
        succeeded++;
      } catch (err) {
        console.error(`[Webhook Retry] Failed to process ${event.id}:`, err);
        failed++;
      }
    }

    return NextResponse.json({
      retried: events.length,
      succeeded,
      failed,
    });
  } catch (err) {
    console.error('[Webhook Retry] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Retry failed' },
      { status: 500 },
    );
  }
}

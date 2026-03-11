import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 120;

const CPA_CALLBACK_WEBHOOK = 'https://n8n.pitchvision.io/webhook/cpa-runpod-callback';
const MAX_RETRIES_PER_RUN = 10;
const DELAY_BETWEEN_RETRIES_MS = 2000;

/**
 * GET /api/cron/cpa-retry-dlq — Retry pending DLQ items
 *
 * Runs every 30 minutes. Picks up pending items under max_retries,
 * re-POSTs callback payload to the CPA callback webhook.
 * On success → resolved. On failure → increments retry_count.
 * Items exceeding max_retries → abandoned.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch pending items that haven't exceeded max retries
  const { data: items, error } = await supabaseAdmin
    .from('cpa_dead_letter_queue')
    .select('*')
    .in('status', ['pending', 'retrying'])
    .order('created_at', { ascending: true })
    .limit(MAX_RETRIES_PER_RUN);

  if (error) {
    console.error('[DLQ-Retry] Query error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!items || items.length === 0) {
    return NextResponse.json({ success: true, message: 'No pending DLQ items', retried: 0 });
  }

  let resolved = 0;
  let failed = 0;
  let abandoned = 0;

  for (const item of items) {
    // Abandon items that exceeded max retries
    if (item.retry_count >= item.max_retries) {
      await supabaseAdmin
        .from('cpa_dead_letter_queue')
        .update({ status: 'abandoned', resolved_at: new Date().toISOString() })
        .eq('id', item.id);
      abandoned++;
      continue;
    }

    if (!item.callback_payload) {
      // No payload to replay — abandon
      await supabaseAdmin
        .from('cpa_dead_letter_queue')
        .update({
          status: 'abandoned',
          error_message: 'No callback_payload available for retry',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', item.id);
      abandoned++;
      continue;
    }

    // Mark as retrying
    await supabaseAdmin
      .from('cpa_dead_letter_queue')
      .update({
        status: 'retrying',
        retry_count: (item.retry_count || 0) + 1,
        last_retry_at: new Date().toISOString(),
      })
      .eq('id', item.id);

    try {
      const resp = await fetch(CPA_CALLBACK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.callback_payload),
      });

      if (resp.ok) {
        await supabaseAdmin
          .from('cpa_dead_letter_queue')
          .update({ status: 'resolved', resolved_at: new Date().toISOString() })
          .eq('id', item.id);
        resolved++;
      } else {
        const errBody = await resp.text().catch(() => '');
        await supabaseAdmin
          .from('cpa_dead_letter_queue')
          .update({
            status: 'pending',
            error_message: `Retry HTTP ${resp.status}: ${errBody.slice(0, 500)}`,
          })
          .eq('id', item.id);
        failed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from('cpa_dead_letter_queue')
        .update({ status: 'pending', error_message: `Retry error: ${msg}` })
        .eq('id', item.id);
      failed++;
    }

    // Delay between retries
    if (DELAY_BETWEEN_RETRIES_MS > 0) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_RETRIES_MS));
    }
  }

  const summary = `DLQ retry: ${resolved} resolved, ${failed} failed, ${abandoned} abandoned (of ${items.length} items)`;
  console.log(`[DLQ-Retry] ${summary}`);

  return NextResponse.json({
    success: true,
    total: items.length,
    resolved,
    failed,
    abandoned,
  });
}

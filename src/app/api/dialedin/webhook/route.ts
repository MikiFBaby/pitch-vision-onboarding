import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildIdempotencyKey, processWebhookEvent } from '@/utils/dialedin-webhook';

export const runtime = 'nodejs';

/**
 * Receives real-time events from DialedIn Integration Portal.
 * Stores raw event immediately, then processes asynchronously.
 *
 * Auth: X-API-Key header or Authorization: Bearer {per-workflow token}
 *
 * Expected body:
 * {
 *   "event_type": "agent_status" | "transfer",
 *   "timestamp": "2026-02-18T14:30:00Z",
 *   "agent_name": "John Smith",
 *   ...event-specific fields
 * }
 */
export async function POST(request: NextRequest) {
  // 1. Authenticate (check multiple header names)
  const apiKey = request.headers.get('X-API-Key')
    || request.headers.get('x-dialedin-secret');
  let authenticated = apiKey === process.env.DIALEDIN_WEBHOOK_SECRET;

  if (!authenticated) {
    const bearerToken = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (bearerToken) {
      const { data: config } = await supabaseAdmin
        .from('dialedin_webhook_config')
        .select('id, event_type')
        .eq('auth_token', bearerToken)
        .eq('is_active', true)
        .maybeSingle();
      authenticated = !!config;
    }
  }

  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 2. Parse and validate
    const payload = await request.json();
    const event_type = payload.event_type || 'call_disposition';
    const timestamp = payload.timestamp || payload.call_date || new Date().toISOString();
    payload.event_type = event_type;
    payload.timestamp = timestamp;

    // 3. Build idempotency key
    const idempotencyKey = buildIdempotencyKey(payload);

    // 4. Store raw event
    const { data: inserted, error } = await supabaseAdmin
      .from('dialedin_webhook_events')
      .insert({
        idempotency_key: idempotencyKey,
        event_type,
        event_subtype: payload.event_subtype || null,
        agent_name: payload.agent_name || payload.from_agent_name || null,
        agent_id: payload.agent_id || payload.from_agent_id || null,
        campaign: payload.campaign || null,
        phone_number: payload.phone_number || null,
        event_timestamp: new Date(timestamp),
        raw_payload: payload,
        source_workflow_id: payload.workflow_id || null,
        source_ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      })
      .select('id')
      .maybeSingle();

    // Duplicate check (unique constraint violation on idempotency_key)
    if (error?.code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    if (error || !inserted) {
      console.error('[Webhook] Insert error:', error);
      return NextResponse.json({ error: 'Storage failed' }, { status: 500 });
    }

    // 5. Respond immediately
    // 6. Process asynchronously (fire and forget)
    processWebhookEvent(inserted.id, payload).catch(err =>
      console.error('[Webhook] Processing error:', err),
    );

    return NextResponse.json({ ok: true, event_id: inserted.id });
  } catch (err) {
    console.error('[Webhook] Request error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Webhook failed' },
      { status: 500 },
    );
  }
}

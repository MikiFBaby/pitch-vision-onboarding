import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

/**
 * Debug/browse endpoint for raw webhook events.
 *
 * Query params:
 *   limit      - max results (default: 50, max: 200)
 *   event_type - filter by event type
 *   agent_name - filter by agent name (partial match)
 *   status     - filter by processing_status
 *   since      - ISO timestamp, only events after this time
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);
  const eventType = searchParams.get('event_type');
  const agentName = searchParams.get('agent_name');
  const status = searchParams.get('status');
  const since = searchParams.get('since');

  try {
    let query = supabaseAdmin
      .from('dialedin_webhook_events')
      .select('id, idempotency_key, event_type, event_subtype, agent_name, agent_id, campaign, phone_number, event_timestamp, received_at, processing_status, processing_error, processed_at, source_workflow_id')
      .order('event_timestamp', { ascending: false })
      .limit(limit);

    if (eventType) {
      query = query.eq('event_type', eventType);
    }
    if (agentName) {
      query = query.ilike('agent_name', `%${agentName}%`);
    }
    if (status) {
      query = query.eq('processing_status', status);
    }
    if (since) {
      query = query.gte('event_timestamp', since);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      count: data?.length || 0,
    });
  } catch (err) {
    console.error('[Webhook Events] Query error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Query failed' },
      { status: 500 },
    );
  }
}

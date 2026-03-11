import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

/**
 * POST /api/qa/dlq — Write a failed CPA callback to the dead letter queue.
 * Called by n8n error handler workflow when callback processing fails.
 *
 * GET /api/qa/dlq — List pending DLQ items (for dashboard).
 *
 * PATCH /api/qa/dlq — Retry a specific DLQ item by ID.
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { data, error } = await supabaseAdmin
      .from('cpa_dead_letter_queue')
      .insert({
        s3_key: body.s3_key || body.file_name || 'unknown',
        batch_id: body.batch_id || null,
        file_name: body.file_name || null,
        agent_name: body.agent_name || null,
        phone_number: body.phone_number || null,
        error_message: body.error_message || body.error || null,
        error_node: body.error_node || null,
        runpod_job_id: body.runpod_job_id || body.job_id || null,
        callback_payload: body.callback_payload || body.payload || null,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[DLQ] Insert error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[DLQ] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status') || 'pending';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);

  const query = supabaseAdmin
    .from('cpa_dead_letter_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (statusFilter !== 'all') {
    query.eq('status', statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Summary counts
  const { data: counts } = await supabaseAdmin
    .from('cpa_dead_letter_queue')
    .select('status')
    .then(({ data }) => {
      const summary: Record<string, number> = {};
      for (const row of data || []) {
        summary[row.status] = (summary[row.status] || 0) + 1;
      }
      return { data: summary };
    });

  return NextResponse.json({
    items: data || [],
    counts: counts || {},
    total: (data || []).length,
  });
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action } = body;

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    if (action === 'abandon') {
      const { error } = await supabaseAdmin
        .from('cpa_dead_letter_queue')
        .update({ status: 'abandoned', resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, action: 'abandoned' });
    }

    // Default: retry — re-POST callback payload to the CPA callback webhook
    const { data: item, error: fetchError } = await supabaseAdmin
      .from('cpa_dead_letter_queue')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (!item.callback_payload) {
      return NextResponse.json({ error: 'No callback payload to replay' }, { status: 400 });
    }

    // Mark as retrying
    await supabaseAdmin
      .from('cpa_dead_letter_queue')
      .update({
        status: 'retrying',
        retry_count: (item.retry_count || 0) + 1,
        last_retry_at: new Date().toISOString(),
      })
      .eq('id', id);

    // Re-POST to callback webhook
    const webhookUrl = 'https://n8n.pitchvision.io/webhook/cpa-runpod-callback';
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item.callback_payload),
    });

    if (resp.ok) {
      await supabaseAdmin
        .from('cpa_dead_letter_queue')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', id);
      return NextResponse.json({ success: true, action: 'retried', httpStatus: resp.status });
    } else {
      const errBody = await resp.text().catch(() => '');
      await supabaseAdmin
        .from('cpa_dead_letter_queue')
        .update({
          status: 'pending',
          error_message: `Retry failed: HTTP ${resp.status} - ${errBody.slice(0, 500)}`,
        })
        .eq('id', id);
      return NextResponse.json({
        success: false,
        action: 'retry_failed',
        httpStatus: resp.status,
        error: errBody.slice(0, 200),
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

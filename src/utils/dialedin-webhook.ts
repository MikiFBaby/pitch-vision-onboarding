/**
 * DialedIn real-time webhook event processing.
 * Handles agent_status and transfer events pushed from DialedIn Integration Portal.
 */
import { supabaseAdmin } from '@/lib/supabase-admin';

// ---------------------------------------------------------------------------
// Idempotency key builder
// ---------------------------------------------------------------------------

export function buildIdempotencyKey(payload: Record<string, unknown>): string {
  const eventType = payload.event_type as string;
  const eventId = payload.event_id as string | undefined;

  // If DialedIn provides a unique event_id, use it directly
  if (eventId) return `${eventType}_${eventId}`;

  // Fallback: build from event fields
  const ts = payload.timestamp as string;
  const agentId = (payload.agent_id || payload.from_agent_id || 'unknown') as string;

  switch (eventType) {
    case 'agent_status':
      return `status_${agentId}_${payload.event_subtype || payload.new_status || 'unknown'}_${ts}`;
    case 'transfer':
      return `xfer_${agentId}_${payload.lead_id || payload.phone_number || 'unknown'}_${ts}`;
    default:
      return `evt_${agentId}_${eventType}_${ts}`;
  }
}

// ---------------------------------------------------------------------------
// Main event processor (called async after webhook response)
// ---------------------------------------------------------------------------

export async function processWebhookEvent(
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const eventType = payload.event_type as string;

  try {
    switch (eventType) {
      case 'agent_status':
        await processAgentStatus(eventId, payload);
        break;
      case 'transfer':
        await processTransfer(eventId, payload);
        break;
      case 'call_disposition':
        await processCallDisposition(eventId, payload);
        break;
      default:
        // Unknown event type — store raw but mark as skipped
        await markEvent(eventId, 'skipped', `Unknown event_type: ${eventType}`);
        return;
    }

    await markEvent(eventId, 'processed');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Webhook] Processing error for ${eventId}:`, message);
    await markEvent(eventId, 'failed', message);
  }
}

// ---------------------------------------------------------------------------
// Agent status handler
// ---------------------------------------------------------------------------

async function processAgentStatus(
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const agentName = payload.agent_name as string;
  const agentId = (payload.agent_id as string) || null;
  const subtype = (payload.event_subtype as string) || (payload.new_status as string) || '';
  const campaign = (payload.campaign as string) || null;
  const breakCode = (payload.break_code as string) || null;
  const newStatus = (payload.new_status as string) || subtype;
  const eventTimestamp = payload.timestamp as string;

  if (!agentName) return;

  const now = new Date(eventTimestamp || Date.now()).toISOString();
  const normalizedStatus = normalizeAgentStatus(subtype, newStatus);

  // Build the upsert data
  const upsertData: Record<string, unknown> = {
    agent_name: agentName,
    agent_id: agentId,
    current_status: normalizedStatus,
    current_campaign: campaign,
    status_since: now,
    last_event_id: eventId,
    updated_at: new Date().toISOString(),
  };

  // On login: reset session counters
  if (subtype === 'login') {
    upsertData.session_start = now;
    upsertData.session_dials = 0;
    upsertData.session_connects = 0;
    upsertData.session_transfers = 0;
    upsertData.session_talk_time_sec = 0;
    upsertData.break_code = null;
  } else if (subtype === 'break_start') {
    upsertData.break_code = breakCode;
  } else if (subtype === 'break_end') {
    upsertData.break_code = null;
  } else if (subtype === 'logout') {
    upsertData.break_code = null;
  }

  // Upsert the agent's live status
  await supabaseAdmin
    .from('dialedin_live_agent_status')
    .upsert(upsertData, { onConflict: 'agent_name' });

  // Recalculate agent counts in live metrics
  await recalculateAgentCounts();
}

// ---------------------------------------------------------------------------
// Transfer handler
// ---------------------------------------------------------------------------

async function processTransfer(
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const fromAgent = (payload.from_agent_name as string) || (payload.agent_name as string) || null;
  const eventTimestamp = payload.timestamp as string;
  const campaign = (payload.campaign as string) || null;

  const today = new Date(eventTimestamp || Date.now()).toISOString().split('T')[0];
  const currentHour = new Date(eventTimestamp || Date.now()).getUTCHours();

  // Upsert __all__ campaign metrics
  await upsertTransferMetrics(today, '__all__', currentHour);

  // Also upsert per-campaign metrics if we know the campaign
  if (campaign) {
    await upsertTransferMetrics(today, campaign, currentHour);
  }

  // Increment session_transfers for the originating agent
  if (fromAgent) {
    const { data: agent } = await supabaseAdmin
      .from('dialedin_live_agent_status')
      .select('session_transfers')
      .eq('agent_name', fromAgent)
      .maybeSingle();

    if (agent) {
      await supabaseAdmin
        .from('dialedin_live_agent_status')
        .update({
          session_transfers: (agent.session_transfers || 0) + 1,
          last_event_id: eventId,
          updated_at: new Date().toISOString(),
        })
        .eq('agent_name', fromAgent);
    }
  }
}

// ---------------------------------------------------------------------------
// Call disposition handler
// ---------------------------------------------------------------------------

async function processCallDisposition(
  eventId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const agentName = (payload.agent_name as string) || null;
  const campaign = (payload.campaign as string) || null;
  const callStatus = (payload.call_status as string) || null;
  const duration = (payload.duration as string) || null;
  const eventTimestamp = payload.timestamp as string;

  const today = new Date(eventTimestamp || Date.now()).toISOString().split('T')[0];
  const currentHour = new Date(eventTimestamp || Date.now()).getUTCHours();

  // Check if this is a transfer disposition
  const isTransfer = callStatus
    ? /transfer|xfer|warm|cold/i.test(callStatus)
    : false;

  if (isTransfer) {
    await upsertTransferMetrics(today, '__all__', currentHour);
    if (campaign) {
      await upsertTransferMetrics(today, campaign, currentHour);
    }
  }

  // Update agent live status with call activity
  if (agentName) {
    const { data: agent } = await supabaseAdmin
      .from('dialedin_live_agent_status')
      .select('session_dials, session_connects, session_transfers, session_talk_time_sec')
      .ilike('agent_name', agentName.trim())
      .maybeSingle();

    if (agent) {
      const durationSec = duration ? parseInt(duration, 10) || 0 : 0;
      const updates: Record<string, unknown> = {
        session_dials: (agent.session_dials || 0) + 1,
        session_talk_time_sec: (agent.session_talk_time_sec || 0) + durationSec,
        current_campaign: campaign,
        last_event_id: eventId,
        updated_at: new Date().toISOString(),
      };
      if (isTransfer) {
        updates.session_transfers = (agent.session_transfers || 0) + 1;
      }
      if (durationSec > 0) {
        updates.session_connects = (agent.session_connects || 0) + 1;
      }

      await supabaseAdmin
        .from('dialedin_live_agent_status')
        .update(updates)
        .ilike('agent_name', agentName.trim());
    } else {
      // Agent not yet in live status — create a row so we track their activity
      await supabaseAdmin
        .from('dialedin_live_agent_status')
        .upsert({
          agent_name: agentName,
          current_status: 'available',
          current_campaign: campaign,
          session_dials: 1,
          session_connects: duration && parseInt(duration, 10) > 0 ? 1 : 0,
          session_transfers: isTransfer ? 1 : 0,
          session_talk_time_sec: duration ? parseInt(duration, 10) || 0 : 0,
          last_event_id: eventId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'agent_name' });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeAgentStatus(subtype: string, rawStatus: string): string {
  const s = (subtype || rawStatus || '').toLowerCase();

  if (s === 'login' || s === 'available' || s === 'ready') return 'available';
  if (s === 'logout' || s === 'offline' || s === 'logged_out') return 'offline';
  if (s === 'break_start' || s === 'paused' || s === 'break' || s === 'pause') return 'paused';
  if (s === 'break_end') return 'available';
  if (s === 'on_call' || s === 'talking' || s === 'incall' || s === 'in_call') return 'on_call';
  if (s === 'wrap' || s === 'wrap_up' || s === 'wrapup' || s === 'after_call') return 'wrap';
  if (s === 'campaign_switch') return 'available';

  // Default: pass through what DialedIn sends
  return rawStatus.toLowerCase() || 'available';
}

async function upsertTransferMetrics(
  metricDate: string,
  campaign: string,
  currentHour: number,
): Promise<void> {
  // Try to fetch existing row
  const { data: existing } = await supabaseAdmin
    .from('dialedin_live_metrics')
    .select('id, total_transfers, transfers_this_hour, hour_bucket')
    .eq('metric_date', metricDate)
    .eq('campaign', campaign)
    .maybeSingle();

  if (existing) {
    // Reset hourly counter if we've moved to a new hour
    const hourlyTransfers =
      existing.hour_bucket === currentHour
        ? (existing.transfers_this_hour || 0) + 1
        : 1;

    await supabaseAdmin
      .from('dialedin_live_metrics')
      .update({
        total_transfers: (existing.total_transfers || 0) + 1,
        transfers_this_hour: hourlyTransfers,
        hour_bucket: currentHour,
        last_event_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await supabaseAdmin
      .from('dialedin_live_metrics')
      .insert({
        metric_date: metricDate,
        campaign,
        total_transfers: 1,
        transfers_this_hour: 1,
        hour_bucket: currentHour,
        last_event_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
  }
}

async function recalculateAgentCounts(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  // Count agents by status
  const { data: statuses } = await supabaseAdmin
    .from('dialedin_live_agent_status')
    .select('current_status');

  if (!statuses) return;

  let active = 0;
  let onBreak = 0;
  let loggedIn = 0;

  for (const row of statuses) {
    if (row.current_status !== 'offline') {
      loggedIn++;
      if (row.current_status === 'paused') {
        onBreak++;
      } else {
        active++;
      }
    }
  }

  // Upsert the __all__ metrics row for today
  const { data: existing } = await supabaseAdmin
    .from('dialedin_live_metrics')
    .select('id')
    .eq('metric_date', today)
    .eq('campaign', '__all__')
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from('dialedin_live_metrics')
      .update({
        agents_active: active,
        agents_on_break: onBreak,
        agents_logged_in: loggedIn,
        last_event_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await supabaseAdmin
      .from('dialedin_live_metrics')
      .insert({
        metric_date: today,
        campaign: '__all__',
        agents_active: active,
        agents_on_break: onBreak,
        agents_logged_in: loggedIn,
        last_event_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
  }
}

async function markEvent(
  eventId: string,
  status: 'processed' | 'failed' | 'skipped',
  error?: string,
): Promise<void> {
  await supabaseAdmin
    .from('dialedin_webhook_events')
    .update({
      processing_status: status,
      processing_error: error || null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', eventId);
}

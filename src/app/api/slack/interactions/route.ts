import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
    verifySlackSignature,
    updateSlackMessage,
    getSlackUserProfile,
} from '@/utils/slack-helpers';
import {
    writeToGoogleSheets,
    postAttendanceSummary,
    type ParsedAttendanceEvent,
} from '@/utils/slack-attendance';

// ---------------------------------------------------------------------------
// POST /api/slack/interactions — Slack Block Kit interactivity handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
    const rawBody = await request.text();

    // 1. Verify Slack signature
    const signingSecret = process.env.SLACK_SIGNING_SECRET || '';
    const signature = request.headers.get('x-slack-signature') || '';
    const timestamp = request.headers.get('x-slack-request-timestamp') || '';

    if (signingSecret && !verifySlackSignature(signingSecret, signature, timestamp, rawBody)) {
        console.error('[Slack Interactions] Signature verification failed');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 2. Parse form-encoded payload
    const params = new URLSearchParams(rawBody);
    const payloadStr = params.get('payload');
    if (!payloadStr) {
        return NextResponse.json({ error: 'Missing payload' }, { status: 400 });
    }

    let payload: any;
    try {
        payload = JSON.parse(payloadStr);
    } catch {
        return NextResponse.json({ error: 'Invalid payload JSON' }, { status: 400 });
    }

    // 3. Extract action
    const action = payload.actions?.[0];
    if (!action) {
        return NextResponse.json({ ok: true });
    }

    const actionId = action.action_id;
    const pendingId = action.value;
    const actingUserId = payload.user?.id;

    console.log(`[Slack Interactions] action=${actionId} pending=${pendingId} user=${actingUserId}`);

    // Dropdown type override changes don't need server action — captured on Confirm click
    if (actionId.startsWith('type_override_')) {
        return NextResponse.json({ ok: true });
    }

    // 4. Look up pending confirmation
    const { data: pending } = await supabaseAdmin
        .from('attendance_pending_confirmations')
        .select('*')
        .eq('id', pendingId)
        .maybeSingle();

    if (!pending) {
        console.warn('[Slack Interactions] Pending confirmation not found:', pendingId);
        return NextResponse.json({ ok: true });
    }

    // 5. Verify the acting user matches
    if (actingUserId !== pending.slack_user_id) {
        console.warn('[Slack Interactions] User mismatch:', actingUserId, '!=', pending.slack_user_id);
        return NextResponse.json({ ok: true });
    }

    // 6. Check if already processed
    if (pending.status !== 'pending') {
        console.log('[Slack Interactions] Already processed:', pending.status);
        return NextResponse.json({ ok: true });
    }

    // 7. Handle actions asynchronously — return 200 immediately to Slack
    if (actionId === 'attendance_confirm') {
        if (pending.message_ts) {
            await updateSlackMessage(pending.slack_channel_id, pending.message_ts, ':hourglass_flowing_sand: Processing...');
        }
        after(() => handleConfirm(pending, pendingId, payload).catch(err =>
            console.error('[Slack Interactions] Confirm error:', err)));
    } else if (actionId === 'attendance_cancel') {
        after(() => handleCancel(pending, pendingId).catch(err =>
            console.error('[Slack Interactions] Cancel error:', err)));
    } else if (actionId === 'attendance_undo') {
        if (pending.message_ts) {
            await updateSlackMessage(pending.slack_channel_id, pending.message_ts, ':hourglass_flowing_sand: Undoing...');
        }
        after(() => handleUndo(pending, pendingId).catch(err =>
            console.error('[Slack Interactions] Undo error:', err)));
    }

    return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Action Handlers
// ---------------------------------------------------------------------------

async function handleConfirm(pending: any, pendingId: string, payload?: any) {
    const events = pending.events as ParsedAttendanceEvent[];

    // Apply type overrides from dropdown selections
    if (payload?.state?.values) {
        const stateValues = payload.state.values;
        events.forEach((evt: any, i: number) => {
            const override = stateValues[`event_${i}`]?.[`type_override_${i}`]?.selected_option?.value;
            if (override && ['planned', 'unplanned'].includes(override)) {
                evt.event_type = override;
            }
        });
    }

    // Get reporter info up-front (needed for both Sheets + Supabase)
    const profile = await getSlackUserProfile(pending.slack_user_id);
    const reporterName = profile?.realName || pending.reported_by_name || 'HR Manager';
    const reportedAt = pending.reported_at || new Date().toISOString();

    // Write to Google Sheets (with reporter info)
    const result = await writeToGoogleSheets(events, pending.slack_user_id, 'add', {
        reportedByName: reporterName,
        reportedAt: reportedAt,
    });

    if (!result.success) {
        if (pending.message_ts) {
            await updateSlackMessage(
                pending.slack_channel_id,
                pending.message_ts,
                `:x: Failed to save attendance: ${result.error || 'Unknown error'}. Please try again.`
            );
        }
        return;
    }

    // Mark as confirmed
    await supabaseAdmin
        .from('attendance_pending_confirmations')
        .update({ status: 'confirmed', resolved_at: new Date().toISOString() })
        .eq('id', pendingId);

    // Insert directly into Supabase for immediate realtime UI update
    // (next Sheets→Supabase sync cycle will cleanly replace these rows)
    if (!result.dry_run) {
        await insertAttendanceEventsToSupabase(events, reporterName, reportedAt);
    }

    // Update Slack message
    const dryRunNote = result.dry_run ? ' _(dry run — not saved to Sheets)_' : '';
    const counts: string[] = [];
    if (result.planned_added > 0) counts.push(`${result.planned_added} planned`);
    if (result.unplanned_added > 0) counts.push(`${result.unplanned_added} unplanned`);
    const countStr = counts.length > 0 ? counts.join(' + ') : 'entries';

    if (pending.message_ts) {
        await updateSlackMessage(
            pending.slack_channel_id,
            pending.message_ts,
            `:white_check_mark: Attendance updated! ${countStr} recorded.${dryRunNote}`
        );
    }

    // Post summary to Slack + Teams channels
    if (!result.dry_run) {
        await postAttendanceSummary(events, reporterName, 'added');
    }
}

async function handleCancel(pending: any, pendingId: string) {
    await supabaseAdmin
        .from('attendance_pending_confirmations')
        .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
        .eq('id', pendingId);

    if (pending.message_ts) {
        await updateSlackMessage(
            pending.slack_channel_id,
            pending.message_ts,
            ':x: Attendance update cancelled.'
        );
    }
}

async function handleUndo(pending: any, pendingId: string) {
    const events = pending.events as ParsedAttendanceEvent[];

    // Delete from Google Sheets
    const result = await writeToGoogleSheets(events, pending.slack_user_id, 'delete');

    if (!result.success) {
        if (pending.message_ts) {
            await updateSlackMessage(
                pending.slack_channel_id,
                pending.message_ts,
                `:x: Failed to undo: ${result.error || 'Unknown error'}. You may need to remove the entries manually from the sheet.`
            );
        }
        return;
    }

    // Mark as undone
    await supabaseAdmin
        .from('attendance_pending_confirmations')
        .update({ status: 'undone', resolved_at: new Date().toISOString() })
        .eq('id', pendingId);

    // Delete from Supabase directly for immediate realtime UI update
    await deleteAttendanceEventsFromSupabase(events);

    if (pending.message_ts) {
        await updateSlackMessage(
            pending.slack_channel_id,
            pending.message_ts,
            ':rewind: Attendance entry has been undone.'
        );
    }

    // Post correction notice
    const profile = await getSlackUserProfile(pending.slack_user_id);
    const reporterName = profile?.realName || 'HR Manager';
    await postAttendanceSummary(events, reporterName, 'removed');
}

// ---------------------------------------------------------------------------
// Direct Supabase writes for realtime UI updates
// (Sheets→Supabase sync will cleanly replace these on next cycle)
// ---------------------------------------------------------------------------

async function insertAttendanceEventsToSupabase(
    events: ParsedAttendanceEvent[],
    reporterName: string,
    reportedAt: string,
) {
    if (events.length === 0) return;

    const rows = events.map(e => ({
        'Agent Name': e.matched_employee_name || e.agent_name,
        'Event Type': e.event_type,
        'Date': e.date,
        'Minutes': e.minutes || null,
        'Reason': e.reason || null,
        'Reported By': reporterName,
        'Reported At': reportedAt,
    }));

    const { error } = await supabaseAdmin
        .from('Attendance Events')
        .insert(rows);

    if (error) {
        console.error('[Attendance] Direct Supabase insert failed (non-fatal):', error);
    } else {
        console.log(`[Attendance] Inserted ${rows.length} events directly to Supabase for realtime`);
    }
}

async function deleteAttendanceEventsFromSupabase(events: ParsedAttendanceEvent[]) {
    for (const e of events) {
        const agentName = e.matched_employee_name || e.agent_name;
        const { error } = await supabaseAdmin
            .from('Attendance Events')
            .delete()
            .eq('Agent Name', agentName)
            .eq('Event Type', e.event_type)
            .eq('Date', e.date);

        if (error) {
            console.error(`[Attendance] Direct Supabase delete failed for ${agentName} (non-fatal):`, error);
        }
    }
}

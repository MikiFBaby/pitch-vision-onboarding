import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifySlackSignature } from '@/utils/slack-helpers';
import {
    ATTENDANCE_SIGNING_SECRET,
    ATTENDANCE_BOT_TOKEN,
    writeToGoogleSheets,
    postAttendanceSummary,
    updateAttendanceBotMessage,
    getAttendanceBotUserProfile,
    type ParsedAttendanceEvent,
} from '@/utils/slack-attendance';
import { executeBulkCleanup } from '@/utils/slack-sam-handlers';

// ---------------------------------------------------------------------------
// POST /api/slack/attendance-interactions — Attendance Bot interactivity handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
    const rawBody = await request.text();

    // 1. Verify Slack signature
    if (ATTENDANCE_SIGNING_SECRET) {
        const signature = request.headers.get('x-slack-signature') || '';
        const timestamp = request.headers.get('x-slack-request-timestamp') || '';
        if (!verifySlackSignature(ATTENDANCE_SIGNING_SECRET, signature, timestamp, rawBody)) {
            console.error('[Attendance Interactions] Signature verification failed');
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
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
    const actingUserId = payload.user?.id;
    const channelId = payload.channel?.id;

    console.log(`[Attendance Interactions] action=${actionId} user=${actingUserId}`);

    // Dropdown type override changes don't need server action — captured on Confirm click
    if (actionId.startsWith('type_override_')) {
        return NextResponse.json({ ok: true });
    }

    // 4. Handle bulk cleanup actions (these don't use the pending table)
    if (actionId === 'bulk_cleanup_confirm') {
        await handleBulkCleanupConfirm(action, channelId, payload);
        return NextResponse.json({ ok: true });
    }
    if (actionId === 'bulk_cleanup_cancel') {
        await handleBulkCleanupCancel(channelId, payload);
        return NextResponse.json({ ok: true });
    }

    // 5. Look up pending confirmation (for attendance actions)
    const pendingId = action.value;
    const { data: pending } = await supabaseAdmin
        .from('attendance_pending_confirmations')
        .select('*')
        .eq('id', pendingId)
        .maybeSingle();

    if (!pending) {
        console.warn('[Attendance Interactions] Pending confirmation not found:', pendingId);
        return NextResponse.json({ ok: true });
    }

    // 6. Verify the acting user matches
    if (actingUserId !== pending.slack_user_id) {
        console.warn('[Attendance Interactions] User mismatch:', actingUserId, '!=', pending.slack_user_id);
        return NextResponse.json({ ok: true });
    }

    // 7. Check if already processed
    if (pending.status !== 'pending') {
        console.log('[Attendance Interactions] Already processed:', pending.status);
        return NextResponse.json({ ok: true });
    }


    // 9. Handle attendance actions asynchronously — return 200 immediately to Slack
    if (actionId === 'attendance_confirm') {
        if (pending.message_ts) {
            await updateAttendanceBotMessage(pending.slack_channel_id, pending.message_ts, ':hourglass_flowing_sand: Processing...');
        }
        after(() => handleConfirm(pending, pendingId, payload).catch(err =>
            console.error('[Attendance Interactions] Confirm error:', err)));
    } else if (actionId === 'attendance_cancel') {
        after(() => handleCancel(pending, pendingId).catch(err =>
            console.error('[Attendance Interactions] Cancel error:', err)));
    } else if (actionId === 'attendance_undo') {
        if (pending.message_ts) {
            await updateAttendanceBotMessage(pending.slack_channel_id, pending.message_ts, ':hourglass_flowing_sand: Undoing...');
        }
        after(() => handleUndo(pending, pendingId).catch(err =>
            console.error('[Attendance Interactions] Undo error:', err)));
    }

    return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Action Handlers
// ---------------------------------------------------------------------------

async function handleConfirm(pending: any, pendingId: string, payload?: any) {
    const events = pending.events as ParsedAttendanceEvent[];
    const confirmedAt = new Date().toISOString();

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

    // Get reporter name — use stored value from processor, fall back to Slack profile
    let reporterName = pending.reported_by_name;
    if (!reporterName) {
        const profile = await getAttendanceBotUserProfile(pending.slack_user_id);
        reporterName = profile?.realName || 'HR Manager';
    }

    const result = await writeToGoogleSheets(events, pending.slack_user_id, 'add', {
        reportedByName: reporterName,
        reportedAt: pending.reported_at || '',
    });

    if (!result.success) {
        if (pending.message_ts) {
            await updateAttendanceBotMessage(
                pending.slack_channel_id,
                pending.message_ts,
                `:x: Failed to save attendance: ${result.error || 'Unknown error'}. Please try again.`
            );
        }
        return;
    }

    await supabaseAdmin
        .from('attendance_pending_confirmations')
        .update({ status: 'confirmed', resolved_at: confirmedAt })
        .eq('id', pendingId);

    // Insert directly into Supabase for immediate realtime UI update
    // (next Sheets→Supabase sync cycle will cleanly replace these rows)
    if (!result.dry_run) {
        await insertAttendanceEventsToSupabase(events, reporterName);
    }

    const dryRunNote = result.dry_run ? ' _(dry run — not saved to Sheets)_' : '';
    const counts: string[] = [];
    if (result.planned_added > 0) counts.push(`${result.planned_added} planned`);
    if (result.unplanned_added > 0) counts.push(`${result.unplanned_added} unplanned`);
    const countStr = counts.length > 0 ? counts.join(' + ') : 'entries';

    if (pending.message_ts) {
        await updateAttendanceBotMessage(
            pending.slack_channel_id,
            pending.message_ts,
            `:white_check_mark: Attendance updated! ${countStr} recorded.${dryRunNote}`
        );
    }

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
        await updateAttendanceBotMessage(
            pending.slack_channel_id,
            pending.message_ts,
            ':x: Attendance update cancelled.'
        );
    }
}

async function handleUndo(pending: any, pendingId: string) {
    const events = pending.events as ParsedAttendanceEvent[];

    const result = await writeToGoogleSheets(events, pending.slack_user_id, 'delete');

    if (!result.success) {
        if (pending.message_ts) {
            await updateAttendanceBotMessage(
                pending.slack_channel_id,
                pending.message_ts,
                `:x: Failed to undo: ${result.error || 'Unknown error'}. You may need to remove the entries manually from the sheet.`
            );
        }
        return;
    }

    await supabaseAdmin
        .from('attendance_pending_confirmations')
        .update({ status: 'undone', resolved_at: new Date().toISOString() })
        .eq('id', pendingId);

    // Delete from Supabase directly for immediate realtime UI update
    await deleteAttendanceEventsFromSupabase(events);

    if (pending.message_ts) {
        await updateAttendanceBotMessage(
            pending.slack_channel_id,
            pending.message_ts,
            ':rewind: Attendance entry has been undone.'
        );
    }

    const profile = await getAttendanceBotUserProfile(pending.slack_user_id);
    const reporterName = profile?.realName || 'HR Manager';
    await postAttendanceSummary(events, reporterName, 'removed');
}

// ---------------------------------------------------------------------------
// Direct Supabase writes for realtime UI updates
// Planned → "Booked Days Off", Unplanned → "Non Booked Days Off"
// (Sheets→Supabase sync will cleanly replace these on next cycle)
// ---------------------------------------------------------------------------

async function insertAttendanceEventsToSupabase(
    events: ParsedAttendanceEvent[],
    reporterName: string,
) {
    if (events.length === 0) return;

    const planned = events.filter(e => e.event_type === 'planned');
    const unplanned = events.filter(e => e.event_type === 'unplanned');

    // Cross-table dedup: remove conflicting entries before inserting.
    // User's confirmed classification wins — an agent can't be in both tables for the same date.
    for (const e of planned) {
        const name = e.matched_employee_name || e.agent_name;
        await supabaseAdmin.from('Non Booked Days Off').delete().eq('Agent Name', name).eq('Date', e.date);
    }
    for (const e of unplanned) {
        const name = e.matched_employee_name || e.agent_name;
        await supabaseAdmin.from('Booked Days Off').delete().eq('Agent Name', name).eq('Date', e.date);
    }

    // Planned → Booked Days Off
    if (planned.length > 0) {
        const rows = planned.map(e => ({
            'Agent Name': e.matched_employee_name || e.agent_name,
            'Date': e.date,
        }));
        const { error } = await supabaseAdmin.from('Booked Days Off').insert(rows);
        if (error) {
            console.error('[Attendance] Booked Days Off insert failed (non-fatal):', error);
        } else {
            console.log(`[Attendance] Inserted ${rows.length} planned → Booked Days Off`);
        }
    }

    // Unplanned → Non Booked Days Off
    if (unplanned.length > 0) {
        const rows = unplanned.map(e => ({
            'Agent Name': e.matched_employee_name || e.agent_name,
            'Reason': e.reason || 'Unplanned absence',
            'Date': e.date,
            'Reported By': reporterName,
        }));
        const { error } = await supabaseAdmin.from('Non Booked Days Off').insert(rows);
        if (error) {
            console.error('[Attendance] Non Booked Days Off insert failed (non-fatal):', error);
        } else {
            console.log(`[Attendance] Inserted ${rows.length} unplanned → Non Booked Days Off`);
        }
    }
}

async function deleteAttendanceEventsFromSupabase(events: ParsedAttendanceEvent[]) {
    for (const e of events) {
        const agentName = e.matched_employee_name || e.agent_name;
        const table = e.event_type === 'planned' ? 'Booked Days Off' : 'Non Booked Days Off';

        const { error } = await supabaseAdmin
            .from(table)
            .delete()
            .eq('Agent Name', agentName)
            .eq('Date', e.date);

        if (error) {
            console.error(`[Attendance] Direct Supabase delete from ${table} failed for ${agentName} (non-fatal):`, error);
        }
    }
}

// ---------------------------------------------------------------------------
// Bulk Cleanup Handlers
// ---------------------------------------------------------------------------

async function handleBulkCleanupConfirm(action: any, channelId: string, payload: any) {
    let parsed: { users: { name: string; slackId: string }[]; channelId: string };
    try {
        parsed = JSON.parse(action.value);
    } catch {
        console.error('[Bulk Cleanup] Failed to parse action value');
        return;
    }

    // Update original message to show processing
    const msgTs = payload.message?.ts;
    if (msgTs && channelId) {
        await updateAttendanceBotMessage(channelId, msgTs, ':hourglass_flowing_sand: Removing terminated employees…');
    }

    const result = await executeBulkCleanup(parsed.users, parsed.channelId, ATTENDANCE_BOT_TOKEN);

    if (msgTs && channelId) {
        await updateAttendanceBotMessage(channelId, msgTs, result);
    }
}

async function handleBulkCleanupCancel(channelId: string, payload: any) {
    const msgTs = payload.message?.ts;
    if (msgTs && channelId) {
        await updateAttendanceBotMessage(channelId, msgTs, ':x: Bulk cleanup cancelled.');
    }
}

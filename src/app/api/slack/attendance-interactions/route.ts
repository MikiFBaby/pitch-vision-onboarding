import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifySlackSignature } from '@/utils/slack-helpers';
import {
    ATTENDANCE_SIGNING_SECRET,
    writeToGoogleSheets,
    postAttendanceSummary,
    postAttendanceBotMessage,
    updateAttendanceBotMessage,
    getAttendanceBotUserProfile,
    PENDING_EXPIRY_MINUTES,
    type ParsedAttendanceEvent,
} from '@/utils/slack-attendance';

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
    const pendingId = action.value;
    const actingUserId = payload.user?.id;

    console.log(`[Attendance Interactions] action=${actionId} pending=${pendingId} user=${actingUserId}`);

    // 4. Look up pending confirmation
    const { data: pending } = await supabaseAdmin
        .from('attendance_pending_confirmations')
        .select('*')
        .eq('id', pendingId)
        .maybeSingle();

    if (!pending) {
        console.warn('[Attendance Interactions] Pending confirmation not found:', pendingId);
        return NextResponse.json({ ok: true });
    }

    // 5. Verify the acting user matches
    if (actingUserId !== pending.slack_user_id) {
        console.warn('[Attendance Interactions] User mismatch:', actingUserId, '!=', pending.slack_user_id);
        return NextResponse.json({ ok: true });
    }

    // 6. Check if already processed
    if (pending.status !== 'pending') {
        console.log('[Attendance Interactions] Already processed:', pending.status);
        return NextResponse.json({ ok: true });
    }

    // 7. Check expiry
    const ageMs = Date.now() - new Date(pending.created_at).getTime();
    if (ageMs > PENDING_EXPIRY_MINUTES * 60 * 1000) {
        await supabaseAdmin
            .from('attendance_pending_confirmations')
            .update({ status: 'expired', resolved_at: new Date().toISOString() })
            .eq('id', pendingId);

        if (pending.message_ts) {
            await updateAttendanceBotMessage(
                pending.slack_channel_id,
                pending.message_ts,
                ':warning: This confirmation has expired. Please send your attendance update again.'
            );
        }
        return NextResponse.json({ ok: true });
    }

    // 8. Handle actions
    if (actionId === 'attendance_confirm') {
        await handleConfirm(pending, pendingId);
    } else if (actionId === 'attendance_cancel') {
        await handleCancel(pending, pendingId);
    } else if (actionId === 'attendance_undo') {
        await handleUndo(pending, pendingId);
    }

    return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Action Handlers
// ---------------------------------------------------------------------------

async function handleConfirm(pending: any, pendingId: string) {
    const events = pending.events as ParsedAttendanceEvent[];

    const result = await writeToGoogleSheets(events, pending.slack_user_id);

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
        .update({ status: 'confirmed', resolved_at: new Date().toISOString() })
        .eq('id', pendingId);

    const dryRunNote = result.dry_run ? ' _(dry run — not saved to Sheets)_' : '';
    const counts: string[] = [];
    if (result.absences_added > 0) counts.push(`${result.absences_added} absence(s)`);
    if (result.attendance_events_added > 0) counts.push(`${result.attendance_events_added} event(s)`);
    const countStr = counts.length > 0 ? counts.join(' and ') : 'entries';

    if (pending.message_ts) {
        await updateAttendanceBotMessage(
            pending.slack_channel_id,
            pending.message_ts,
            `:white_check_mark: Attendance updated! ${countStr} recorded.${dryRunNote}`
        );
    }

    if (!result.dry_run) {
        const profile = await getAttendanceBotUserProfile(pending.slack_user_id);
        const reporterName = profile?.realName || 'HR Manager';
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

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifySlackSignature } from '@/utils/slack-helpers';
import {
    ATTENDANCE_SIGNING_SECRET,
    isAuthorizedForAttendance,
    parseAttendanceMessage,
    resolveAgentNames,
    buildConfirmationBlocks,
    buildUndoBlocks,
    postAttendanceBotMessage,
    UNDO_WINDOW_MINUTES,
} from '@/utils/slack-attendance';

// Force Node.js runtime (not edge) for background processing support
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// POST /api/slack/attendance-events — Attendance Bot Events API webhook
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
    const rawBody = await request.text();
    let payload: any;

    try {
        payload = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // 1. Handle Slack URL verification challenge
    if (payload.type === 'url_verification') {
        return NextResponse.json({ challenge: payload.challenge });
    }

    // 2. Verify Slack signature
    if (ATTENDANCE_SIGNING_SECRET) {
        const signature = request.headers.get('x-slack-signature') || '';
        const timestamp = request.headers.get('x-slack-request-timestamp') || '';
        if (!verifySlackSignature(ATTENDANCE_SIGNING_SECRET, signature, timestamp, rawBody)) {
            console.error('[Attendance Events] Signature verification failed');
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
    }

    // 3. Ignore retries
    const retryNum = request.headers.get('x-slack-retry-num');
    if (retryNum) {
        return NextResponse.json({ ok: true });
    }

    // 4. Process event callbacks
    if (payload.type === 'event_callback') {
        const event = payload.event;

        // Handle DM messages — respond to Slack immediately, process in background
        // Slack requires a response within 3 seconds; AI parsing takes longer
        // waitUntil keeps the function alive after the response is sent
        if (event.type === 'message' && event.channel_type === 'im') {
            if (!event.bot_id && !event.subtype) {
                waitUntil(
                    handleAttendanceDM(event).catch(err =>
                        console.error('[Attendance Events] handleAttendanceDM error:', err)
                    )
                );
            }
            return NextResponse.json({ ok: true });
        }
    }

    return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// DM Handler
// ---------------------------------------------------------------------------

async function handleAttendanceDM(event: {
    user: string;
    channel: string;
    text: string;
}) {
    const { user: slackUserId, channel: channelId, text: messageText } = event;

    console.log(`[Attendance Bot] DM from ${slackUserId}: "${messageText}"`);

    // 1. Authorization check
    const authorized = await isAuthorizedForAttendance(slackUserId);
    if (!authorized) {
        await postAttendanceBotMessage(
            channelId,
            "Sorry, you're not authorized to report attendance events. Please contact HR if you believe this is an error."
        );
        return;
    }

    // 2. Check for undo command
    const normalizedText = messageText.trim().toLowerCase();
    if (['undo', 'undo last', 'cancel last', 'undo last entry'].includes(normalizedText)) {
        await handleUndoRequest(slackUserId, channelId);
        return;
    }

    // 3. AI parsing
    const events = await parseAttendanceMessage(messageText);
    if (events.length === 0) {
        await postAttendanceBotMessage(
            channelId,
            "I couldn't identify any attendance events in your message. Try something like:\n" +
            "• _\"Sarah called out sick today\"_\n" +
            "• _\"John was 15 min late\"_\n" +
            "• _\"Mike left early due to doctor appointment\"_\n" +
            "• _\"NCNS for David Brown\"_\n\n" +
            "You can also type *undo* to undo your last entry."
        );
        return;
    }

    // 4. Name resolution
    const resolvedEvents = await resolveAgentNames(events);

    // 5. Store pending confirmation
    const { data: pending, error: insertError } = await supabaseAdmin
        .from('attendance_pending_confirmations')
        .insert({
            slack_user_id: slackUserId,
            slack_channel_id: channelId,
            events: resolvedEvents,
            status: 'pending',
        })
        .select('id')
        .single();

    if (insertError || !pending) {
        console.error('[Attendance Bot] Failed to store pending confirmation:', insertError);
        await postAttendanceBotMessage(channelId, 'Sorry, something went wrong. Please try again.');
        return;
    }

    // 6. Send confirmation message with Block Kit
    const blocks = buildConfirmationBlocks(resolvedEvents, pending.id);
    const response = await postAttendanceBotMessage(channelId, 'Attendance update confirmation', blocks);

    // 7. Store message_ts for later update
    if (response?.ts) {
        await supabaseAdmin
            .from('attendance_pending_confirmations')
            .update({ message_ts: response.ts })
            .eq('id', pending.id);
    }
}

async function handleUndoRequest(slackUserId: string, channelId: string) {
    const cutoff = new Date(Date.now() - UNDO_WINDOW_MINUTES * 60 * 1000).toISOString();

    const { data: recent } = await supabaseAdmin
        .from('attendance_pending_confirmations')
        .select('*')
        .eq('slack_user_id', slackUserId)
        .eq('status', 'confirmed')
        .gte('resolved_at', cutoff)
        .order('resolved_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!recent) {
        await postAttendanceBotMessage(
            channelId,
            `No confirmed attendance entries found in the last ${UNDO_WINDOW_MINUTES} minutes to undo.`
        );
        return;
    }

    const blocks = buildUndoBlocks(recent.events as any[], recent.id);
    await postAttendanceBotMessage(channelId, 'Undo last attendance entry', blocks);
}

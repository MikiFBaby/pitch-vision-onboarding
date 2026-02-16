import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
    isAuthorizedForAttendance,
    parseAttendanceMessage,
    resolveAgentNames,
    buildConfirmationBlocks,
    buildUndoBlocks,
    postAttendanceBotMessage,
    getAttendanceBotUserProfile,
    classifyMessageIntent,
    handleChannelRemove,
    handleChannelAdd,
    buildHelpMessage,
    UNDO_WINDOW_MINUTES,
} from '@/utils/slack-attendance';

// Force Node.js runtime for reliable execution
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// POST /api/slack/attendance-process — Internal endpoint for DM processing
// Called by /api/slack/attendance-events after it responds to Slack
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
    // Verify internal secret to prevent external access
    const secret = request.headers.get('x-internal-secret');
    const expectedSecret = process.env.ATTENDANCE_WEBHOOK_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user: slackUserId, channel: channelId, text: messageText, ts: messageTs } = await request.json();

    if (!slackUserId || !channelId || !messageText) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Convert Slack ts (Unix epoch with decimal) to ISO timestamp
    const reportedAt = messageTs
        ? new Date(parseFloat(messageTs) * 1000).toISOString()
        : new Date().toISOString();

    console.log(`[Attendance Process] Processing DM from ${slackUserId}: "${messageText}"`);

    try {
        // 1. Authorization check
        const authorized = await isAuthorizedForAttendance(slackUserId);
        if (!authorized) {
            console.log(`[Attendance Process] User ${slackUserId} not authorized`);
            await postAttendanceBotMessage(
                channelId,
                "Sorry, you're not authorized to use this bot. Please contact HR if you believe this is an error."
            );
            return NextResponse.json({ ok: true, result: 'unauthorized' });
        }

        // 2. Check for undo command (fast path, no AI needed)
        const normalizedText = messageText.trim().toLowerCase();
        if (['undo', 'undo last', 'cancel last', 'undo last entry'].includes(normalizedText)) {
            await handleUndoRequest(slackUserId, channelId);
            return NextResponse.json({ ok: true, result: 'undo' });
        }

        // 3. Classify intent with AI
        console.log('[Attendance Process] Classifying intent...');
        const intent = await classifyMessageIntent(messageText);
        console.log(`[Attendance Process] Intent: ${intent.type}`);

        // 4. Route based on intent
        switch (intent.type) {
            case 'help': {
                await postAttendanceBotMessage(channelId, buildHelpMessage());
                return NextResponse.json({ ok: true, result: 'help' });
            }

            case 'greeting': {
                await postAttendanceBotMessage(channelId, intent.text);
                return NextResponse.json({ ok: true, result: 'greeting' });
            }

            case 'unknown': {
                await postAttendanceBotMessage(channelId, intent.text);
                return NextResponse.json({ ok: true, result: 'unknown' });
            }

            case 'channel_remove': {
                console.log(`[Attendance Process] Channel remove request: "${intent.targetName}"`);
                const result = await handleChannelRemove(intent.targetName, channelId);
                await postAttendanceBotMessage(channelId, result);
                return NextResponse.json({ ok: true, result: 'channel_remove' });
            }

            case 'channel_add': {
                console.log(`[Attendance Process] Channel add request: "${intent.targetName}"`);
                const result = await handleChannelAdd(intent.targetName);
                await postAttendanceBotMessage(channelId, result);
                return NextResponse.json({ ok: true, result: 'channel_add' });
            }

            case 'attendance':
            default: {
                return await handleAttendanceFlow(
                    slackUserId, channelId, messageText, reportedAt
                );
            }
        }
    } catch (err) {
        console.error('[Attendance Process] Unhandled error:', err);
        try {
            await postAttendanceBotMessage(channelId, 'Sorry, something went wrong processing your message. Please try again.');
        } catch { /* ignore */ }
        return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// Attendance Flow (extracted from original handler)
// ---------------------------------------------------------------------------

async function handleAttendanceFlow(
    slackUserId: string,
    channelId: string,
    messageText: string,
    reportedAt: string,
) {
    // Resolve reporter name
    const profile = await getAttendanceBotUserProfile(slackUserId);
    const reportedByName = profile?.realName || 'Unknown';

    // AI parsing for attendance events
    console.log('[Attendance Process] Calling AI attendance parser...');
    const events = await parseAttendanceMessage(messageText);
    console.log(`[Attendance Process] AI returned ${events.length} events`);

    if (events.length === 0) {
        await postAttendanceBotMessage(
            channelId,
            "Hmm, I couldn't pick out any attendance events from that. Try something like:\n" +
            "• _\"Sarah called out sick today\"_\n" +
            "• _\"John was 15 min late\"_\n" +
            "• _\"Mike left early due to doctor appointment\"_\n" +
            "• _\"NCNS for David Brown\"_\n\n" +
            "Type *help* to see everything I can do."
        );
        return NextResponse.json({ ok: true, result: 'no_events' });
    }

    // Name resolution
    console.log('[Attendance Process] Resolving agent names...');
    const resolvedEvents = await resolveAgentNames(events);

    // Store pending confirmation
    const { data: pending, error: insertError } = await supabaseAdmin
        .from('attendance_pending_confirmations')
        .insert({
            slack_user_id: slackUserId,
            slack_channel_id: channelId,
            events: resolvedEvents,
            status: 'pending',
            reported_by_name: reportedByName,
            reported_at: reportedAt,
        })
        .select('id')
        .single();

    if (insertError || !pending) {
        console.error('[Attendance Process] Failed to store pending:', insertError);
        await postAttendanceBotMessage(channelId, 'Sorry, something went wrong. Please try again.');
        return NextResponse.json({ ok: false, error: 'db_insert_failed' }, { status: 500 });
    }

    // Send confirmation message with Block Kit
    console.log('[Attendance Process] Sending confirmation blocks...');
    const blocks = buildConfirmationBlocks(resolvedEvents, pending.id);
    const response = await postAttendanceBotMessage(channelId, 'Attendance update confirmation', blocks);

    // Store message_ts for later update
    if (response?.ts) {
        await supabaseAdmin
            .from('attendance_pending_confirmations')
            .update({ message_ts: response.ts })
            .eq('id', pending.id);
    }

    console.log(`[Attendance Process] Complete — ${events.length} events pending confirmation`);
    return NextResponse.json({ ok: true, result: 'pending', count: events.length });
}

// ---------------------------------------------------------------------------
// Undo Handler
// ---------------------------------------------------------------------------

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

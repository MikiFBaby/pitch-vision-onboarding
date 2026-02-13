import { NextRequest, NextResponse } from 'next/server';
import { verifySlackSignature } from '@/utils/slack-helpers';
import { ATTENDANCE_SIGNING_SECRET } from '@/utils/slack-attendance';

// ---------------------------------------------------------------------------
// POST /api/slack/attendance-events — Slack Events API webhook (thin dispatcher)
// Responds to Slack within 3 seconds, then dispatches processing to a separate endpoint
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

    // 4. Process event callbacks — dispatch to processing endpoint
    if (payload.type === 'event_callback') {
        const event = payload.event;

        if (event.type === 'message' && event.channel_type === 'im' && !event.bot_id && !event.subtype) {
            console.log(`[Attendance Bot] DM from ${event.user}: "${event.text}" — dispatching to processor`);

            // Fire-and-forget fetch to processing endpoint (runs as separate serverless invocation)
            const baseUrl = 'https://www.pitchvision.io';

            fetch(`${baseUrl}/api/slack/attendance-process`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-internal-secret': process.env.ATTENDANCE_WEBHOOK_SECRET || '',
                },
                body: JSON.stringify({
                    user: event.user,
                    channel: event.channel,
                    text: event.text,
                }),
            }).catch(err => console.error('[Attendance Events] Failed to dispatch:', err));
        }
    }

    return NextResponse.json({ ok: true });
}

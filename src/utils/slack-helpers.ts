import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Slack Request Verification
// ---------------------------------------------------------------------------

/**
 * Verifies the Slack request signature to ensure the request is authentic.
 * See: https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(
    signingSecret: string,
    signature: string,
    timestamp: string,
    body: string
): boolean {
    // Reject requests older than 5 minutes (replay attack protection)
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
    if (parseInt(timestamp, 10) < fiveMinutesAgo) return false;

    const sigBasestring = `v0:${timestamp}:${body}`;
    const mySignature = 'v0=' + crypto
        .createHmac('sha256', signingSecret)
        .update(sigBasestring, 'utf8')
        .digest('hex');

    const a = Buffer.from(mySignature, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Slack API Helpers
// ---------------------------------------------------------------------------

export interface SlackProfile {
    slackUserId: string;
    realName: string;
    firstName: string;
    lastName: string;
    displayName: string;
    email: string;
    image: string;
    isBot: boolean;
}

/**
 * Fetches a Slack user's profile using the users.info API.
 */
export async function getSlackUserProfile(userId: string, botToken?: string): Promise<SlackProfile | null> {
    const token = botToken || process.env.SLACK_BOT_TOKEN;
    if (!token) throw new Error('SLACK_BOT_TOKEN is not set');

    const res = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!data.ok) {
        console.error('[Slack] users.info failed:', data.error);
        return null;
    }

    const user = data.user;
    const profile = user.profile || {};

    return {
        slackUserId: user.id,
        realName: profile.real_name || user.real_name || '',
        firstName: profile.first_name || '',
        lastName: profile.last_name || '',
        displayName: profile.display_name || '',
        email: profile.email || '',
        image: profile.image_192 || profile.image_72 || '',
        isBot: user.is_bot || user.id === 'USLACKBOT',
    };
}

/**
 * Fetches all members of a Slack channel (paginated).
 * Returns array of Slack user IDs.
 */
export async function getChannelMembers(channelId: string): Promise<string[]> {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) throw new Error('SLACK_BOT_TOKEN is not set');

    const members: string[] = [];
    let cursor = '';

    do {
        const url = `https://slack.com/api/conversations.members?channel=${channelId}&limit=200${cursor ? `&cursor=${cursor}` : ''}`;
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();
        if (!data.ok) {
            console.error('[Slack] conversations.members failed:', data.error);
            break;
        }

        members.push(...(data.members || []));
        cursor = data.response_metadata?.next_cursor || '';
    } while (cursor);

    return members;
}

// ---------------------------------------------------------------------------
// Name Matching
// ---------------------------------------------------------------------------

/**
 * Normalizes a name for fuzzy matching: lowercase, trim, collapse whitespace.
 */
export function normalizeName(name: string): string {
    return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Checks if two names are a match. Handles "First Last" vs "Last, First" formats
 * and partial matches where one might have a middle name.
 */
// ---------------------------------------------------------------------------
// Slack Messaging
// ---------------------------------------------------------------------------

/**
 * Posts a message to a Slack channel or DM.
 * Returns the response including `ts` for later updates.
 */
export async function postSlackMessage(
    channel: string,
    text: string,
    blocks?: any[],
    botToken?: string
): Promise<{ ok: boolean; ts?: string } | null> {
    const token = botToken || process.env.SLACK_BOT_TOKEN;
    if (!token) throw new Error('SLACK_BOT_TOKEN is not set');

    const body: Record<string, any> = { channel, text };
    if (blocks) body.blocks = blocks;

    const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!data.ok) {
        console.error('[Slack] chat.postMessage failed:', data.error);
        return null;
    }
    return { ok: true, ts: data.ts };
}

/**
 * Updates an existing Slack message (e.g., to replace buttons with a result).
 */
export async function updateSlackMessage(
    channel: string,
    ts: string,
    text: string,
    blocks?: any[],
    botToken?: string
): Promise<boolean> {
    const token = botToken || process.env.SLACK_BOT_TOKEN;
    if (!token) throw new Error('SLACK_BOT_TOKEN is not set');

    const body: Record<string, any> = { channel, ts, text };
    if (blocks) body.blocks = blocks;

    const res = await fetch('https://slack.com/api/chat.update', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!data.ok) {
        console.error('[Slack] chat.update failed:', data.error);
        return false;
    }
    return true;
}

/**
 * Posts an Adaptive Card message to a Microsoft Teams channel via Incoming Webhook.
 * Used to mirror attendance summaries to the Teams attendance channel.
 */
export async function postTeamsWebhook(
    title: string,
    text: string,
    facts?: { name: string; value: string }[]
): Promise<boolean> {
    const webhookUrl = process.env.TEAMS_ATTENDANCE_WEBHOOK_URL;
    if (!webhookUrl) {
        console.warn('[Teams] TEAMS_ATTENDANCE_WEBHOOK_URL not set, skipping Teams post');
        return false;
    }

    const card: Record<string, any> = {
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        themeColor: '0076D7',
        summary: title,
        sections: [
            {
                activityTitle: title,
                text,
                ...(facts && facts.length > 0 ? { facts } : {}),
            },
        ],
    };

    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(card),
        });

        if (!res.ok) {
            console.error('[Teams] Webhook failed:', res.status, await res.text());
            return false;
        }
        return true;
    } catch (err) {
        console.error('[Teams] Webhook error:', err);
        return false;
    }
}

// ---------------------------------------------------------------------------
// Name Matching
// ---------------------------------------------------------------------------

export function namesMatch(a: string, b: string): boolean {
    const na = normalizeName(a);
    const nb = normalizeName(b);

    if (!na || !nb) return false;
    if (na === nb) return true;

    // Try "First Last" exact
    const partsA = na.split(' ');
    const partsB = nb.split(' ');

    // Match first + last (ignore middle names)
    if (partsA.length >= 2 && partsB.length >= 2) {
        const firstA = partsA[0], lastA = partsA[partsA.length - 1];
        const firstB = partsB[0], lastB = partsB[partsB.length - 1];
        if (firstA === firstB && lastA === lastB) return true;
    }

    return false;
}

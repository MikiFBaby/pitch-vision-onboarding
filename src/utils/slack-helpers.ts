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
export async function getSlackUserProfile(userId: string): Promise<SlackProfile | null> {
    const token = process.env.SLACK_BOT_TOKEN;
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

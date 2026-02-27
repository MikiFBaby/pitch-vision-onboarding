import { supabaseAdmin } from '@/lib/supabase-admin';
import { namesMatch, postSlackMessage, updateSlackMessage, getSlackUserProfile, postTeamsWebhook, kickFromChannel, inviteToChannel, findChannelMemberByName, joinChannel } from '@/utils/slack-helpers';

// The attendance bot token — separate Slack app from the hire/termination bot
export const ATTENDANCE_BOT_TOKEN = process.env.SLACK_ATTENDANCE_BOT_TOKEN || '';
export const ATTENDANCE_SIGNING_SECRET = process.env.SLACK_ATTENDANCE_SIGNING_SECRET || '';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedAttendanceEvent {
    agent_name: string;
    event_type: 'planned' | 'unplanned';
    date: string; // YYYY-MM-DD
    minutes: number | null;
    reason: string | null;
    matched_employee_name?: string;
    match_confidence?: 'exact' | 'fuzzy' | 'none';
    ambiguous_matches?: string[]; // When first-name-only yields multiple matches
}

export interface PendingConfirmation {
    id: string;
    slack_user_id: string;
    slack_channel_id: string;
    message_ts: string | null;
    events: ParsedAttendanceEvent[];
    status: 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'undone';
    created_at: string;
    resolved_at: string | null;
}

export interface SheetsWriteResult {
    success: boolean;
    planned_added: number;
    unplanned_added: number;
    error?: string;
    dry_run?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const EVENT_TYPE_EMOJI: Record<string, string> = {
    planned: ':palm_tree:',
    unplanned: ':warning:',
    // Legacy types for backward compat
    no_show: ':warning:',
    absent: ':red_circle:',
    late: ':clock3:',
    early_leave: ':arrow_left:',
};

export const EVENT_TYPE_LABEL: Record<string, string> = {
    planned: 'Planned',
    unplanned: 'Unplanned',
    // Legacy types for backward compat
    no_show: 'Unplanned',
    absent: 'Absent',
    late: 'Late',
    early_leave: 'Early Leave',
};

export const LEGACY_TYPE_MAP: Record<string, string> = {
    absent: 'unplanned',
    late: 'unplanned',
    early_leave: 'unplanned',
    no_show: 'unplanned',
};

export const UNDO_WINDOW_MINUTES = 1440; // 24 hours

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

export async function isAuthorizedForAttendance(slackUserId: string): Promise<boolean> {
    // Check env whitelist first (fast, no DB query)
    const whitelist = process.env.SLACK_ATTENDANCE_AUTHORIZED_USERS || '';
    if (whitelist) {
        const authorizedIds = whitelist.split(',').map(id => id.trim()).filter(Boolean);
        if (authorizedIds.includes(slackUserId)) return true;
    }

    // Fallback: check employee_directory role
    const { data: employee } = await supabaseAdmin
        .from('employee_directory')
        .select('role')
        .eq('slack_user_id', slackUserId)
        .maybeSingle();

    if (!employee) return false;

    const role = (employee.role || '').toLowerCase();
    const authorizedRoles = ['hr', 'manager', 'executive', 'president', 'cto', 'owner', 'head of', 'team lead'];
    return authorizedRoles.some(r => role.includes(r));
}

// ---------------------------------------------------------------------------
// AI Parsing with OpenRouter
// ---------------------------------------------------------------------------

export async function parseAttendanceMessage(text: string, conversationContext?: string): Promise<ParsedAttendanceEvent[]> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        console.error('[Attendance] OPENROUTER_API_KEY not configured');
        return [];
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const systemPrompt = `You are an attendance event parser for a call center. Extract structured attendance events from natural language HR messages.

Today's date is ${todayStr}. Yesterday was ${yesterdayStr}.

For each event found, extract:
- agent_name: Full name of the agent as provided (required)
- event_type: One of "planned", "unplanned" (required)
  - "planned" = booked day off, vacation, PTO, scheduled absence, pre-approved leave, taking a day off they arranged in advance
  - "unplanned" = called out sick, car trouble, emergency, came in late, left early, unexpected absence, tardy, any absence that was NOT pre-arranged, no call no show (NCNS), ghosted, didn't show up, abandoned shift
  - DEFAULT RULE: If the message is ambiguous and doesn't clearly indicate a planned/pre-arranged absence (PTO, vacation, booked day off), classify as "unplanned". Most messages are unplanned reports.
- date: The date in YYYY-MM-DD format. "today" = ${todayStr}. "yesterday" = ${yesterdayStr}. If a day name like "Monday" is used, use the most recent past occurrence. If no date is mentioned, default to ${todayStr}. (required)
- minutes: If a duration or lateness is mentioned, extract as minutes. "15 min late" = 15, "an hour late" = 60, "half hour" = 30. If not specified, null.
- reason: The reason if given (e.g., "sick", "car trouble", "doctor appointment", "family emergency", "PTO", "vacation"). If not specified, null.

Return ONLY a JSON array of events. If you cannot parse any valid events from the message, return an empty array [].

Examples:
Input: "Sarah has PTO on Friday"
Output: [{"agent_name":"Sarah","event_type":"planned","date":"${todayStr}","minutes":null,"reason":"PTO"}]

Input: "John called out sick today"
Output: [{"agent_name":"John","event_type":"unplanned","date":"${todayStr}","minutes":null,"reason":"sick"}]

Input: "Mike was 15 min late, and Lisa left early due to a doctor appointment"
Output: [{"agent_name":"Mike","event_type":"unplanned","date":"${todayStr}","minutes":15,"reason":"late"},{"agent_name":"Lisa","event_type":"unplanned","date":"${todayStr}","minutes":null,"reason":"doctor appointment — left early"}]

Input: "NCNS for David Brown yesterday"
Output: [{"agent_name":"David Brown","event_type":"unplanned","date":"${yesterdayStr}","minutes":null,"reason":"no call no show"}]

Input: "Sarah is taking vacation next Monday and Tuesday"
Output: [{"agent_name":"Sarah","event_type":"planned","date":"YYYY-MM-DD","minutes":null,"reason":"vacation"},{"agent_name":"Sarah","event_type":"planned","date":"YYYY-MM-DD","minutes":null,"reason":"vacation"}]

Input: "Hiam Elsayed - tech issue"
Output: [{"agent_name":"Hiam Elsayed","event_type":"unplanned","date":"${todayStr}","minutes":null,"reason":"tech issue"}]

Input: "John Smith - car trouble, Lisa Park - internet down"
Output: [{"agent_name":"John Smith","event_type":"unplanned","date":"${todayStr}","minutes":null,"reason":"car trouble"},{"agent_name":"Lisa Park","event_type":"unplanned","date":"${todayStr}","minutes":null,"reason":"internet down"}]

NOTE: The format "Name - reason" is a common shorthand used by HR. The part before the dash is always the agent name, and the part after is the reason. If the reason doesn't clearly indicate planned (PTO, vacation, booked day off), default to "unplanned".

PRONOUN RESOLUTION: If the message uses pronouns (he, she, they, him, her, them) instead of a name, resolve them using the recent conversation history provided. For example, if the conversation just discussed "Miki Furman" and the user says "he left early today", use "Miki Furman" as the agent_name.

IMPORTANT: Strip conversational greetings and filler words from agent names. Words like "Hey", "Hi", "Hello", "So", "Yeah", "Ok", "Oh" at the start of a message are greetings directed at you, NOT part of the agent's name. For example:
- "Hey Ade is absent today" → agent_name is "Ade", NOT "Hey Ade"
- "Hi, John called out sick" → agent_name is "John", NOT "Hi John"
- "So Sarah has PTO" → agent_name is "Sarah", NOT "So Sarah"`;

    try {
        console.log('[Attendance] Calling OpenRouter model: anthropic/claude-haiku-4.5');
        const parseMessages: { role: string; content: string }[] = [
            { role: 'system', content: systemPrompt },
        ];
        if (conversationContext) {
            parseMessages.push({ role: 'user', content: `Recent conversation:\n${conversationContext}` });
            parseMessages.push({ role: 'assistant', content: 'Understood, I have the conversation context for pronoun resolution.' });
        }
        parseMessages.push({ role: 'user', content: text });

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'anthropic/claude-haiku-4.5',
                messages: parseMessages,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error(`[Attendance] OpenRouter error ${response.status}:`, errBody);
            return [];
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            console.error('[Attendance] No content in OpenRouter response');
            return [];
        }

        // Strip markdown code block wrapper if present
        let jsonStr = content.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
        }

        let parsed = JSON.parse(jsonStr);
        // Handle both direct array and wrapped { events: [...] } formats
        if (!Array.isArray(parsed)) {
            if (parsed.events && Array.isArray(parsed.events)) {
                parsed = parsed.events;
            } else {
                return [];
            }
        }

        // Strip leading greetings/filler that AI may leave on agent names
        const greetingPrefixes = /^(hey|hi|hello|so|yeah|ok|oh|yo|sup)\b[,\s]*/i;

        // Validate and clean events
        return parsed.filter((e: any) =>
            e.agent_name &&
            ['planned', 'unplanned'].includes(e.event_type) &&
            e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date)
        ).map((e: any) => ({
            agent_name: String(e.agent_name).trim().replace(greetingPrefixes, '').trim(),
            event_type: e.event_type as ParsedAttendanceEvent['event_type'],
            date: e.date,
            minutes: typeof e.minutes === 'number' ? e.minutes : null,
            reason: e.reason ? String(e.reason).trim() : null,
        }));
    } catch (err: any) {
        console.error('[Attendance] OpenRouter parsing error:', err?.message || err);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Name Resolution
// ---------------------------------------------------------------------------

/** Simple Levenshtein distance for typo tolerance */
function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
        let prev = i - 1;
        dp[0] = i;
        for (let j = 1; j <= n; j++) {
            const temp = dp[j];
            dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
            prev = temp;
        }
    }
    return dp[n];
}

/** Find closest employee names by edit distance. Returns top N suggestions. */
function findClosestNames(
    input: string,
    employees: { first_name: string; last_name: string }[],
    maxResults: number = 3,
): string[] {
    const inputLower = input.toLowerCase();
    const scored = employees.map(e => {
        const fn = (e.first_name || '').toLowerCase();
        const ln = (e.last_name || '').toLowerCase();
        const full = `${fn} ${ln}`.trim();
        // Best of: distance to full name, first name, or last name
        const distFull = levenshtein(inputLower, full);
        const distFirst = levenshtein(inputLower, fn);
        const distLast = levenshtein(inputLower, ln);
        const bestDist = Math.min(distFull, distFirst, distLast);
        return { name: `${e.first_name} ${e.last_name}`.trim(), dist: bestDist };
    });
    // Only suggest names within a reasonable edit distance (max 3 edits or 40% of input length)
    const threshold = Math.max(3, Math.ceil(inputLower.length * 0.4));
    return scored
        .filter(s => s.dist <= threshold && s.dist > 0)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, maxResults)
        .map(s => s.name);
}

export async function resolveAgentNames(events: ParsedAttendanceEvent[]): Promise<ParsedAttendanceEvent[]> {
    if (events.length === 0) return events;

    // Fetch active employees once
    const { data: employees } = await supabaseAdmin
        .from('employee_directory')
        .select('first_name, last_name')
        .eq('employee_status', 'Active');

    if (!employees || employees.length === 0) return events;

    return events.map(event => {
        const inputName = event.agent_name;
        const inputLower = inputName.toLowerCase();
        const isSingleWord = !inputName.includes(' ');

        // Helper to build a match result
        const matched = (e: typeof employees[0], confidence: 'exact' | 'fuzzy') => ({
            ...event,
            matched_employee_name: `${e.first_name} ${e.last_name}`.trim(),
            match_confidence: confidence,
        });

        const ambiguous = (matches: typeof employees) => ({
            ...event,
            match_confidence: 'none' as const,
            ambiguous_matches: matches.map(m => `${m.first_name} ${m.last_name}`.trim()),
        });

        // Tier 1: Exact full-name match
        const exactMatch = employees.find(e =>
            `${e.first_name} ${e.last_name}`.trim().toLowerCase() === inputLower
        );
        if (exactMatch) return matched(exactMatch, 'exact');

        // Tier 2: Fuzzy match via namesMatch() (handles middle names, compound last names)
        const fuzzyMatch = employees.find(e =>
            namesMatch(`${e.first_name} ${e.last_name}`.trim(), inputName)
        );
        if (fuzzyMatch) return matched(fuzzyMatch, 'fuzzy');

        // Tier 3: First-name exact match (single word input only)
        if (isSingleWord) {
            const firstNameExact = employees.filter(e =>
                (e.first_name || '').toLowerCase() === inputLower
            );
            if (firstNameExact.length === 1) return matched(firstNameExact[0], 'fuzzy');
            if (firstNameExact.length > 1) return ambiguous(firstNameExact);
        }

        // Tier 4: First-name prefix match (e.g., "Ade" → "Adebowale", min 3 chars)
        if (isSingleWord && inputName.length >= 3) {
            const prefixMatches = employees.filter(e =>
                (e.first_name || '').toLowerCase().startsWith(inputLower)
            );
            if (prefixMatches.length === 1) return matched(prefixMatches[0], 'fuzzy');
            if (prefixMatches.length >= 2 && prefixMatches.length <= 5) return ambiguous(prefixMatches);
        }

        // Tier 5: Substring match on first or last name (min 3 chars)
        if (inputName.length >= 3) {
            const substringMatches = employees.filter(e =>
                (e.first_name || '').toLowerCase().includes(inputLower) ||
                (e.last_name || '').toLowerCase().includes(inputLower)
            );
            if (substringMatches.length === 1) return matched(substringMatches[0], 'fuzzy');
            if (substringMatches.length >= 2 && substringMatches.length <= 5) return ambiguous(substringMatches);
        }

        // Tier 6: Close-match suggestions via edit distance (for typos)
        const suggestions = findClosestNames(inputName, employees, 3);
        if (suggestions.length > 0) {
            return {
                ...event,
                match_confidence: 'none' as const,
                ambiguous_matches: suggestions,
            };
        }

        return {
            ...event,
            match_confidence: 'none' as const,
        };
    });
}

// ---------------------------------------------------------------------------
// Block Kit Builders
// ---------------------------------------------------------------------------

const TYPE_DROPDOWN_OPTIONS = [
    { text: { type: 'plain_text' as const, text: ':palm_tree: Planned', emoji: true }, value: 'planned' },
    { text: { type: 'plain_text' as const, text: ':warning: Unplanned', emoji: true }, value: 'unplanned' },
];

export function buildConfirmationBlocks(events: ParsedAttendanceEvent[], pendingId: string): any[] {
    const blocks: any[] = [
        {
            type: 'header',
            text: { type: 'plain_text', text: 'Attendance Update', emoji: true },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: 'I parsed the following from your message. Use the dropdowns to change the type if needed:',
            },
        },
    ];

    events.forEach((e, i) => {
        const name = e.matched_employee_name || e.agent_name;
        const nameWarning = e.match_confidence === 'none' ? ' :warning: _(name not found in directory)_' : '';
        const fuzzyNote = e.match_confidence === 'fuzzy' && e.matched_employee_name !== e.agent_name
            ? ` _(matched from "${e.agent_name}")_`
            : '';

        let detail = '';
        if (e.reason) detail += ` — ${e.reason}`;

        const dateFormatted = formatDateForDisplay(e.date);

        const initialOption = TYPE_DROPDOWN_OPTIONS.find(o => o.value === e.event_type) || TYPE_DROPDOWN_OPTIONS[1];

        blocks.push({
            type: 'section',
            block_id: `event_${i}`,
            text: {
                type: 'mrkdwn',
                text: `*${name}*${fuzzyNote}${nameWarning}${detail} — ${dateFormatted}`,
            },
            accessory: {
                type: 'static_select',
                action_id: `type_override_${i}`,
                initial_option: initialOption,
                options: TYPE_DROPDOWN_OPTIONS,
            },
        });
    });

    blocks.push({
        type: 'actions',
        elements: [
            {
                type: 'button',
                text: { type: 'plain_text', text: 'Confirm All', emoji: true },
                style: 'primary',
                action_id: 'attendance_confirm',
                value: pendingId,
            },
            {
                type: 'button',
                text: { type: 'plain_text', text: 'Cancel', emoji: true },
                style: 'danger',
                action_id: 'attendance_cancel',
                value: pendingId,
            },
        ],
    });

    return blocks;
}

export function buildUndoBlocks(events: ParsedAttendanceEvent[], pendingId: string): any[] {
    const eventLines = events.map(e => {
        const emoji = EVENT_TYPE_EMOJI[e.event_type] || ':question:';
        const name = e.matched_employee_name || e.agent_name;
        const label = EVENT_TYPE_LABEL[e.event_type] || e.event_type;
        const reason = e.reason ? ` — ${e.reason}` : '';
        return `${emoji} *${name}* — ${label}${reason} — ${formatDateForDisplay(e.date)}`;
    });

    return [
        {
            type: 'header',
            text: { type: 'plain_text', text: 'Undo Last Attendance Entry', emoji: true },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: 'Your most recent confirmed entry:',
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: eventLines.join('\n'),
            },
        },
        {
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: { type: 'plain_text', text: 'Undo', emoji: true },
                    style: 'danger',
                    action_id: 'attendance_undo',
                    value: pendingId,
                },
                {
                    type: 'button',
                    text: { type: 'plain_text', text: 'Keep It', emoji: true },
                    action_id: 'attendance_cancel',
                    value: pendingId,
                },
            ],
        },
    ];
}

// ---------------------------------------------------------------------------
// Google Sheets Write
// ---------------------------------------------------------------------------

export async function writeToGoogleSheets(
    events: ParsedAttendanceEvent[],
    reportedBySlackId: string,
    action: 'add' | 'delete' = 'add',
    options?: { reportedByName?: string; reportedAt?: string }
): Promise<SheetsWriteResult> {
    const isDryRun = process.env.ATTENDANCE_DRY_RUN === 'true';

    if (isDryRun) {
        const planned = events.filter(e => e.event_type === 'planned').length;
        const unplanned = events.filter(e => e.event_type === 'unplanned').length;
        console.log('[Attendance DRY RUN] Would write to Sheets:', JSON.stringify(events, null, 2));
        return {
            success: true,
            planned_added: planned,
            unplanned_added: unplanned,
            dry_run: true,
        };
    }

    const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
    const secret = process.env.ATTENDANCE_WEBHOOK_SECRET;

    if (!webhookUrl) {
        return { success: false, planned_added: 0, unplanned_added: 0, error: 'GOOGLE_SHEETS_WEBHOOK_URL not set' };
    }

    // Enrich events with shift start time and campaign
    let shiftMap: Record<string, string> = {};
    let campaignMap: Record<string, string> = {};
    if (action === 'add' && events.length > 0) {
        try {
            // Fetch schedules + campaigns in parallel
            const [schedRes, hiredRes] = await Promise.all([
                supabaseAdmin.from('Agent Schedule').select('*').limit(2000),
                supabaseAdmin.from('HR Hired').select('"Agent Name", "Campaign"'),
            ]);

            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

            // Build shift lookup: agent name → shift time for the event date
            (schedRes.data || []).forEach((row: any) => {
                const fn = (row['First Name'] || '').trim();
                const ln = (row['Last Name'] || '').trim();
                const key = `${fn} ${ln}`.trim().toLowerCase();

                events.forEach(e => {
                    const agentKey = (e.matched_employee_name || e.agent_name).toLowerCase();
                    if (agentKey.includes(fn.toLowerCase()) && agentKey.includes(ln.toLowerCase()) && fn && ln) {
                        const eventDate = new Date(e.date + 'T12:00:00');
                        const dow = dayNames[eventDate.getDay()];
                        const shift = row[dow];
                        if (shift && shift.trim() && shift.trim().toLowerCase() !== 'off') {
                            // Extract start time from "9:00 AM - 5:00 PM" format
                            const startTime = shift.split('-')[0]?.trim() || shift.trim();
                            shiftMap[`${agentKey}|${e.date}`] = startTime;
                        }
                    }
                });
            });

            // Build campaign lookup: agent name → campaign
            (hiredRes.data || []).forEach((row: any) => {
                const name = (row['Agent Name'] || '').trim().toLowerCase();
                if (name && row['Campaign']) {
                    campaignMap[name] = row['Campaign'].trim();
                }
            });
        } catch (err) {
            console.warn('[Attendance] Enrichment lookup failed (non-fatal):', err);
        }
    }

    // Prepare events with display names and metadata for the sheet
    const sheetEvents = events.map(e => {
        const agentName = e.matched_employee_name || e.agent_name;
        const agentKey = agentName.toLowerCase();
        return {
            agent_name: agentName,
            event_type: e.event_type,
            date: e.date,
            minutes: e.minutes,
            reason: e.reason,
            shift_start: shiftMap[`${agentKey}|${e.date}`] || '',
            campaign: campaignMap[agentKey] || '',
            reported_by_name: options?.reportedByName || '',
            reported_at: options?.reportedAt || '',
        };
    });

    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret: secret || '',
                action,
                events: sheetEvents,
            }),
        });

        const data = await res.json();
        if (!data.success) {
            console.error('[Attendance] Sheets write failed:', data.error);
            return { success: false, planned_added: 0, unplanned_added: 0, error: data.error };
        }

        return {
            success: true,
            planned_added: data.planned_added || 0,
            unplanned_added: data.unplanned_added || 0,
        };
    } catch (err: any) {
        console.error('[Attendance] Sheets write error:', err);
        return { success: false, planned_added: 0, unplanned_added: 0, error: err.message };
    }
}

// ---------------------------------------------------------------------------
// Channel Summaries (Slack + Teams)
// ---------------------------------------------------------------------------

export async function postAttendanceSummary(
    events: ParsedAttendanceEvent[],
    reportedByName: string,
    action: 'added' | 'removed' = 'added'
): Promise<void> {
    const channelId = process.env.SLACK_ATTENDANCE_CHANNEL_ID;

    const planned = events.filter(e => e.event_type === 'planned');
    const unplanned = events.filter(e => e.event_type !== 'planned'); // unplanned + legacy no_show

    const verb = action === 'added' ? 'recorded' : 'removed';
    const icon = action === 'added' ? ':clipboard:' : ':rewind:';

    const lines: string[] = [];
    if (planned.length > 0) {
        lines.push(`:palm_tree: *Planned absences ${verb}*: ${planned.map(e => {
            const name = e.matched_employee_name || e.agent_name;
            return e.reason ? `${name} (${e.reason})` : name;
        }).join(', ')}`);
    }
    if (unplanned.length > 0) {
        lines.push(`:warning: *Unplanned absences ${verb}*: ${unplanned.map(e => {
            const name = e.matched_employee_name || e.agent_name;
            return e.reason ? `${name} (${e.reason})` : name;
        }).join(', ')}`);
    }

    const summary = lines.join('\n');
    const slackText = `${icon} *Attendance Update* by ${reportedByName}\n${summary}`;

    // Post to Slack channel
    if (channelId) {
        await postSlackMessage(channelId, slackText).catch(err =>
            console.error('[Attendance] Slack channel post failed:', err)
        );
    }

    // Post to Teams channel
    const teamsFacts = [];
    if (planned.length > 0) teamsFacts.push({ name: `Planned ${verb}`, value: planned.map(e => e.matched_employee_name || e.agent_name).join(', ') });
    if (unplanned.length > 0) teamsFacts.push({ name: `Unplanned ${verb}`, value: unplanned.map(e => e.matched_employee_name || e.agent_name).join(', ') });

    await postTeamsWebhook(
        `Attendance Update by ${reportedByName}`,
        `${events.length} event(s) ${verb}`,
        teamsFacts
    ).catch(err => console.error('[Attendance] Teams post failed:', err));
}

// ---------------------------------------------------------------------------
// Attendance Bot Slack Helpers (use attendance bot token)
// ---------------------------------------------------------------------------

export async function postAttendanceBotMessage(
    channel: string,
    text: string,
    blocks?: any[]
) {
    return postSlackMessage(channel, text, blocks, ATTENDANCE_BOT_TOKEN);
}

export async function updateAttendanceBotMessage(
    channel: string,
    ts: string,
    text: string,
    blocks?: any[]
) {
    return updateSlackMessage(channel, ts, text, blocks, ATTENDANCE_BOT_TOKEN);
}

export async function getAttendanceBotUserProfile(userId: string) {
    return getSlackUserProfile(userId, ATTENDANCE_BOT_TOKEN);
}

/**
 * Fetch recent DM conversation history for context (pronoun resolution, follow-ups).
 * Returns the last N messages as a formatted string, excluding the current message.
 */
export async function getRecentConversation(channelId: string, currentTs: string, limit = 5): Promise<string> {
    try {
        const res = await fetch(`https://slack.com/api/conversations.history?channel=${channelId}&limit=${limit + 1}&latest=${currentTs}&inclusive=false`, {
            headers: { 'Authorization': `Bearer ${ATTENDANCE_BOT_TOKEN}` },
        });
        const data = await res.json();
        if (!data.ok || !data.messages?.length) return '';

        // Build context from recent messages (newest first from Slack, reverse for chronological)
        const lines = data.messages
            .slice(0, limit)
            .reverse()
            .map((m: any) => {
                const who = m.bot_id ? 'Sam' : 'User';
                return `${who}: ${m.text}`;
            });

        return lines.join('\n');
    } catch (err) {
        console.error('[Context] Failed to fetch conversation history:', err);
        return '';
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateForDisplay(isoDate: string): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const parts = isoDate.split('-');
    const day = parseInt(parts[2], 10);
    const month = months[parseInt(parts[1], 10) - 1];
    const year = parts[0];
    return `${month} ${day}, ${year}`;
}

// ---------------------------------------------------------------------------
// Intent Classification
// ---------------------------------------------------------------------------

export type MessageIntent =
    | { type: 'attendance'; text: string }
    | { type: 'channel_remove'; targetName: string; channelRef?: string }
    | { type: 'channel_add'; targetName: string; channelRef?: string }
    | { type: 'employee_lookup'; targetName: string }
    | { type: 'whos_out'; date: string }
    | { type: 'attendance_history'; targetName: string; period: 'today' | 'week' | 'month' }
    | { type: 'schedule_lookup'; targetName: string | null; when: 'now' | 'today' | 'tomorrow' }
    | { type: 'qa_lookup'; targetName: string }
    | { type: 'onboarding_status'; targetName: string }
    | { type: 'bulk_cleanup' }
    | { type: 'directory_update'; targetName: string; field: string; value: string }
    | { type: 'coverage_finder'; targetName: string; date: string }
    | { type: 'help' }
    | { type: 'greeting'; text: string }
    | { type: 'unknown'; text: string };

/**
 * Classifies a DM message into an intent using AI.
 * Routes to the appropriate handler based on intent.
 */
export async function classifyMessageIntent(text: string, conversationContext?: string): Promise<MessageIntent> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return { type: 'attendance', text };

    const normalizedText = text.trim().toLowerCase();

    // Fast path: known simple commands
    if (['undo', 'undo last', 'cancel last', 'undo last entry'].includes(normalizedText)) {
        return { type: 'attendance', text };
    }
    if (['help', 'commands', 'what can you do', 'what do you do'].includes(normalizedText)) {
        return { type: 'help' };
    }

    // Fast-path: "Name - reason" or "Name- reason" pattern (very common HR shorthand)
    // Matches: "Hiam Elsayed - tech issue", "John Smith - sick", "Sarah- car trouble"
    if (/^[A-Za-z][A-Za-z'\- ]{1,40}\s*-\s*\S+/i.test(text.trim())) {
        return { type: 'attendance', text };
    }

    // Fast-path keyword matches
    if (/^who'?s\s+out/i.test(normalizedText) || /^who\s+is\s+out/i.test(normalizedText)) {
        const tomorrow = /tomorrow/i.test(normalizedText);
        const dateMatch = normalizedText.match(/(\d{4}-\d{2}-\d{2})/);
        const date = dateMatch ? dateMatch[1] : tomorrow ? _tomorrowISO() : _todayISO();
        return { type: 'whos_out', date };
    }
    if (/^who'?s\s+working/i.test(normalizedText) || /^who\s+is\s+working/i.test(normalizedText)) {
        const when = /tomorrow/i.test(normalizedText) ? 'tomorrow' as const : 'today' as const;
        return { type: 'schedule_lookup', targetName: null, when };
    }
    if (/^(remove|clean\s*up|kick)\s+(all\s+)?terminated/i.test(normalizedText)) {
        return { type: 'bulk_cleanup' };
    }

    // Compute date context for AI
    const todayStr = _todayISO();
    const tomorrowStr = _tomorrowISO();

    const systemPrompt = `You are a message intent classifier for "Sam", a Slack bot assistant at a call center company.
Classify the user's message into exactly one intent category.
Today's date is ${todayStr}. Tomorrow is ${tomorrowStr}.

Return ONLY a JSON object with these fields:
- "intent": one of the intents listed below
- "target_name": (for intents that involve a person) the person's name mentioned
- "date": (for whos_out, coverage_finder) YYYY-MM-DD date. Default to today if not specified.
- "period": (for attendance_history) one of "today", "week", "month". Default "week".
- "when": (for schedule_lookup) one of "now", "today", "tomorrow". Default "today".
- "field": (for directory_update) the field to update (phone, email, campaign, country, role)
- "value": (for directory_update) the new value
- "reply": (for greeting/unknown) a short, friendly reply from Sam

Intent definitions:
- "attendance": Reporting someone is absent, late, left early, no-showed, or booking PTO/vacation. Examples: "Sarah called out sick", "NCNS for John", "Mike was 15 min late", "Sarah has PTO Friday"
- "channel_remove": Requesting to remove/kick someone from a Slack channel. Examples: "remove THE GRINCH from the channel", "kick John Smith"
- "channel_add": Requesting to add/invite someone to a Slack channel. Examples: "add John to the channel", "invite Sarah Smith"
- "employee_lookup": Asking about who someone is, looking up an employee. Examples: "who is Sarah?", "look up John Smith", "tell me about Mike"
- "whos_out": Asking who is out/absent on a given day. Examples: "who's out today?", "who's off tomorrow?", "absences for 2026-02-20"
- "attendance_history": Asking for a specific person's attendance record over a period. Examples: "attendance for Sarah this week", "John's absences this month", "how has Mike's attendance been?"
- "schedule_lookup": Asking about work schedules. With a name: "what's Sarah's schedule?". Without: "who's working today?", "who's on shift tomorrow?"
- "qa_lookup": Asking about QA scores or evaluations. Examples: "Sarah's QA score?", "how did John do on his last QA?", "QA results for Mike"
- "onboarding_status": Asking about a new hire's onboarding progress. Examples: "how's John's onboarding?", "onboarding status for Sarah"
- "bulk_cleanup": Requesting removal of all terminated employees from the channel. Examples: "remove all terminated employees", "clean up the channel"
- "directory_update": Requesting to update an employee's info. Examples: "update John's phone to 555-1234", "change Sarah's email to sarah@example.com"
- "coverage_finder": Asking who can cover for someone. Examples: "who can cover for Sarah?", "Sarah called out, who's available?", "coverage for John tomorrow"
- "help": Asking what the bot can do
- "greeting": Casual greetings. Examples: "hey", "good morning", "thanks"
- "unknown": Anything that doesn't fit

CONVERSATION CONTEXT: When the message uses pronouns (he, she, they, him, her, them) or references like "that person", resolve them using the recent conversation history provided below. For example, if the user just asked "who is Miki?" and then says "he left early", classify as attendance with target_name "Miki".

For "greeting" and "unknown", provide a short, friendly "reply" in character as Sam.

Examples:
{"intent":"channel_remove","target_name":"THE GRINCH"}
{"intent":"employee_lookup","target_name":"Sarah Jones"}
{"intent":"whos_out","date":"${todayStr}"}
{"intent":"attendance_history","target_name":"John","period":"week"}
{"intent":"schedule_lookup","target_name":"Sarah","when":"today"}
{"intent":"schedule_lookup","target_name":null,"when":"tomorrow"}
{"intent":"qa_lookup","target_name":"Mike"}
{"intent":"onboarding_status","target_name":"New Hire Name"}
{"intent":"directory_update","target_name":"John","field":"phone","value":"555-1234"}
{"intent":"coverage_finder","target_name":"Sarah","date":"${tomorrowStr}"}
{"intent":"bulk_cleanup"}
{"intent":"attendance"}
{"intent":"greeting","reply":"Hey! How can I help?"}`;

    try {
        console.log('[Intent] Calling OpenRouter model: anthropic/claude-haiku-4.5');
        const intentMessages: { role: string; content: string }[] = [
            { role: 'system', content: systemPrompt },
        ];
        if (conversationContext) {
            intentMessages.push({ role: 'user', content: `Recent conversation:\n${conversationContext}` });
            intentMessages.push({ role: 'assistant', content: 'Understood, I have the conversation context.' });
        }
        intentMessages.push({ role: 'user', content: text });

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'anthropic/claude-haiku-4.5',
                messages: intentMessages,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error(`[Intent] OpenRouter error ${response.status}:`, errBody);
            return { type: 'attendance', text };
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) return { type: 'attendance', text };

        // Strip markdown code block wrapper if present
        let jsonStr = content.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
        }

        const parsed = JSON.parse(jsonStr);

        switch (parsed.intent) {
            case 'channel_remove':
                return { type: 'channel_remove', targetName: parsed.target_name || '' };
            case 'channel_add':
                return { type: 'channel_add', targetName: parsed.target_name || '' };
            case 'employee_lookup':
                return { type: 'employee_lookup', targetName: parsed.target_name || '' };
            case 'whos_out':
                return { type: 'whos_out', date: parsed.date || todayStr };
            case 'attendance_history':
                return { type: 'attendance_history', targetName: parsed.target_name || '', period: parsed.period || 'week' };
            case 'schedule_lookup':
                return { type: 'schedule_lookup', targetName: parsed.target_name || null, when: parsed.when || 'today' };
            case 'qa_lookup':
                return { type: 'qa_lookup', targetName: parsed.target_name || '' };
            case 'onboarding_status':
                return { type: 'onboarding_status', targetName: parsed.target_name || '' };
            case 'bulk_cleanup':
                return { type: 'bulk_cleanup' };
            case 'directory_update':
                return { type: 'directory_update', targetName: parsed.target_name || '', field: parsed.field || '', value: parsed.value || '' };
            case 'coverage_finder':
                return { type: 'coverage_finder', targetName: parsed.target_name || '', date: parsed.date || todayStr };
            case 'help':
                return { type: 'help' };
            case 'greeting':
                return { type: 'greeting', text: parsed.reply || 'Hey! How can I help?' };
            case 'unknown':
                return { type: 'unknown', text: parsed.reply || "I'm not sure what you mean. Type *help* to see what I can do." };
            case 'attendance':
            default:
                return { type: 'attendance', text };
        }
    } catch (err: any) {
        console.error('[Intent] Classification error:', err?.message || err);
        return { type: 'attendance', text };
    }
}

function _todayISO(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function _tomorrowISO(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Channel Management Handlers
// ---------------------------------------------------------------------------

const HIRES_CHANNEL_ID = process.env.SLACK_HIRES_CHANNEL_ID || 'C031F6MCS9W';

export async function handleChannelRemove(
    targetName: string,
    channelId: string,
): Promise<string> {
    if (!targetName) {
        return "I need a name to remove. Try: _\"remove John Smith from the channel\"_";
    }

    console.log(`[Channel Mgmt] Looking up "${targetName}" in channel ${HIRES_CHANNEL_ID}`);

    // Ensure Sam is in the channel first (required for kick/member listing)
    await joinChannel(HIRES_CHANNEL_ID, ATTENDANCE_BOT_TOKEN);

    const member = await findChannelMemberByName(HIRES_CHANNEL_ID, targetName, ATTENDANCE_BOT_TOKEN);
    if (!member) {
        return `I couldn't find anyone named *${targetName}* in the channel. Double-check the name and try again.`;
    }

    console.log(`[Channel Mgmt] Found: ${member.realName} (${member.userId}) — kicking`);
    const result = await kickFromChannel(HIRES_CHANNEL_ID, member.userId, ATTENDANCE_BOT_TOKEN);

    if (!result.ok) {
        if (result.error === 'not_in_channel') {
            return `*${member.realName}* is not currently in the channel.`;
        }
        if (result.error === 'cant_kick_self') {
            return "I can't remove myself from the channel!";
        }
        if (result.error === 'missing_scope') {
            return "I don't have permission to remove users. An admin needs to grant me the `channels:manage` scope.";
        }
        return `Failed to remove *${member.realName}*: ${result.error}`;
    }

    return `:white_check_mark: Done! Removed *${member.realName}* (${member.displayName || member.realName}) from the channel.`;
}

export async function handleChannelAdd(
    targetName: string,
    targetSlackId?: string,
): Promise<string> {
    if (!targetName && !targetSlackId) {
        return "I need a name or Slack ID to add. Try: _\"add John Smith to the channel\"_";
    }

    if (targetSlackId) {
        const result = await inviteToChannel(HIRES_CHANNEL_ID, targetSlackId, ATTENDANCE_BOT_TOKEN);
        if (!result.ok) {
            if (result.error === 'already_in_channel') {
                return `That person is already in the channel.`;
            }
            return `Failed to add user: ${result.error}`;
        }
        return `:white_check_mark: Added to the channel!`;
    }

    // Can't easily find a user NOT in the channel by name alone
    // For now, provide guidance
    return `To add someone to the channel, I need their Slack user ID since I can only search within channel members. You can find it by clicking their profile in Slack → "More" → "Copy member ID".`;
}

export function buildHelpMessage(): string {
    return `:wave: *Hi! I'm Sam, your HR & operations assistant.*\n\n` +
        `Here's everything I can do:\n\n` +
        `:clipboard: *Report Attendance*\n` +
        `:one: *Planned Absence* (PTO, vacation, booked day off)\n` +
        `• _\"Sarah has PTO Friday\"_\n` +
        `• _\"John is on vacation Feb 28 – Mar 3\"_\n\n` +
        `:two: *Unplanned Absence* (sick, emergency, NCNS, late)\n` +
        `• _\"Ade is sick today\"_\n` +
        `• _\"NCNS for David Brown\"_\n` +
        `• _\"Mike was 15 min late\"_\n\n` +
        `:mag: *Check Attendance*\n` +
        `• _\"who's out today?\"_ — see all absences for a date\n` +
        `• _\"attendance for Sarah this week\"_ — view someone's history\n` +
        `• *undo* — undo your last entry\n\n` +
        `:bust_in_silhouette: *Employee Lookup*\n` +
        `• _\"who is Sarah?\"_ — look up employee info\n\n` +
        `:calendar: *Schedules*\n` +
        `• _\"who's working today?\"_ — see who's on shift\n` +
        `• _\"what's Sarah's schedule?\"_ — view weekly schedule\n` +
        `• _\"who can cover for Sarah tomorrow?\"_ — find available agents\n\n` +
        `:bar_chart: *QA & Onboarding*\n` +
        `• _\"Sarah's QA score?\"_ — latest QA results\n` +
        `• _\"John's onboarding status?\"_ — onboarding progress\n\n` +
        `:busts_in_silhouette: *Channel Management*\n` +
        `• _\"remove John Smith from the channel\"_\n` +
        `• _\"remove all terminated employees\"_ — bulk cleanup\n\n` +
        `:pencil2: *Directory Updates*\n` +
        `• _\"update John's phone to 555-1234\"_ — update phone, email, campaign, country, role\n\n` +
        `:bulb: _First names work great when they're unique! For common names, add the last name._`;
}

import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { namesMatch, postSlackMessage, updateSlackMessage, getSlackUserProfile, postTeamsWebhook } from '@/utils/slack-helpers';

// The attendance bot token — separate Slack app from the hire/termination bot
export const ATTENDANCE_BOT_TOKEN = process.env.SLACK_ATTENDANCE_BOT_TOKEN || '';
export const ATTENDANCE_SIGNING_SECRET = process.env.SLACK_ATTENDANCE_SIGNING_SECRET || '';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedAttendanceEvent {
    agent_name: string;
    event_type: 'absent' | 'late' | 'early_leave' | 'no_show';
    date: string; // YYYY-MM-DD
    minutes: number | null;
    reason: string | null;
    matched_employee_name?: string;
    match_confidence?: 'exact' | 'fuzzy' | 'none';
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
    absences_added: number;
    attendance_events_added: number;
    error?: string;
    dry_run?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const EVENT_TYPE_EMOJI: Record<string, string> = {
    absent: ':red_circle:',
    late: ':clock3:',
    early_leave: ':arrow_left:',
    no_show: ':no_entry_sign:',
};

export const EVENT_TYPE_LABEL: Record<string, string> = {
    absent: 'Absent',
    late: 'Late',
    early_leave: 'Early Leave',
    no_show: 'No Show',
};

export const PENDING_EXPIRY_MINUTES = 30;
export const UNDO_WINDOW_MINUTES = 15;

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
// AI Parsing with Gemini
// ---------------------------------------------------------------------------

export async function parseAttendanceMessage(text: string): Promise<ParsedAttendanceEvent[]> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('[Attendance] GEMINI_API_KEY not configured');
        return [];
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const prompt = `You are an attendance event parser for a call center. Extract structured attendance events from natural language HR messages.

Today's date is ${todayStr}. Yesterday was ${yesterdayStr}.

For each event found, extract:
- agent_name: Full name of the agent as provided (required)
- event_type: One of "absent", "late", "early_leave", "no_show" (required)
  - "absent" = called out, called in sick, not coming in, taking day off, PTO, vacation, sick day
  - "late" = arrived late, came in late, was tardy, showed up late
  - "early_leave" = left early, leaving early, had to go, cut short
  - "no_show" = no call no show, NCNS, didn't show up, no contact
- date: The date in YYYY-MM-DD format. "today" = ${todayStr}. "yesterday" = ${yesterdayStr}. If a day name like "Monday" is used, use the most recent past occurrence. If no date is mentioned, default to ${todayStr}. (required)
- minutes: For late/early_leave, the number of minutes if mentioned. "15 min late" = 15, "an hour late" = 60, "half hour" = 30. If not specified, null.
- reason: The reason if given (e.g., "sick", "car trouble", "doctor appointment", "family emergency"). If not specified, null.

Return a JSON array of events. If you cannot parse any valid events from the message, return an empty array [].

Examples:
Input: "Sarah called out sick today"
Output: [{"agent_name":"Sarah","event_type":"absent","date":"${todayStr}","minutes":null,"reason":"sick"}]

Input: "John was 15 min late, and Mike left early at 3pm due to a doctor appointment"
Output: [{"agent_name":"John","event_type":"late","date":"${todayStr}","minutes":15,"reason":null},{"agent_name":"Mike","event_type":"early_leave","date":"${todayStr}","minutes":null,"reason":"doctor appointment"}]

Input: "NCNS for David Brown yesterday"
Output: [{"agent_name":"David Brown","event_type":"no_show","date":"${yesterdayStr}","minutes":null,"reason":null}]

Now parse this message:
"${text}"`;

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            generationConfig: {
                responseMimeType: 'application/json',
            },
        });

        const result = await model.generateContent(prompt);
        const response = result.response;
        const jsonText = response.text();

        const parsed = JSON.parse(jsonText);
        if (!Array.isArray(parsed)) return [];

        // Validate and clean events
        return parsed.filter((e: any) =>
            e.agent_name &&
            ['absent', 'late', 'early_leave', 'no_show'].includes(e.event_type) &&
            e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date)
        ).map((e: any) => ({
            agent_name: String(e.agent_name).trim(),
            event_type: e.event_type as ParsedAttendanceEvent['event_type'],
            date: e.date,
            minutes: typeof e.minutes === 'number' ? e.minutes : null,
            reason: e.reason ? String(e.reason).trim() : null,
        }));
    } catch (err) {
        console.error('[Attendance] Gemini parsing error:', err);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Name Resolution
// ---------------------------------------------------------------------------

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

        // Try exact match first
        const exactMatch = employees.find(e => {
            const fullName = `${e.first_name} ${e.last_name}`.trim();
            return fullName.toLowerCase() === inputName.toLowerCase();
        });

        if (exactMatch) {
            return {
                ...event,
                matched_employee_name: `${exactMatch.first_name} ${exactMatch.last_name}`.trim(),
                match_confidence: 'exact' as const,
            };
        }

        // Try fuzzy match via namesMatch()
        const fuzzyMatch = employees.find(e => {
            const fullName = `${e.first_name} ${e.last_name}`.trim();
            return namesMatch(fullName, inputName);
        });

        if (fuzzyMatch) {
            return {
                ...event,
                matched_employee_name: `${fuzzyMatch.first_name} ${fuzzyMatch.last_name}`.trim(),
                match_confidence: 'fuzzy' as const,
            };
        }

        // Try first-name-only match (if input is just a first name)
        if (!inputName.includes(' ')) {
            const firstNameMatches = employees.filter(e =>
                e.first_name.toLowerCase() === inputName.toLowerCase()
            );
            if (firstNameMatches.length === 1) {
                const m = firstNameMatches[0];
                return {
                    ...event,
                    matched_employee_name: `${m.first_name} ${m.last_name}`.trim(),
                    match_confidence: 'fuzzy' as const,
                };
            }
            // Multiple matches for first name — can't disambiguate, keep original
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

export function buildConfirmationBlocks(events: ParsedAttendanceEvent[], pendingId: string): any[] {
    const eventLines = events.map(e => {
        const emoji = EVENT_TYPE_EMOJI[e.event_type] || ':question:';
        const label = EVENT_TYPE_LABEL[e.event_type] || e.event_type;
        const name = e.matched_employee_name || e.agent_name;
        const nameWarning = e.match_confidence === 'none' ? ' :warning: _(name not found in directory)_' : '';
        const fuzzyNote = e.match_confidence === 'fuzzy' && e.matched_employee_name !== e.agent_name
            ? ` _(matched from "${e.agent_name}")_`
            : '';

        let detail = label;
        if (e.minutes) detail += ` (${e.minutes} min)`;
        if (e.reason) detail += ` — ${e.reason}`;

        const dateFormatted = formatDateForDisplay(e.date);

        return `${emoji} *${name}*${fuzzyNote}${nameWarning} — ${detail} — ${dateFormatted}`;
    });

    return [
        {
            type: 'header',
            text: { type: 'plain_text', text: 'Attendance Update', emoji: true },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: 'I parsed the following from your message:',
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
        },
    ];
}

export function buildUndoBlocks(events: ParsedAttendanceEvent[], pendingId: string): any[] {
    const eventLines = events.map(e => {
        const emoji = EVENT_TYPE_EMOJI[e.event_type] || ':question:';
        const name = e.matched_employee_name || e.agent_name;
        const label = EVENT_TYPE_LABEL[e.event_type] || e.event_type;
        return `${emoji} *${name}* — ${label} — ${formatDateForDisplay(e.date)}`;
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
    action: 'add' | 'delete' = 'add'
): Promise<SheetsWriteResult> {
    const isDryRun = process.env.ATTENDANCE_DRY_RUN === 'true';

    if (isDryRun) {
        const absences = events.filter(e => e.event_type === 'absent').length;
        const others = events.length - absences;
        console.log('[Attendance DRY RUN] Would write to Sheets:', JSON.stringify(events, null, 2));
        return {
            success: true,
            absences_added: absences,
            attendance_events_added: others,
            dry_run: true,
        };
    }

    const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
    const secret = process.env.ATTENDANCE_WEBHOOK_SECRET;

    if (!webhookUrl) {
        return { success: false, absences_added: 0, attendance_events_added: 0, error: 'GOOGLE_SHEETS_WEBHOOK_URL not set' };
    }

    // Prepare events with display names for the sheet
    const sheetEvents = events.map(e => ({
        agent_name: e.matched_employee_name || e.agent_name,
        event_type: e.event_type,
        date: e.date,
        minutes: e.minutes,
        reason: e.reason,
        reported_by: reportedBySlackId,
    }));

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
            return { success: false, absences_added: 0, attendance_events_added: 0, error: data.error };
        }

        return {
            success: true,
            absences_added: data.absences_added || 0,
            attendance_events_added: data.attendance_events_added || 0,
        };
    } catch (err: any) {
        console.error('[Attendance] Sheets write error:', err);
        return { success: false, absences_added: 0, attendance_events_added: 0, error: err.message };
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

    const absences = events.filter(e => e.event_type === 'absent');
    const lates = events.filter(e => e.event_type === 'late');
    const earlyLeaves = events.filter(e => e.event_type === 'early_leave');
    const noShows = events.filter(e => e.event_type === 'no_show');

    const verb = action === 'added' ? 'recorded' : 'removed';
    const icon = action === 'added' ? ':clipboard:' : ':rewind:';

    const lines: string[] = [];
    if (absences.length > 0) {
        lines.push(`:red_circle: *Absences ${verb}*: ${absences.map(e => e.matched_employee_name || e.agent_name).join(', ')}`);
    }
    if (lates.length > 0) {
        lines.push(`:clock3: *Lates ${verb}*: ${lates.map(e => {
            const name = e.matched_employee_name || e.agent_name;
            return e.minutes ? `${name} (${e.minutes} min)` : name;
        }).join(', ')}`);
    }
    if (earlyLeaves.length > 0) {
        lines.push(`:arrow_left: *Early leaves ${verb}*: ${earlyLeaves.map(e => e.matched_employee_name || e.agent_name).join(', ')}`);
    }
    if (noShows.length > 0) {
        lines.push(`:no_entry_sign: *No-shows ${verb}*: ${noShows.map(e => e.matched_employee_name || e.agent_name).join(', ')}`);
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
    if (absences.length > 0) teamsFacts.push({ name: `Absences ${verb}`, value: absences.map(e => e.matched_employee_name || e.agent_name).join(', ') });
    if (lates.length > 0) teamsFacts.push({ name: `Lates ${verb}`, value: lates.map(e => e.matched_employee_name || e.agent_name).join(', ') });
    if (earlyLeaves.length > 0) teamsFacts.push({ name: `Early leaves ${verb}`, value: earlyLeaves.map(e => e.matched_employee_name || e.agent_name).join(', ') });
    if (noShows.length > 0) teamsFacts.push({ name: `No-shows ${verb}`, value: noShows.map(e => e.matched_employee_name || e.agent_name).join(', ') });

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

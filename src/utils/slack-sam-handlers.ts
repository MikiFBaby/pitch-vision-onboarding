import { supabaseAdmin } from '@/lib/supabase-admin';
import { namesMatch } from '@/utils/slack-helpers';
import {
    deduplicateBookedOff,
    deduplicateUnplannedOff,
    toTitleCase,
} from '@/lib/hr-utils';
import { EVENT_TYPE_EMOJI, EVENT_TYPE_LABEL } from '@/utils/slack-attendance';

// ---------------------------------------------------------------------------
// Shared Helpers
// ---------------------------------------------------------------------------

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DAY_COLUMNS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/**
 * Resolves a free-text name input to a canonical employee_directory row.
 * Tries: exact first+last → fuzzy via namesMatch → first-name-only.
 * Returns the full employee row or null.
 */
export async function resolveEmployee(
    inputName: string
): Promise<Record<string, any> | null> {
    if (!inputName?.trim()) return null;

    const needle = inputName.trim().toLowerCase();

    // Fetch all active + pending employees (we may need terminated too for some lookups)
    const { data: employees } = await supabaseAdmin
        .from('employee_directory')
        .select('*');

    if (!employees || employees.length === 0) return null;

    // 1. Exact match on full name
    for (const emp of employees) {
        const full = `${emp.first_name || ''} ${emp.last_name || ''}`.trim().toLowerCase();
        if (full === needle) return emp;
    }

    // 2. Fuzzy match via namesMatch
    for (const emp of employees) {
        const full = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
        if (namesMatch(full, inputName)) return emp;
    }

    // 3. First-name-only match (only if unique)
    const firstNameMatches = employees.filter(
        (emp) => (emp.first_name || '').trim().toLowerCase() === needle
    );
    if (firstNameMatches.length === 1) return firstNameMatches[0];

    return null;
}

/**
 * Formats an ISO date string nicely for Slack messages.
 * "2026-02-17" → "Mon, Feb 17, 2026"
 */
export function formatDateNice(isoDate: string): string {
    const d = new Date(isoDate + 'T12:00:00'); // noon to avoid timezone shifts
    if (isNaN(d.getTime())) return isoDate;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Returns today's date as YYYY-MM-DD in local time. */
function todayISO(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Returns tomorrow's date as YYYY-MM-DD. */
function tomorrowISO(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Returns the day-of-week column name for a YYYY-MM-DD date. */
function dayColumnForDate(isoDate: string): string {
    const d = new Date(isoDate + 'T12:00:00');
    return DAY_COLUMNS[d.getDay()];
}

/**
 * Computes a date range based on period keyword.
 * Returns [startDate, endDate] as YYYY-MM-DD.
 */
function periodToDateRange(period: 'today' | 'week' | 'month'): [string, string] {
    const now = new Date();
    const today = todayISO();

    if (period === 'today') return [today, today];

    if (period === 'week') {
        const day = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return [fmt(monday), fmt(sunday)];
    }

    // month
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return [start, end];
}

// ---------------------------------------------------------------------------
// Handler 1: Employee Lookup
// ---------------------------------------------------------------------------

export async function handleEmployeeLookup(targetName: string): Promise<string> {
    if (!targetName?.trim()) {
        return "I need a name to look up. Try: _\"who is Sarah?\"_";
    }

    const emp = await resolveEmployee(targetName);
    if (!emp) {
        return `I couldn't find anyone named *${targetName}* in our directory. Double-check the spelling and try again.`;
    }

    const name = toTitleCase(`${emp.first_name || ''} ${emp.last_name || ''}`.trim());
    const status = emp.employee_status || 'Unknown';
    const statusEmoji = status === 'Active' ? ':large_green_circle:' :
        status === 'Terminated' ? ':red_circle:' :
            status === 'Pending' ? ':yellow_circle:' : ':white_circle:';

    const lines: string[] = [
        `:bust_in_silhouette: *${name}*`,
        '',
        `${statusEmoji} *Status:* ${status}`,
    ];

    if (emp.role) lines.push(`:briefcase: *Role:* ${toTitleCase(emp.role)}`);
    if (emp.campaign) lines.push(`:telephone_receiver: *Campaign:* ${toTitleCase(emp.campaign)}`);
    if (emp.country) lines.push(`:globe_with_meridians: *Country:* ${emp.country}`);
    if (emp.email) lines.push(`:email: *Email:* ${emp.email}`);
    if (emp.phone) lines.push(`:phone: *Phone:* ${emp.phone}`);
    if (emp.hired_at) lines.push(`:calendar: *Hired:* ${formatDateNice(emp.hired_at.split('T')[0])}`);
    if (emp.slack_user_id) lines.push(`:slack: *Slack:* <@${emp.slack_user_id}>`);

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Handler 2: Who's Out
// ---------------------------------------------------------------------------

export async function handleWhosOut(date: string): Promise<string> {
    const targetDate = date || todayISO();
    const dateLabel = targetDate === todayISO() ? 'today' :
        targetDate === tomorrowISO() ? 'tomorrow' :
            formatDateNice(targetDate);

    // Fetch from all 3 absence sources in parallel
    const [bookedRes, unbookedRes, eventsRes] = await Promise.all([
        supabaseAdmin
            .from('Booked Days Off')
            .select('"Agent Name", "Date"')
            .eq('Date', targetDate),
        supabaseAdmin
            .from('Non Booked Days Off')
            .select('"Agent Name", "Date", "Reason"')
            .eq('Date', targetDate),
        supabaseAdmin
            .from('Attendance Events')
            .select('"Agent Name", "Event Type", "Date", "Reason", "Minutes"')
            .eq('Date', targetDate),
    ]);

    // Dedup sheet data
    const booked = deduplicateBookedOff(bookedRes.data || []);
    const unbooked = deduplicateUnplannedOff(unbookedRes.data || []);
    const events = (eventsRes.data || []);

    // Dedup attendance events by Agent Name + Event Type
    const seenEvents = new Set<string>();
    const dedupedEvents = events.filter((e: any) => {
        const key = `${(e['Agent Name'] || '').trim().toLowerCase()}|${e['Event Type'] || ''}`;
        if (seenEvents.has(key)) return false;
        seenEvents.add(key);
        return true;
    });

    // Build grouped output
    const sections: string[] = [];

    // Booked days off (PTO/vacation)
    if (booked.length > 0) {
        const names = booked.map((r: any) => toTitleCase((r['Agent Name'] || '').trim())).sort();
        sections.push(`:palm_tree: *Booked Days Off* (${names.length})\n${names.map(n => `  • ${n}`).join('\n')}`);
    }

    // Unbooked / unplanned absences
    if (unbooked.length > 0) {
        const items = unbooked.map((r: any) => {
            const name = toTitleCase((r['Agent Name'] || '').trim());
            const reason = (r['Reason'] || '').trim();
            return `  • ${name}${reason ? ` — _${reason}_` : ''}`;
        }).sort();
        sections.push(`:warning: *Unplanned Absences* (${unbooked.length})\n${items.join('\n')}`);
    }

    // Attendance events (absent, late, early leave, no-show)
    if (dedupedEvents.length > 0) {
        const grouped: Record<string, string[]> = {};
        for (const e of dedupedEvents) {
            const type = (e['Event Type'] || 'absent') as string;
            const name = toTitleCase((e['Agent Name'] || '').trim());
            const reason = (e['Reason'] || '').trim();
            const mins = e['Minutes'];
            let detail = name;
            if (mins) detail += ` (${mins} min)`;
            if (reason) detail += ` — _${reason}_`;

            const label = EVENT_TYPE_LABEL[type] || type;
            const emoji = EVENT_TYPE_EMOJI[type] || ':grey_question:';
            const key = `${emoji} *${label}*`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(`  • ${detail}`);
        }
        for (const [header, items] of Object.entries(grouped)) {
            sections.push(`${header} (${items.length})\n${items.sort().join('\n')}`);
        }
    }

    const totalOut = booked.length + unbooked.length + dedupedEvents.filter((e: any) => (e['Event Type'] || '') === 'absent' || (e['Event Type'] || '') === 'no_show').length;

    if (sections.length === 0) {
        return `:white_check_mark: No one is reported out for *${dateLabel}*. Full attendance!`;
    }

    const header = `:clipboard: *Who's out ${dateLabel}?*\n`;
    return header + '\n' + sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Handler 3: Attendance History
// ---------------------------------------------------------------------------

export async function handleAttendanceHistory(
    targetName: string,
    period: 'today' | 'week' | 'month'
): Promise<string> {
    if (!targetName?.trim()) {
        return "I need a name. Try: _\"attendance for Sarah this week\"_";
    }

    const emp = await resolveEmployee(targetName);
    if (!emp) {
        return `I couldn't find anyone named *${targetName}* in our directory.`;
    }

    const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
    const displayName = toTitleCase(fullName);
    const [startDate, endDate] = periodToDateRange(period);

    const periodLabel = period === 'today' ? 'today' :
        period === 'week' ? `this week (${formatDateNice(startDate)} – ${formatDateNice(endDate)})` :
            `this month (${formatDateNice(startDate)} – ${formatDateNice(endDate)})`;

    // Fetch all 3 sources, filtering by date range
    // For sheet tables we need to match Agent Name (case-insensitive is tricky — fetch all in range, then filter)
    const [bookedRes, unbookedRes, eventsRes] = await Promise.all([
        supabaseAdmin
            .from('Booked Days Off')
            .select('"Agent Name", "Date"')
            .gte('Date', startDate)
            .lte('Date', endDate),
        supabaseAdmin
            .from('Non Booked Days Off')
            .select('"Agent Name", "Date", "Reason"')
            .gte('Date', startDate)
            .lte('Date', endDate),
        supabaseAdmin
            .from('Attendance Events')
            .select('"Agent Name", "Event Type", "Date", "Reason", "Minutes"')
            .gte('Date', startDate)
            .lte('Date', endDate),
    ]);

    // Dedup
    const booked = deduplicateBookedOff(bookedRes.data || []);
    const unbooked = deduplicateUnplannedOff(unbookedRes.data || []);
    const events = eventsRes.data || [];

    // Filter by name match
    const matchName = (agentName: string) => namesMatch(agentName, fullName);

    const myBooked = booked.filter((r: any) => matchName(r['Agent Name'] || ''));
    const myUnbooked = unbooked.filter((r: any) => matchName(r['Agent Name'] || ''));
    const myEvents = events.filter((e: any) => matchName(e['Agent Name'] || ''));

    // Dedup attendance events
    const seenEvents = new Set<string>();
    const dedupedMyEvents = myEvents.filter((e: any) => {
        const key = `${(e['Date'] || '')}|${e['Event Type'] || ''}`;
        if (seenEvents.has(key)) return false;
        seenEvents.add(key);
        return true;
    });

    // Build chronological timeline
    interface TimelineEntry {
        date: string;
        emoji: string;
        label: string;
        detail: string;
    }

    const timeline: TimelineEntry[] = [];

    for (const r of myBooked) {
        timeline.push({
            date: r['Date'] || '',
            emoji: ':palm_tree:',
            label: 'Booked Off',
            detail: '',
        });
    }

    for (const r of myUnbooked) {
        timeline.push({
            date: r['Date'] || '',
            emoji: ':warning:',
            label: 'Unplanned Absence',
            detail: (r['Reason'] || '').trim(),
        });
    }

    for (const e of dedupedMyEvents) {
        const type = (e['Event Type'] || 'absent') as string;
        const mins = e['Minutes'];
        const reason = (e['Reason'] || '').trim();
        let detail = '';
        if (mins) detail += `${mins} min`;
        if (reason) detail += detail ? ` — ${reason}` : reason;

        timeline.push({
            date: e['Date'] || '',
            emoji: EVENT_TYPE_EMOJI[type] || ':grey_question:',
            label: EVENT_TYPE_LABEL[type] || type,
            detail,
        });
    }

    if (timeline.length === 0) {
        return `:white_check_mark: *${displayName}* has no attendance events for ${periodLabel}. Clean record!`;
    }

    // Sort by date
    timeline.sort((a, b) => a.date.localeCompare(b.date));

    const lines = timeline.map(t => {
        const dateStr = formatDateNice(t.date);
        return `${t.emoji} *${dateStr}* — ${t.label}${t.detail ? ` (${t.detail})` : ''}`;
    });

    const header = `:clipboard: *Attendance history for ${displayName}* — ${periodLabel}\n`;
    return header + '\n' + lines.join('\n');
}

// ---------------------------------------------------------------------------
// Handler 4: Schedule Lookup
// ---------------------------------------------------------------------------

export async function handleScheduleLookup(
    targetName: string | null,
    when: 'now' | 'today' | 'tomorrow'
): Promise<string> {
    const targetDate = when === 'tomorrow' ? tomorrowISO() : todayISO();
    const dayCol = dayColumnForDate(targetDate);
    const dayLabel = when === 'tomorrow' ? 'tomorrow' : 'today';

    // If a specific name is given, show their weekly schedule
    if (targetName) {
        const emp = await resolveEmployee(targetName);
        if (!emp) {
            return `I couldn't find anyone named *${targetName}* in our directory.`;
        }

        const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
        const displayName = toTitleCase(fullName);

        // Fetch agent schedule — match by first + last name
        const { data: schedRows } = await supabaseAdmin
            .from('Agent Schedule')
            .select('*')
            .ilike('First Name', (emp.first_name || '').trim())
            .ilike('Last Name', (emp.last_name || '').trim())
            .limit(5);

        if (!schedRows || schedRows.length === 0) {
            return `I couldn't find a schedule entry for *${displayName}*. They may not have a schedule in the system yet.`;
        }

        const sched = schedRows[0];
        const todayDayCol = dayColumnForDate(todayISO());

        const grid = DAY_COLUMNS.map((day) => {
            const shift = (sched[day] || 'OFF').trim();
            const isToday = day === todayDayCol;
            const marker = isToday ? ' :point_left: _today_' : '';
            const shiftDisplay = shift.toLowerCase() === 'off' ? '_OFF_' : shift;
            return `  *${day.substring(0, 3)}:* ${shiftDisplay}${marker}`;
        });

        return `:calendar: *Schedule for ${displayName}*\n\n${grid.join('\n')}`;
    }

    // No name given — show who's working today/tomorrow
    // 1. Get active agents
    const { data: activeAgents } = await supabaseAdmin
        .from('employee_directory')
        .select('first_name, last_name')
        .eq('employee_status', 'Active')
        .eq('role', 'Agent');

    if (!activeAgents || activeAgents.length === 0) {
        return `No active agents found in the directory.`;
    }

    // 2. Fetch all schedule rows (paginated)
    const allSchedules: any[] = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    while (true) {
        const { data: page } = await supabaseAdmin
            .from('Agent Schedule')
            .select(`"First Name", "Last Name", "${dayCol}"`)
            .range(from, from + PAGE_SIZE - 1);
        if (!page || page.length === 0) break;
        allSchedules.push(...page);
        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    // 3. Cross-reference: find active agents who are scheduled (shift != OFF / empty)
    const working: { name: string; shift: string }[] = [];
    const off: string[] = [];

    for (const agent of activeAgents) {
        const agentFull = `${agent.first_name || ''} ${agent.last_name || ''}`.trim();
        const schedRow = allSchedules.find((s: any) => {
            const schedFull = `${(s['First Name'] || '').trim()} ${(s['Last Name'] || '').trim()}`.trim();
            return namesMatch(schedFull, agentFull);
        });

        if (!schedRow) continue; // no schedule found

        const shift = (schedRow[dayCol] || '').trim();
        if (!shift || shift.toLowerCase() === 'off') {
            off.push(toTitleCase(agentFull));
        } else {
            working.push({ name: toTitleCase(agentFull), shift });
        }
    }

    // Group by shift time
    const shiftGroups: Record<string, string[]> = {};
    for (const w of working) {
        if (!shiftGroups[w.shift]) shiftGroups[w.shift] = [];
        shiftGroups[w.shift].push(w.name);
    }

    const sections: string[] = [];
    const sortedShifts = Object.keys(shiftGroups).sort();

    for (const shift of sortedShifts) {
        const names = shiftGroups[shift].sort();
        sections.push(`:clock9: *${shift}* (${names.length})\n${names.map(n => `  • ${n}`).join('\n')}`);
    }

    const header = `:briefcase: *Who's working ${dayLabel} (${dayCol})?* — ${working.length} agents scheduled\n`;

    if (sections.length === 0) {
        return `${header}\nNo agents found with schedules for ${dayLabel}.`;
    }

    return header + '\n' + sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Handler 5: QA Lookup
// ---------------------------------------------------------------------------

export async function handleQALookup(targetName: string): Promise<string> {
    if (!targetName?.trim()) {
        return "I need a name. Try: _\"Sarah's QA score?\"_";
    }

    const emp = await resolveEmployee(targetName);
    if (!emp) {
        return `I couldn't find anyone named *${targetName}* in our directory.`;
    }

    const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
    const displayName = toTitleCase(fullName);

    // QA Results uses agent_name column (snake_case table)
    // Try matching by full name
    const { data: qaResults } = await supabaseAdmin
        .from('QA Results')
        .select('*')
        .order('call_date', { ascending: false })
        .limit(100);

    if (!qaResults || qaResults.length === 0) {
        return `No QA results found in the system.`;
    }

    // Filter by name match
    const myResults = qaResults.filter((r: any) =>
        namesMatch(r.agent_name || '', fullName)
    );

    if (myResults.length === 0) {
        return `No QA results found for *${displayName}*. They may not have been evaluated yet.`;
    }

    const latest = myResults[0];
    const last5 = myResults.slice(0, 5);
    const avgScore = last5.reduce((sum: number, r: any) => sum + (r.compliance_score || 0), 0) / last5.length;

    const lines: string[] = [
        `:bar_chart: *QA Results for ${displayName}*`,
        '',
        `*Latest Evaluation*`,
        `  :clipboard: *Score:* ${latest.compliance_score ?? 'N/A'}/100`,
    ];

    if (latest.auto_fail_triggered) {
        const reasons = Array.isArray(latest.auto_fail_reasons)
            ? latest.auto_fail_reasons.map((r: any) => typeof r === 'string' ? r : r.code || r.reason || JSON.stringify(r)).join(', ')
            : '';
        lines.push(`  :rotating_light: *Auto-Fail:* Yes${reasons ? ` (${reasons})` : ''}`);
    } else {
        lines.push(`  :white_check_mark: *Auto-Fail:* No`);
    }

    if (latest.call_date) lines.push(`  :calendar: *Call Date:* ${formatDateNice(latest.call_date)}`);
    if (latest.product_type) lines.push(`  :label: *Product:* ${latest.product_type}`);
    if (latest.summary) {
        const summaryTruncated = latest.summary.length > 200
            ? latest.summary.substring(0, 200) + '…'
            : latest.summary;
        lines.push(`  :memo: *Summary:* ${summaryTruncated}`);
    }

    if (last5.length > 1) {
        lines.push('');
        lines.push(`*Last ${last5.length} evaluations average:* ${Math.round(avgScore)}/100`);

        const afCount = last5.filter((r: any) => r.auto_fail_triggered).length;
        if (afCount > 0) {
            lines.push(`:warning: ${afCount} of ${last5.length} had auto-fails`);
        }
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Handler 6: Onboarding Status
// ---------------------------------------------------------------------------

export async function handleOnboardingStatus(targetName: string): Promise<string> {
    if (!targetName?.trim()) {
        return "I need a name. Try: _\"John's onboarding status?\"_";
    }

    // Try to find in onboarding_new_hires first
    const { data: newHires } = await supabaseAdmin
        .from('onboarding_new_hires')
        .select('*');

    if (!newHires || newHires.length === 0) {
        return `No onboarding records found in the system.`;
    }

    // Match by name
    const hire = newHires.find((h: any) => {
        const full = `${h.first_name || ''} ${h.last_name || ''}`.trim();
        return namesMatch(full, targetName);
    });

    if (!hire) {
        return `I couldn't find *${targetName}* in the onboarding system. They may not be a new hire.`;
    }

    const displayName = toTitleCase(`${hire.first_name || ''} ${hire.last_name || ''}`.trim());

    // Fetch checklist items for their country
    const { data: checklistItems } = await supabaseAdmin
        .from('onboarding_checklist_items')
        .select('*')
        .or(`country.is.null,country.eq.${hire.country || 'USA'}`)
        .order('sort_order');

    // Fetch progress
    const { data: progress } = await supabaseAdmin
        .from('onboarding_progress')
        .select('*, onboarding_checklist_items(title, category)')
        .eq('new_hire_id', hire.id);

    const totalItems = checklistItems?.length || 0;
    const completedItems = (progress || []).filter((p: any) => p.status === 'completed').length;
    const pct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    // Progress bar
    const filled = Math.round(pct / 10);
    const empty = 10 - filled;
    const bar = ':large_green_square:'.repeat(filled) + ':white_large_square:'.repeat(empty);

    const lines: string[] = [
        `:clipboard: *Onboarding Status for ${displayName}*`,
        '',
        `${bar} ${pct}% (${completedItems}/${totalItems})`,
        '',
    ];

    if (hire.status) lines.push(`:label: *Status:* ${hire.status}`);
    if (hire.contract_status) lines.push(`:memo: *Contract:* ${hire.contract_status}`);
    if (hire.start_date) lines.push(`:calendar: *Start Date:* ${formatDateNice(hire.start_date)}`);
    if (hire.country) lines.push(`:globe_with_meridians: *Country:* ${hire.country}`);

    // Show pending items
    const completedIds = new Set((progress || []).filter((p: any) => p.status === 'completed').map((p: any) => p.checklist_item_id));
    const pendingItems = (checklistItems || []).filter((item: any) => !completedIds.has(item.id));

    if (pendingItems.length > 0) {
        lines.push('');
        lines.push(`*Pending Items (${pendingItems.length}):*`);
        for (const item of pendingItems.slice(0, 10)) {
            lines.push(`  :white_circle: ${item.title}`);
        }
        if (pendingItems.length > 10) {
            lines.push(`  _...and ${pendingItems.length - 10} more_`);
        }
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Handler 7: Bulk Cleanup Preview
// ---------------------------------------------------------------------------

export async function handleBulkCleanupPreview(
    channelId: string,
    botToken: string
): Promise<{ text: string; blocks?: any[] }> {
    // Import dynamically to avoid circular deps at module level
    const { getChannelMembers, getSlackUserProfile } = await import('@/utils/slack-helpers');

    // 1. Get terminated employees
    const { data: terminated } = await supabaseAdmin
        .from('employee_directory')
        .select('first_name, last_name, slack_user_id')
        .eq('employee_status', 'Terminated');

    if (!terminated || terminated.length === 0) {
        return { text: 'No terminated employees found in the directory.' };
    }

    // 2. Get channel members
    const targetChannel = process.env.SLACK_HIRES_CHANNEL_ID || 'C031F6MCS9W';
    const memberIds = await getChannelMembers(targetChannel, botToken);

    // 3. Cross-reference: terminated employees still in channel
    const terminatedInChannel: { name: string; slackId: string }[] = [];

    for (const emp of terminated) {
        if (emp.slack_user_id && memberIds.includes(emp.slack_user_id)) {
            terminatedInChannel.push({
                name: toTitleCase(`${emp.first_name || ''} ${emp.last_name || ''}`.trim()),
                slackId: emp.slack_user_id,
            });
        }
    }

    // Also try name matching for those without slack_user_id
    // (Skip for now — would require fetching all profiles which is slow)

    if (terminatedInChannel.length === 0) {
        return { text: ':white_check_mark: No terminated employees found in the channel. The channel is clean!' };
    }

    // Build Block Kit confirmation
    const nameList = terminatedInChannel
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(t => `  • ${t.name} (<@${t.slackId}>)`)
        .join('\n');

    const previewText = `:warning: *Found ${terminatedInChannel.length} terminated employee(s) still in the channel:*\n\n${nameList}`;

    const blocks = [
        {
            type: 'section',
            text: { type: 'mrkdwn', text: previewText },
        },
        {
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: { type: 'plain_text', text: ':wastebasket: Remove All' },
                    style: 'danger',
                    action_id: 'bulk_cleanup_confirm',
                    value: JSON.stringify({
                        users: terminatedInChannel.map(t => ({ name: t.name, slackId: t.slackId })),
                        channelId: targetChannel,
                    }),
                },
                {
                    type: 'button',
                    text: { type: 'plain_text', text: 'Cancel' },
                    action_id: 'bulk_cleanup_cancel',
                    value: 'cancel',
                },
            ],
        },
    ];

    return { text: previewText, blocks };
}

// ---------------------------------------------------------------------------
// Handler 7b: Execute Bulk Cleanup (called from interactions route)
// ---------------------------------------------------------------------------

export async function executeBulkCleanup(
    users: { name: string; slackId: string }[],
    channelId: string,
    botToken: string
): Promise<string> {
    const { kickFromChannel, joinChannel } = await import('@/utils/slack-helpers');

    // Ensure bot is in channel
    await joinChannel(channelId, botToken);

    let removed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const user of users) {
        const result = await kickFromChannel(channelId, user.slackId, botToken);
        if (result.ok) {
            removed++;
        } else {
            failed++;
            errors.push(`${user.name}: ${result.error}`);
        }
        // Rate limit: Slack allows ~1 request/sec for conversations.kick
        await new Promise(r => setTimeout(r, 1100));
    }

    const lines: string[] = [];
    if (removed > 0) lines.push(`:white_check_mark: Successfully removed *${removed}* terminated employee(s) from the channel.`);
    if (failed > 0) {
        lines.push(`:x: Failed to remove *${failed}*:`);
        for (const err of errors.slice(0, 5)) {
            lines.push(`  • ${err}`);
        }
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Handler 8: Directory Update
// ---------------------------------------------------------------------------

const ALLOWED_UPDATE_FIELDS: Record<string, string> = {
    phone: 'phone',
    email: 'email',
    campaign: 'campaign',
    country: 'country',
    role: 'role',
};

export async function handleDirectoryUpdate(
    targetName: string,
    field: string,
    value: string
): Promise<string> {
    if (!targetName?.trim()) {
        return "I need a name. Try: _\"update John's phone to 555-1234\"_";
    }

    const normalizedField = (field || '').trim().toLowerCase();
    const dbField = ALLOWED_UPDATE_FIELDS[normalizedField];
    if (!dbField) {
        const allowed = Object.keys(ALLOWED_UPDATE_FIELDS).join(', ');
        return `:x: I can only update these fields: *${allowed}*. Try: _\"update John's phone to 555-1234\"_`;
    }

    if (!value?.trim()) {
        return `:x: I need a value to set. Try: _\"update John's ${normalizedField} to [value]\"_`;
    }

    const emp = await resolveEmployee(targetName);
    if (!emp) {
        return `I couldn't find anyone named *${targetName}* in our directory.`;
    }

    const displayName = toTitleCase(`${emp.first_name || ''} ${emp.last_name || ''}`.trim());
    const oldValue = emp[dbField] || '(empty)';

    const { error } = await supabaseAdmin
        .from('employee_directory')
        .update({ [dbField]: value.trim() })
        .eq('id', emp.id);

    if (error) {
        console.error('[Sam] Directory update error:', error);
        return `:x: Failed to update ${normalizedField} for *${displayName}*: ${error.message}`;
    }

    return `:white_check_mark: Updated *${displayName}*'s ${normalizedField}:\n  _${oldValue}_ → *${value.trim()}*`;
}

// ---------------------------------------------------------------------------
// Handler 9: Coverage Finder
// ---------------------------------------------------------------------------

export async function handleCoverageFinder(
    targetName: string,
    date: string
): Promise<string> {
    if (!targetName?.trim()) {
        return "I need a name. Try: _\"who can cover for Sarah tomorrow?\"_";
    }

    const targetDate = date || todayISO();
    const dayCol = dayColumnForDate(targetDate);

    const emp = await resolveEmployee(targetName);
    if (!emp) {
        return `I couldn't find anyone named *${targetName}* in our directory.`;
    }

    const displayName = toTitleCase(`${emp.first_name || ''} ${emp.last_name || ''}`.trim());
    const dateLabel = targetDate === todayISO() ? 'today' :
        targetDate === tomorrowISO() ? 'tomorrow' :
            formatDateNice(targetDate);

    // Get active agents
    const { data: activeAgents } = await supabaseAdmin
        .from('employee_directory')
        .select('first_name, last_name, campaign, id')
        .eq('employee_status', 'Active')
        .eq('role', 'Agent');

    if (!activeAgents || activeAgents.length === 0) {
        return 'No active agents found.';
    }

    // Fetch all schedules (paginated)
    const allSchedules: any[] = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    while (true) {
        const { data: page } = await supabaseAdmin
            .from('Agent Schedule')
            .select(`"First Name", "Last Name", "${dayCol}"`)
            .range(from, from + PAGE_SIZE - 1);
        if (!page || page.length === 0) break;
        allSchedules.push(...page);
        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    // Find agents who are OFF on that day
    const offAgents: { name: string; campaign: string }[] = [];

    for (const agent of activeAgents) {
        // Skip the target employee themselves
        if (agent.id === emp.id) continue;

        const agentFull = `${agent.first_name || ''} ${agent.last_name || ''}`.trim();
        const schedRow = allSchedules.find((s: any) => {
            const schedFull = `${(s['First Name'] || '').trim()} ${(s['Last Name'] || '').trim()}`.trim();
            return namesMatch(schedFull, agentFull);
        });

        if (!schedRow) continue;

        const shift = (schedRow[dayCol] || '').trim();
        if (!shift || shift.toLowerCase() === 'off') {
            offAgents.push({
                name: toTitleCase(agentFull),
                campaign: (agent.campaign || '').trim(),
            });
        }
    }

    if (offAgents.length === 0) {
        return `:x: No available agents found who are off on *${dateLabel}* to cover for *${displayName}*.`;
    }

    // Sort: same campaign first
    const targetCampaign = (emp.campaign || '').trim().toLowerCase();
    const sameCampaign = offAgents.filter(a => a.campaign.toLowerCase() === targetCampaign);
    const otherCampaign = offAgents.filter(a => a.campaign.toLowerCase() !== targetCampaign);

    const sections: string[] = [];

    if (sameCampaign.length > 0 && targetCampaign) {
        const names = sameCampaign.sort((a, b) => a.name.localeCompare(b.name)).map(a => `  • ${a.name}`);
        sections.push(`:star: *Same campaign (${toTitleCase(targetCampaign)})* — ${sameCampaign.length}\n${names.join('\n')}`);
    }

    if (otherCampaign.length > 0) {
        const names = otherCampaign.sort((a, b) => a.name.localeCompare(b.name)).map(a => {
            const camp = a.campaign ? ` _(${toTitleCase(a.campaign)})_` : '';
            return `  • ${a.name}${camp}`;
        });
        sections.push(`:busts_in_silhouette: *Other campaigns* — ${otherCampaign.length}\n${names.slice(0, 20).join('\n')}${names.length > 20 ? `\n  _...and ${names.length - 20} more_` : ''}`);
    }

    const header = `:mag: *Agents available to cover for ${displayName} on ${dateLabel}:*\n`;
    return header + '\n' + sections.join('\n\n');
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { namesMatch } from '@/utils/slack-helpers';
import { ATTENDANCE_BOT_TOKEN, postAttendanceBotMessage } from '@/utils/slack-attendance';
import { deduplicateBookedOff, deduplicateUnplannedOff, toTitleCase } from '@/lib/hr-utils';

export const runtime = 'nodejs';

const DAY_COLUMNS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/**
 * Cron endpoint: Proactive NCNS (No Call No Show) alert.
 * Runs at 2 PM weekdays. Finds scheduled agents with no attendance record,
 * and DMs authorized managers via Sam.
 *
 * Schedule: 0 14 * * 1-5
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const dayCol = DAY_COLUMNS[now.getDay()];

        // 1. Get active agents
        const { data: activeAgents } = await supabaseAdmin
            .from('employee_directory')
            .select('first_name, last_name, campaign')
            .eq('employee_status', 'Active')
            .eq('role', 'Agent');

        if (!activeAgents || activeAgents.length === 0) {
            return NextResponse.json({ message: 'No active agents', unreported: 0 });
        }

        // 2. Fetch schedule (paginated)
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

        // 3. Find scheduled agents (shift != OFF / empty)
        const scheduledAgents: { name: string; campaign: string }[] = [];
        for (const agent of activeAgents) {
            const agentFull = `${agent.first_name || ''} ${agent.last_name || ''}`.trim();
            const schedRow = allSchedules.find((s: any) => {
                const schedFull = `${(s['First Name'] || '').trim()} ${(s['Last Name'] || '').trim()}`.trim();
                return namesMatch(schedFull, agentFull);
            });
            if (!schedRow) continue;
            const shift = (schedRow[dayCol] || '').trim();
            if (shift && shift.toLowerCase() !== 'off') {
                scheduledAgents.push({ name: agentFull, campaign: agent.campaign || '' });
            }
        }

        // 4. Fetch today's attendance from all 3 tables
        const [bookedRes, unbookedRes, eventsRes] = await Promise.all([
            supabaseAdmin.from('Booked Days Off').select('"Agent Name"').eq('Date', today),
            supabaseAdmin.from('Non Booked Days Off').select('"Agent Name"').eq('Date', today),
            supabaseAdmin.from('Attendance Events').select('"Agent Name"').eq('Date', today),
        ]);

        const reportedNames = new Set<string>();
        for (const r of [...(bookedRes.data || []), ...(unbookedRes.data || []), ...(eventsRes.data || [])]) {
            const name = ((r as any)['Agent Name'] || '').trim().toLowerCase();
            if (name) reportedNames.add(name);
        }

        // 5. Cross-reference: scheduled agents with no attendance record
        const unreported: { name: string; campaign: string }[] = [];
        for (const agent of scheduledAgents) {
            const nameNorm = agent.name.trim().toLowerCase();
            const hasRecord = [...reportedNames].some(rn => namesMatch(rn, nameNorm));
            if (!hasRecord) {
                unreported.push(agent);
            }
        }

        if (unreported.length === 0) {
            return NextResponse.json({ message: 'All scheduled agents accounted for', unreported: 0 });
        }

        // 6. Build alert message
        const sortedUnreported = unreported.sort((a, b) => a.name.localeCompare(b.name));
        const nameList = sortedUnreported.map(a => {
            const camp = a.campaign ? ` _(${toTitleCase(a.campaign)})_` : '';
            return `  • ${toTitleCase(a.name)}${camp}`;
        }).join('\n');

        const alertMsg = `:rotating_light: *NCNS Alert — ${unreported.length} unreported agent(s)*\n\n` +
            `The following agents are scheduled for today (${dayCol}) but have no attendance record:\n\n` +
            nameList + '\n\n' +
            `_Please check in with these agents or report their status._`;

        // 7. DM authorized users
        const authorizedUsers = (process.env.SLACK_ATTENDANCE_AUTHORIZED_USERS || '').split(',').map(s => s.trim()).filter(Boolean);

        let dmsSent = 0;
        for (const userId of authorizedUsers) {
            try {
                await postAttendanceBotMessage(userId, alertMsg);
                dmsSent++;
            } catch (err) {
                console.error(`[NCNS Alert] Failed to DM ${userId}:`, err);
            }
        }

        console.log(`[NCNS Alert] ${unreported.length} unreported agents, ${dmsSent} DMs sent`);
        return NextResponse.json({ ok: true, unreported: unreported.length, dmsSent });

    } catch (err) {
        console.error('[NCNS Alert] Error:', err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}

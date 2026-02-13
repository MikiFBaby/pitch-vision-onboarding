import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { postSlackMessage, postTeamsWebhook } from '@/utils/slack-helpers';

// ---------------------------------------------------------------------------
// GET /api/attendance/daily-digest — Daily attendance summary
// Can be triggered by Vercel cron or manually
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
    // Optional: verify a cron secret to prevent unauthorized triggers
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await buildAndPostDigest();
        return NextResponse.json(result);
    } catch (err: any) {
        console.error('[Daily Digest] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

async function buildAndPostDigest() {
    const today = getEffectiveWorkingDate();
    const todayStr = today.toISOString().split('T')[0];

    // Fetch today's data in parallel
    const [absencesResult, attendanceResult, scheduleResult] = await Promise.all([
        // Unplanned absences (Non Booked Days Off)
        supabaseAdmin
            .from('Non Booked Days Off')
            .select('"Agent Name", "Reason", "Date"')
            .eq('Date', todayStr),

        // Attendance events (lates, early leaves, no-shows)
        supabaseAdmin
            .from('Attendance Events')
            .select('"Agent Name", "Event Type", "Minutes", "Reason", "Date"')
            .eq('Date', todayStr),

        // Scheduled agents for today
        supabaseAdmin
            .from('Agent Schedule')
            .select('"First Name", "Last Name"')
            .not(getDayColumn(today), 'is', null),
    ]);

    const absences = deduplicateByNameDate(absencesResult.data || []);
    const attendanceEvents = attendanceResult.data || [];
    const scheduledCount = scheduleResult.data?.length || 0;

    const lates = attendanceEvents.filter((e: any) => e['Event Type'] === 'late');
    const earlyLeaves = attendanceEvents.filter((e: any) => e['Event Type'] === 'early_leave');
    const noShows = attendanceEvents.filter((e: any) => e['Event Type'] === 'no_show');

    const totalAbsent = absences.length + noShows.length;
    const presentCount = Math.max(0, scheduledCount - totalAbsent);
    const attendanceRate = scheduledCount > 0
        ? Math.round((presentCount / scheduledCount) * 100)
        : 0;

    // Build Slack message
    const dateDisplay = today.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });

    const lines: string[] = [
        `:bar_chart: *Daily Attendance Digest — ${dateDisplay}*`,
        '',
        `:busts_in_silhouette: Scheduled: *${scheduledCount}* | :white_check_mark: Present: *${presentCount}* | :red_circle: Absent: *${totalAbsent}* | :chart_with_upwards_trend: Rate: *${attendanceRate}%*`,
    ];

    if (absences.length > 0) {
        lines.push('');
        lines.push(':red_circle: *Absences:*');
        absences.forEach((a: any) => {
            const reason = a['Reason'] ? ` — ${a['Reason']}` : '';
            lines.push(`  • ${a['Agent Name']}${reason}`);
        });
    }

    if (lates.length > 0) {
        lines.push('');
        lines.push(':clock3: *Lates:*');
        lates.forEach((e: any) => {
            const mins = e['Minutes'] ? ` (${e['Minutes']} min)` : '';
            lines.push(`  • ${e['Agent Name']}${mins}`);
        });
    }

    if (earlyLeaves.length > 0) {
        lines.push('');
        lines.push(':arrow_left: *Early Leaves:*');
        earlyLeaves.forEach((e: any) => {
            const reason = e['Reason'] ? ` — ${e['Reason']}` : '';
            lines.push(`  • ${e['Agent Name']}${reason}`);
        });
    }

    if (noShows.length > 0) {
        lines.push('');
        lines.push(':no_entry_sign: *No-Shows:*');
        noShows.forEach((e: any) => {
            lines.push(`  • ${e['Agent Name']}`);
        });
    }

    if (totalAbsent === 0 && lates.length === 0 && earlyLeaves.length === 0) {
        lines.push('');
        lines.push(':tada: Perfect attendance today!');
    }

    const slackText = lines.join('\n');

    // Post to Slack
    const channelId = process.env.SLACK_ATTENDANCE_CHANNEL_ID;
    let slackPosted = false;
    if (channelId) {
        const result = await postSlackMessage(channelId, slackText);
        slackPosted = !!result?.ok;
    }

    // Post to Teams
    const teamsFacts = [
        { name: 'Scheduled', value: String(scheduledCount) },
        { name: 'Present', value: String(presentCount) },
        { name: 'Absent', value: String(totalAbsent) },
        { name: 'Attendance Rate', value: `${attendanceRate}%` },
    ];
    if (absences.length > 0) {
        teamsFacts.push({ name: 'Absences', value: absences.map((a: any) => a['Agent Name']).join(', ') });
    }
    if (lates.length > 0) {
        teamsFacts.push({ name: 'Lates', value: lates.map((e: any) => e['Agent Name']).join(', ') });
    }

    const teamsPosted = await postTeamsWebhook(
        `Daily Attendance Digest — ${dateDisplay}`,
        `Attendance rate: ${attendanceRate}%`,
        teamsFacts
    );

    return {
        date: todayStr,
        scheduled: scheduledCount,
        present: presentCount,
        absent: totalAbsent,
        lates: lates.length,
        early_leaves: earlyLeaves.length,
        no_shows: noShows.length,
        attendance_rate: attendanceRate,
        slack_posted: slackPosted,
        teams_posted: teamsPosted,
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEffectiveWorkingDate(): Date {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 6=Sat
    if (day === 0) now.setDate(now.getDate() - 2); // Sun → Fri
    if (day === 6) now.setDate(now.getDate() - 1); // Sat → Fri
    return now;
}

function getDayColumn(date: Date): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
}

function deduplicateByNameDate(rows: any[]): any[] {
    const seen = new Set<string>();
    return rows.filter(r => {
        const key = `${(r['Agent Name'] || '').trim().toLowerCase()}|${r['Date'] || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

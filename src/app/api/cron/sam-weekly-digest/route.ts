import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { postAttendanceBotMessage } from '@/utils/slack-attendance';
import { postTeamsWebhook } from '@/utils/slack-helpers';
import {
    deduplicateBookedOff,
    deduplicateUnplannedOff,
    toTitleCase,
} from '@/lib/hr-utils';
import { formatDateNice } from '@/utils/slack-sam-handlers';

export const runtime = 'nodejs';

/**
 * Cron endpoint: Weekly attendance digest.
 * Runs Monday at 1 PM. Summarizes previous week's attendance data
 * and posts to the attendance channel + Teams.
 *
 * Schedule: 0 13 * * 1
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Previous week: Mon to Sun
        const now = new Date();
        const lastMonday = new Date(now);
        lastMonday.setDate(now.getDate() - 7 - (now.getDay() === 0 ? 6 : now.getDay() - 1));
        const lastSunday = new Date(lastMonday);
        lastSunday.setDate(lastMonday.getDate() + 6);

        const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const startDate = fmt(lastMonday);
        const endDate = fmt(lastSunday);

        // Fetch all attendance data for the week — two-table model
        const [bookedRes, unbookedRes] = await Promise.all([
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
        ]);

        const booked = deduplicateBookedOff(bookedRes.data || []);
        const unbooked = deduplicateUnplannedOff(unbookedRes.data || []);

        // Count absences per day (for daily breakdown)
        const dailyCounts: Record<string, number> = {};
        for (const r of [...booked, ...unbooked]) {
            const date = (r as any)['Date'] || '';
            dailyCounts[date] = (dailyCounts[date] || 0) + 1;
        }

        // Top absentees
        const absenteeCounts: Record<string, number> = {};
        for (const r of [...booked, ...unbooked]) {
            const name = ((r as any)['Agent Name'] || '').trim().toLowerCase();
            if (name) absenteeCounts[name] = (absenteeCounts[name] || 0) + 1;
        }

        const topAbsentees = Object.entries(absenteeCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([name, count]) => `  • ${toTitleCase(name)} — ${count} day(s)`);

        // Build Slack message
        const totalAbsences = booked.length + unbooked.length;

        const lines: string[] = [
            `:bar_chart: *Weekly Attendance Digest*`,
            `_${formatDateNice(startDate)} – ${formatDateNice(endDate)}_`,
            '',
            `*Summary:*`,
            `  :palm_tree: Booked Days Off: *${booked.length}*`,
            `  :warning: Unplanned Absences: *${unbooked.length}*`,
            `  :red_circle: Total Absences: *${totalAbsences}*`,
        ];

        // Daily breakdown
        const sortedDays = Object.entries(dailyCounts).sort(([a], [b]) => a.localeCompare(b));
        if (sortedDays.length > 0) {
            lines.push('');
            lines.push('*Absences by Day:*');
            for (const [date, count] of sortedDays) {
                lines.push(`  ${formatDateNice(date)}: ${count}`);
            }
        }

        if (topAbsentees.length > 0) {
            lines.push('');
            lines.push('*Top Absentees:*');
            lines.push(...topAbsentees);
        }

        const slackMsg = lines.join('\n');

        // Post to Slack attendance channel
        const attendanceChannel = process.env.SLACK_ATTENDANCE_CHANNEL_ID;
        if (attendanceChannel) {
            await postAttendanceBotMessage(attendanceChannel, slackMsg);
        }

        // Post to Teams
        await postTeamsWebhook(
            'Weekly Attendance Digest',
            `${formatDateNice(startDate)} – ${formatDateNice(endDate)}`,
            [
                { name: 'Total Absences', value: String(totalAbsences) },
                { name: 'Booked Days Off', value: String(booked.length) },
                { name: 'Unplanned', value: String(unbooked.length) },
            ]
        );

        console.log(`[Weekly Digest] Sent digest: ${totalAbsences} absences`);
        return NextResponse.json({
            ok: true,
            week: `${startDate} to ${endDate}`,
            absences: totalAbsences,
        });

    } catch (err) {
        console.error('[Weekly Digest] Error:', err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}

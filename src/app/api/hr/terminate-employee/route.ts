import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { kickFromChannel, joinChannel } from '@/utils/slack-helpers';
import { CAMPAIGN_CHANNELS } from '@/lib/slack-config';

const MAIN_CHANNEL = process.env.SLACK_HIRES_CHANNEL_ID || '';

// ---------------------------------------------------------------------------
// POST /api/hr/terminate-employee — Mark employee as Terminated + kick from Slack
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
    try {
        const { employeeId } = await request.json();

        if (!employeeId) {
            return NextResponse.json({ error: 'employeeId is required' }, { status: 400 });
        }

        // 1. Fetch employee
        const { data: employee, error: fetchErr } = await supabaseAdmin
            .from('employee_directory')
            .select('id, first_name, last_name, employee_status, slack_user_id')
            .eq('id', employeeId)
            .maybeSingle();

        if (fetchErr || !employee) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        if (employee.employee_status === 'Terminated') {
            return NextResponse.json({ error: 'Employee is already terminated' }, { status: 400 });
        }

        const name = `${employee.first_name} ${employee.last_name}`;

        // 2. Update employee_directory
        const { error: updateErr } = await supabaseAdmin
            .from('employee_directory')
            .update({
                employee_status: 'Terminated',
                terminated_at: new Date().toISOString(),
                current_campaigns: null,
            })
            .eq('id', employeeId);

        if (updateErr) {
            console.error('[Terminate] DB update failed:', updateErr);
            return NextResponse.json({ error: 'Failed to update employee' }, { status: 500 });
        }

        console.log(`[Terminate] Marked as Terminated: ${name}`);

        // 3. Kick from Slack channels (non-fatal — DB update already succeeded)
        let kickedFromSlack = false;
        const kickResults: string[] = [];

        if (employee.slack_user_id) {
            // Ensure bot is in the main channel before kicking
            if (MAIN_CHANNEL) {
                await joinChannel(MAIN_CHANNEL);
                const mainResult = await kickFromChannel(MAIN_CHANNEL, employee.slack_user_id);
                if (mainResult.ok) {
                    kickedFromSlack = true;
                    kickResults.push('main channel');
                } else if (mainResult.error !== 'not_in_channel') {
                    kickResults.push(`main: ${mainResult.error}`);
                }
            }

            // Kick from all campaign channels (non-fatal)
            for (const [campaignName, channelId] of Object.entries(CAMPAIGN_CHANNELS)) {
                const result = await kickFromChannel(channelId, employee.slack_user_id);
                if (result.ok) {
                    kickResults.push(campaignName);
                }
                // Silently skip not_in_channel errors — agent may not be in every campaign
            }
        }

        return NextResponse.json({
            success: true,
            name,
            kicked_from_slack: kickedFromSlack,
            channels_removed: kickResults,
        });
    } catch (err: any) {
        console.error('[Terminate] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSlackUserProfile } from '@/utils/slack-helpers';

// GET /api/slack/backfill-names
// One-off: fetches Slack profiles for employees missing display names and backfills them.
export async function GET() {
    try {
        // Find active employees with slack_user_id but missing display name
        const { data: employees, error } = await supabaseAdmin
            .from('employee_directory')
            .select('id, first_name, last_name, slack_user_id, slack_display_name, user_image')
            .eq('employee_status', 'Active')
            .not('slack_user_id', 'is', null)
            .neq('slack_user_id', '');

        if (error || !employees) {
            return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 });
        }

        const needsUpdate = employees.filter(
            e => !e.slack_display_name || e.slack_display_name.trim() === ''
        );

        const results: { name: string; slackName: string; status: string }[] = [];
        let updated = 0;
        let failed = 0;

        for (const emp of needsUpdate) {
            try {
                // Rate limit: Slack allows ~50 req/min for users.info
                if (updated > 0 && updated % 40 === 0) {
                    await new Promise(r => setTimeout(r, 5000));
                }

                const profile = await getSlackUserProfile(emp.slack_user_id!);
                if (!profile) {
                    results.push({
                        name: `${emp.first_name} ${emp.last_name}`,
                        slackName: '',
                        status: 'Slack profile not found',
                    });
                    failed++;
                    continue;
                }

                const displayName = profile.displayName || profile.realName || '';
                const updateData: Record<string, any> = {
                    slack_display_name: displayName,
                };

                // Also update photo if missing
                if ((!emp.user_image || emp.user_image.trim() === '') && profile.image) {
                    updateData.user_image = profile.image;
                }

                await supabaseAdmin
                    .from('employee_directory')
                    .update(updateData)
                    .eq('id', emp.id);

                results.push({
                    name: `${emp.first_name} ${emp.last_name}`,
                    slackName: displayName,
                    status: 'Updated',
                });
                updated++;
            } catch (err: any) {
                results.push({
                    name: `${emp.first_name} ${emp.last_name}`,
                    slackName: '',
                    status: `Error: ${err.message}`,
                });
                failed++;
            }
        }

        return NextResponse.json({
            total: needsUpdate.length,
            updated,
            failed,
            results,
        });
    } catch (err: any) {
        console.error('[Backfill Names] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

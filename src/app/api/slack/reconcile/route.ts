import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
    getSlackUserProfile,
    getChannelMembers,
    normalizeName,
    namesMatch,
    SlackProfile,
} from '@/utils/slack-helpers';

const CHANNEL_ID = process.env.SLACK_HIRES_CHANNEL_ID || '';

// ---------------------------------------------------------------------------
// GET /api/slack/reconcile — Compare Slack channel members vs employee_directory
// ---------------------------------------------------------------------------
// Modes:
//   ?mode=preview  (default) — dry-run, returns diffs without making changes
//   ?mode=backfill — SAFE: only backfills missing email/photo from Slack profiles
//   ?mode=apply    — FULL: adds missing, reactivates, backfills, AND terminates removed
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
    const mode = request.nextUrl.searchParams.get('mode') || 'preview';

    if (!CHANNEL_ID) {
        return NextResponse.json(
            { error: 'SLACK_HIRES_CHANNEL_ID not configured' },
            { status: 500 }
        );
    }

    try {
        // 1. Pull all Slack channel members
        const memberIds = await getChannelMembers(CHANNEL_ID);
        console.log(`[Reconcile] Found ${memberIds.length} channel members`);

        // 2. Fetch Slack profiles for each member (skip bots)
        const profiles: SlackProfile[] = [];
        for (const uid of memberIds) {
            const p = await getSlackUserProfile(uid);
            if (p && !p.isBot) profiles.push(p);
        }
        console.log(`[Reconcile] ${profiles.length} non-bot members after filtering`);

        // 3. Get all employees from employee_directory
        const { data: allEmployees } = await supabaseAdmin
            .from('employee_directory')
            .select('id, first_name, last_name, email, slack_user_id, employee_status, user_image, slack_display_name');

        const employees = allEmployees || [];

        // 4. Build lookup maps
        const empBySlackId = new Map<string, (typeof employees)[0]>();
        const empByEmail = new Map<string, (typeof employees)[0]>();
        for (const e of employees) {
            if (e.slack_user_id) empBySlackId.set(e.slack_user_id, e);
            if (e.email) empByEmail.set(e.email.toLowerCase(), e);
        }

        // 5. Compare: Slack members vs employee_directory
        const toAdd: { profile: SlackProfile; reason: string }[] = [];
        const toReactivate: { profile: SlackProfile; employee: (typeof employees)[0] }[] = [];
        const toUpdateSlack: { profile: SlackProfile; employee: (typeof employees)[0] }[] = [];
        const matched: { profile: SlackProfile; employee: (typeof employees)[0] }[] = [];
        const toBackfill: { profile: SlackProfile; employee: (typeof employees)[0]; fields: string[] }[] = [];

        for (const profile of profiles) {
            // Try matching: slack_user_id → email → name
            let emp = empBySlackId.get(profile.slackUserId);

            if (!emp && profile.email) {
                emp = empByEmail.get(profile.email.toLowerCase());
            }

            if (!emp) {
                emp = employees.find(e =>
                    namesMatch(`${e.first_name} ${e.last_name}`, profile.realName)
                );
            }

            if (!emp) {
                toAdd.push({ profile, reason: 'Not found in employee_directory' });
            } else if (emp.employee_status === 'Terminated') {
                toReactivate.push({ profile, employee: emp });
            } else if (!emp.slack_user_id || emp.slack_user_id !== profile.slackUserId) {
                toUpdateSlack.push({ profile, employee: emp });
            } else {
                matched.push({ profile, employee: emp });
                // Check if matched employee is missing data we can backfill from Slack
                const missingFields: string[] = [];
                if (!emp.email && profile.email) missingFields.push('email');
                if (!emp.user_image && profile.image) missingFields.push('user_image');
                if (missingFields.length > 0) {
                    toBackfill.push({ profile, employee: emp, fields: missingFields });
                }
            }
        }

        // 6. Find employees with slack_user_id who are Active but NOT in channel
        const channelSlackIds = new Set(profiles.map(p => p.slackUserId));
        const potentialTerminations = employees.filter(
            e =>
                e.employee_status === 'Active' &&
                e.slack_user_id &&
                !channelSlackIds.has(e.slack_user_id)
        );

        // 7. Apply changes based on mode
        const applied: string[] = [];

        if (mode === 'backfill' || mode === 'apply') {
            // --- SAFE operations (backfill + apply) ---

            // Update slack_user_id for matched employees missing it
            for (const { profile, employee } of toUpdateSlack) {
                const updateData: Record<string, any> = {
                    slack_user_id: profile.slackUserId,
                    slack_display_name: profile.displayName || profile.realName,
                    user_image: profile.image || undefined,
                };
                if (!employee.email && profile.email) updateData.email = profile.email;
                const { error } = await supabaseAdmin
                    .from('employee_directory')
                    .update(updateData)
                    .eq('id', employee.id);
                if (!error) applied.push(`Updated Slack info: ${employee.first_name} ${employee.last_name}`);
            }

            // Backfill missing email/image for already-matched employees
            for (const { profile, employee, fields } of toBackfill) {
                const updateData: Record<string, any> = {};
                if (fields.includes('email') && profile.email) updateData.email = profile.email;
                if (fields.includes('user_image') && profile.image) updateData.user_image = profile.image;
                const { error } = await supabaseAdmin
                    .from('employee_directory')
                    .update(updateData)
                    .eq('id', employee.id);
                if (!error) applied.push(`Backfilled ${fields.join(', ')}: ${employee.first_name} ${employee.last_name}`);
            }
        }

        if (mode === 'apply') {
            // --- DESTRUCTIVE operations (apply only) ---

            // Add missing employees
            for (const { profile } of toAdd) {
                const { error } = await supabaseAdmin
                    .from('employee_directory')
                    .insert({
                        first_name: profile.firstName || profile.realName.split(' ')[0] || '',
                        last_name: profile.lastName || profile.realName.split(' ').slice(1).join(' ') || '',
                        email: profile.email || null,
                        slack_user_id: profile.slackUserId,
                        slack_display_name: profile.displayName || profile.realName,
                        user_image: profile.image || null,
                        employee_status: 'Active',
                        role: 'Agent',
                        hired_at: new Date().toISOString(),
                    });
                if (!error) applied.push(`Added: ${profile.realName}`);
                else console.error('[Reconcile] Insert error:', error);
            }

            // Reactivate terminated employees who are back in channel
            for (const { profile, employee } of toReactivate) {
                const updateData: Record<string, any> = {
                    employee_status: 'Active',
                    slack_user_id: profile.slackUserId,
                    slack_display_name: profile.displayName || profile.realName,
                    user_image: profile.image || undefined,
                    terminated_at: null,
                };
                if (!employee.email && profile.email) updateData.email = profile.email;
                const { error } = await supabaseAdmin
                    .from('employee_directory')
                    .update(updateData)
                    .eq('id', employee.id);
                if (!error) applied.push(`Reactivated: ${employee.first_name} ${employee.last_name}`);
            }

            // Mark terminations (Active employees not in channel)
            for (const emp of potentialTerminations) {
                const { error } = await supabaseAdmin
                    .from('employee_directory')
                    .update({
                        employee_status: 'Terminated',
                        terminated_at: new Date().toISOString(),
                    })
                    .eq('id', emp.id);
                if (!error) applied.push(`Terminated: ${emp.first_name} ${emp.last_name}`);
            }
        }

        // 8. Build response
        return NextResponse.json({
            mode,
            channelMembers: memberIds.length,
            nonBotMembers: profiles.length,
            employeeDirectoryTotal: employees.length,
            summary: {
                alreadyMatched: matched.length,
                missingFromDirectory: toAdd.map(a => ({
                    name: a.profile.realName,
                    email: a.profile.email,
                    slackId: a.profile.slackUserId,
                })),
                terminatedButInChannel: toReactivate.map(r => ({
                    name: `${r.employee.first_name} ${r.employee.last_name}`,
                    id: r.employee.id,
                })),
                missingSlackId: toUpdateSlack.map(u => ({
                    name: `${u.employee.first_name} ${u.employee.last_name}`,
                    id: u.employee.id,
                })),
                activeButNotInChannel: potentialTerminations.map(e => ({
                    name: `${e.first_name} ${e.last_name}`,
                    id: e.id,
                    slackId: e.slack_user_id,
                })),
                dataBackfill: toBackfill.map(b => ({
                    name: `${b.employee.first_name} ${b.employee.last_name}`,
                    id: b.employee.id,
                    fields: b.fields,
                })),
            },
            ...(mode === 'apply' || mode === 'backfill' ? { applied } : {}),
        });
    } catch (err: any) {
        console.error('[Reconcile] Error:', err);
        return NextResponse.json(
            { error: err.message || 'Reconciliation failed' },
            { status: 500 }
        );
    }
}

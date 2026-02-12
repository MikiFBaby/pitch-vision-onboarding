import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
    verifySlackSignature,
    getSlackUserProfile,
    normalizeName,
    namesMatch,
} from '@/utils/slack-helpers';

const CHANNEL_ID = process.env.SLACK_HIRES_CHANNEL_ID || '';

// ---------------------------------------------------------------------------
// POST /api/slack/events — Slack Events API webhook
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
    const rawBody = await request.text();
    let payload: any;

    try {
        payload = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // 1. Handle Slack URL verification challenge (must respond before timeout)
    if (payload.type === 'url_verification') {
        return NextResponse.json({ challenge: payload.challenge });
    }

    // 2. Verify Slack signature for all other requests
    const signingSecret = process.env.SLACK_SIGNING_SECRET || '';
    const signature = request.headers.get('x-slack-signature') || '';
    const timestamp = request.headers.get('x-slack-request-timestamp') || '';

    if (signingSecret && !verifySlackSignature(signingSecret, signature, timestamp, rawBody)) {
        console.error('[Slack Events] Signature verification failed');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 3. Ignore retries (Slack retries if we don't respond within 3s)
    const retryNum = request.headers.get('x-slack-retry-num');
    if (retryNum) {
        return NextResponse.json({ ok: true });
    }

    // 4. Process event callbacks
    if (payload.type === 'event_callback') {
        const event = payload.event;

        // Only process events for the configured channel
        if (CHANNEL_ID && event.channel !== CHANNEL_ID) {
            return NextResponse.json({ ok: true });
        }

        if (event.type === 'member_joined_channel') {
            // Fire and forget — respond to Slack immediately, process async
            handleNewHire(event.user).catch(err =>
                console.error('[Slack Events] handleNewHire error:', err)
            );
        }

        if (event.type === 'member_left_channel') {
            handleTermination(event.user).catch(err =>
                console.error('[Slack Events] handleTermination error:', err)
            );
        }
    }

    return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// New Hire: member_joined_channel
// ---------------------------------------------------------------------------

async function handleNewHire(slackUserId: string) {
    console.log(`[Slack Events] member_joined_channel: ${slackUserId}`);

    // 1. Get Slack profile
    const profile = await getSlackUserProfile(slackUserId);
    if (!profile) {
        console.error('[Slack Events] Could not fetch profile for', slackUserId);
        return;
    }

    // Skip bots and app accounts
    if (profile.isBot) {
        console.log('[Slack Events] Skipping bot/app:', profile.realName);
        return;
    }

    console.log('[Slack Events] Profile:', profile.realName, profile.email);

    // 2. Check if already exists in employee_directory (by slack_user_id first, then email)
    let existing: { id: string; employee_status: string } | null = null;

    const { data: bySlackId } = await supabaseAdmin
        .from('employee_directory')
        .select('id, employee_status')
        .eq('slack_user_id', slackUserId)
        .maybeSingle();

    if (bySlackId) {
        existing = bySlackId;
    } else if (profile.email) {
        const { data: byEmail } = await supabaseAdmin
            .from('employee_directory')
            .select('id, employee_status')
            .eq('email', profile.email)
            .limit(1)
            .maybeSingle();
        existing = byEmail;
    }

    // 2b. Fallback: match by name against employee_directory
    if (!existing) {
        const { data: allActive } = await supabaseAdmin
            .from('employee_directory')
            .select('id, first_name, last_name, employee_status');

        const match = (allActive || []).find(e =>
            namesMatch(`${e.first_name} ${e.last_name}`, profile.realName)
        );
        if (match) existing = { id: match.id, employee_status: match.employee_status };
    }

    if (existing) {
        // Re-activate if previously terminated
        if (existing.employee_status === 'Terminated') {
            await supabaseAdmin
                .from('employee_directory')
                .update({
                    employee_status: 'Active',
                    slack_user_id: slackUserId,
                    slack_display_name: profile.displayName || profile.realName,
                    user_image: profile.image || undefined,
                    terminated_at: null,
                })
                .eq('id', existing.id);
            console.log('[Slack Events] Re-activated existing employee:', profile.realName);
        } else {
            // Already active, just ensure slack_user_id is set
            await supabaseAdmin
                .from('employee_directory')
                .update({
                    slack_user_id: slackUserId,
                    slack_display_name: profile.displayName || profile.realName,
                    user_image: profile.image || undefined,
                })
                .eq('id', existing.id);
            console.log('[Slack Events] Updated Slack info for existing employee:', profile.realName);
        }
        return;
    }

    // 3. Try to match against HR Hired table
    const hireInfo = await matchHiredRecord(profile);

    // 4. Insert into employee_directory
    const newEmployee: Record<string, any> = {
        first_name: profile.firstName || profile.realName.split(' ')[0] || '',
        last_name: profile.lastName || profile.realName.split(' ').slice(1).join(' ') || '',
        email: profile.email || null,
        slack_user_id: slackUserId,
        slack_display_name: profile.displayName || profile.realName,
        user_image: profile.image || null,
        employee_status: 'Active',
        role: 'Agent',
        hired_at: new Date().toISOString(),
    };

    // Enrich with HR Hired data if matched
    if (hireInfo) {
        if (hireInfo.campaign) newEmployee.campaign = hireInfo.campaign;
        if (hireInfo.country) newEmployee.country = hireInfo.country;
        if (hireInfo.hireDate) newEmployee.hired_at = hireInfo.hireDate;
        console.log('[Slack Events] Matched HR Hired record:', hireInfo);
    }

    const { error } = await supabaseAdmin
        .from('employee_directory')
        .insert(newEmployee);

    if (error) {
        console.error('[Slack Events] Insert employee_directory error:', error);
    } else {
        console.log('[Slack Events] Created new employee:', profile.realName);
    }
}

// ---------------------------------------------------------------------------
// Termination: member_left_channel
// ---------------------------------------------------------------------------

async function handleTermination(slackUserId: string) {
    console.log(`[Slack Events] member_left_channel: ${slackUserId}`);

    // 0. Get Slack profile to check for bots
    const botCheck = await getSlackUserProfile(slackUserId);
    if (botCheck?.isBot) {
        console.log('[Slack Events] Skipping bot/app termination:', botCheck.realName);
        return;
    }

    // 1. Find the employee by slack_user_id
    const { data: employee } = await supabaseAdmin
        .from('employee_directory')
        .select('id, first_name, last_name, employee_status')
        .eq('slack_user_id', slackUserId)
        .maybeSingle();

    if (!employee) {
        // Fallback: try to find by Slack profile name
        const profile = await getSlackUserProfile(slackUserId);
        if (profile) {
            const fullName = normalizeName(profile.realName);
            const { data: employees } = await supabaseAdmin
                .from('employee_directory')
                .select('id, first_name, last_name, employee_status')
                .eq('employee_status', 'Active');

            const match = (employees || []).find(e => {
                const dirName = normalizeName(`${e.first_name} ${e.last_name}`);
                return namesMatch(dirName, fullName);
            });

            if (match) {
                await markTerminated(match.id, match.first_name, match.last_name);
                return;
            }
        }
        console.warn('[Slack Events] No employee found for Slack user:', slackUserId);
        return;
    }

    if (employee.employee_status === 'Terminated') {
        console.log('[Slack Events] Already terminated:', employee.first_name, employee.last_name);
        return;
    }

    await markTerminated(employee.id, employee.first_name, employee.last_name);
}

async function markTerminated(employeeId: string, firstName: string, lastName: string) {
    const { error } = await supabaseAdmin
        .from('employee_directory')
        .update({
            employee_status: 'Terminated',
            terminated_at: new Date().toISOString(),
        })
        .eq('id', employeeId);

    if (error) {
        console.error('[Slack Events] Update terminated error:', error);
    } else {
        console.log('[Slack Events] Marked as Terminated:', firstName, lastName);
    }
}

// ---------------------------------------------------------------------------
// HR Hired Matching
// ---------------------------------------------------------------------------

interface HireMatch {
    agentName: string;
    hireDate: string | null;
    campaign: string | null;
    country: string | null;
}

/**
 * Tries to match a Slack profile against recent HR Hired records.
 * Matches by name (first+last against "Agent Name" column).
 */
async function matchHiredRecord(profile: {
    realName: string;
    firstName: string;
    lastName: string;
}): Promise<HireMatch | null> {
    const { data: hiredRecords } = await supabaseAdmin
        .from('HR Hired')
        .select('"Agent Name", "Hire Date", "Campaign", "Canadian/American"')
        .order('"Hire Date"', { ascending: false })
        .limit(100);

    if (!hiredRecords || hiredRecords.length === 0) return null;

    const profileName = profile.realName || `${profile.firstName} ${profile.lastName}`;

    for (const record of hiredRecords) {
        const agentName = record['Agent Name'] || '';
        if (namesMatch(agentName, profileName)) {
            const location = (record['Canadian/American'] || '').toString().trim();
            let country: string | null = null;
            if (location.toLowerCase().includes('canad')) country = 'Canada';
            else if (location.toLowerCase().includes('americ')) country = 'USA';

            return {
                agentName,
                hireDate: record['Hire Date'] || null,
                campaign: record['Campaign'] || null,
                country,
            };
        }
    }

    return null;
}

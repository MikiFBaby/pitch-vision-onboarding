import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
    getSlackUserProfile,
    getChannelMembers,
    namesMatch,
    SlackProfile,
} from '@/utils/slack-helpers';
import { CAMPAIGN_CHANNELS } from '@/lib/slack-config';
import pitchHealthBlocklist from '../../../../../scripts/pitch-health-blocklist.json';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Pitch Health blocklist — names (lowercased) that should never be added to our directory
const PITCH_HEALTH_NAMES = new Set(
    pitchHealthBlocklist.map((n: string) => n.trim().toLowerCase())
);

// Slack user IDs that should never be auto-added as new employees
// (founders, known alt accounts, non-department members)
const EXCLUDED_SLACK_IDS = new Set([
    'U09K9NUQ691', // Alex Pitch Perfect — Alex Bershadsky's alt account
    'U0470TMNGLB', // Hanan Abogamil (Demi) — not in our department
    'U032D1HHH2M', // Mohamed Roumieh (Moe) — not in our department
]);

// Slack display names / real names that should be skipped (lowercased)
const EXCLUDED_NAMES = new Set([
    'boris',          // Boris Shvarts (Founder) — already in directory
    'the grinch',     // Holiday joke account
    'shawn z',        // Not in our department
]);

// Channel IDs
const MAIN_CHANNEL = process.env.SLACK_HIRES_CHANNEL_ID || '';

// Roles that are excluded from campaign tagging (leadership, QA, HR, etc.)
const AGENT_ROLE = 'Agent';

// ---------------------------------------------------------------------------
// GET /api/cron/slack-sync — Daily Slack reconciliation + campaign sync
// Schedule: 0 6 * * * (6 AM UTC daily)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results: {
        reconcile: { matched: number; added: number; reactivated: number; backfilled: number; terminated: number };
        campaigns: { updated: number; cleared: number };
        photos: { backfilled: number };
        errors: string[];
    } = {
        reconcile: { matched: 0, added: 0, reactivated: 0, backfilled: 0, terminated: 0 },
        campaigns: { updated: 0, cleared: 0 },
        photos: { backfilled: 0 },
        errors: [],
    };

    try {
        // =====================================================================
        // PHASE 1: Main Channel Reconciliation
        // =====================================================================
        if (MAIN_CHANNEL) {
            await reconcileMainChannel(results);
        } else {
            results.errors.push('SLACK_HIRES_CHANNEL_ID not configured, skipping reconcile');
        }

        // =====================================================================
        // PHASE 2: Campaign Channel Sync (Agents only)
        // =====================================================================
        await syncCampaignAssignments(results);

        // =====================================================================
        // PHASE 3: Backfill Missing Profile Photos
        // =====================================================================
        await backfillMissingPhotos(results);

        console.log('[SlackSync] Complete:', JSON.stringify(results));
        return NextResponse.json(results);
    } catch (err: any) {
        console.error('[SlackSync] Fatal error:', err);
        results.errors.push(err.message || 'Unknown error');
        return NextResponse.json(results, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// Phase 1: Reconcile main hires channel with employee_directory
// ---------------------------------------------------------------------------
async function reconcileMainChannel(
    results: { reconcile: { matched: number; added: number; reactivated: number; backfilled: number; terminated: number }; errors: string[] }
) {
    const memberIds = await getChannelMembers(MAIN_CHANNEL);
    console.log(`[SlackSync] Main channel: ${memberIds.length} members`);

    // Fetch Slack profiles (skip bots)
    const profiles: SlackProfile[] = [];
    for (const uid of memberIds) {
        const p = await getSlackUserProfile(uid);
        if (p && !p.isBot) profiles.push(p);
    }

    // Fetch HR Hired records for country lookup
    const hiredCountryMap = new Map<string, string>();
    const { data: hiredRows } = await supabaseAdmin
        .from('HR Hired')
        .select('"Agent Name", "Canadian/American"');
    for (const row of hiredRows || []) {
        const name = ((row as any)['Agent Name'] || '').trim().toLowerCase();
        const loc = ((row as any)['Canadian/American'] || '').trim().toLowerCase();
        if (!name || !loc) continue;
        hiredCountryMap.set(name, loc.includes('canad') ? 'Canada' : loc.includes('americ') ? 'USA' : loc);
    }

    // Get all employees
    const { data: allEmployees } = await supabaseAdmin
        .from('employee_directory')
        .select('id, first_name, last_name, email, slack_user_id, employee_status, user_image, slack_display_name, country');

    const employees = allEmployees || [];

    // Build lookup maps (case-insensitive email, exact slack_user_id)
    const empBySlackId = new Map<string, (typeof employees)[0]>();
    const empByEmail = new Map<string, (typeof employees)[0]>();
    for (const e of employees) {
        if (e.slack_user_id) empBySlackId.set(e.slack_user_id, e);
        if (e.email) empByEmail.set(e.email.toLowerCase(), e);
    }

    const channelSlackIds = new Set(profiles.map(p => p.slackUserId));

    // Helper: look up country from HR Hired by name
    const lookupCountry = (realName: string): string | null => {
        const full = realName.trim().toLowerCase();
        if (hiredCountryMap.has(full)) return hiredCountryMap.get(full)!;
        // Try first-word + last-word
        const parts = full.split(/\s+/);
        if (parts.length >= 2) {
            for (const [hname, hcountry] of hiredCountryMap) {
                const hp = hname.split(/\s+/);
                if (hp.length >= 2 && hp[0] === parts[0] && hp[hp.length - 1] === parts[parts.length - 1]) {
                    return hcountry;
                }
            }
        }
        return null;
    };

    for (const profile of profiles) {
        // 3-tier matching: slack_user_id → email (case-insensitive) → fuzzy name
        let emp = empBySlackId.get(profile.slackUserId);
        if (!emp && profile.email) emp = empByEmail.get(profile.email.toLowerCase());
        if (!emp) emp = employees.find(e => namesMatch(`${e.first_name} ${e.last_name}`, profile.realName));

        if (!emp) {
            // Dedup guard: verify no existing entry shares this email or slack_user_id
            // This prevents duplicates from name variations (e.g. "Jurnee Cason" vs "Jurnee' Cason")
            let existingBySlack = null;
            let existingByEmail = null;

            const { data: slackCheck } = await supabaseAdmin
                .from('employee_directory')
                .select('id')
                .eq('slack_user_id', profile.slackUserId)
                .maybeSingle();
            existingBySlack = slackCheck;

            if (!existingBySlack && profile.email) {
                const { data: emailCheck } = await supabaseAdmin
                    .from('employee_directory')
                    .select('id')
                    .ilike('email', profile.email)
                    .maybeSingle();
                existingByEmail = emailCheck;
            }

            if (existingBySlack || existingByEmail) {
                // Already exists under different name — update slack_user_id instead of inserting
                const existingId = (existingBySlack || existingByEmail)!.id;
                await supabaseAdmin
                    .from('employee_directory')
                    .update({
                        slack_user_id: profile.slackUserId,
                        slack_display_name: profile.displayName || profile.realName,
                        ...(profile.image ? { user_image: profile.image } : {}),
                    })
                    .eq('id', existingId);
                results.reconcile.backfilled++;
                continue;
            }

            // Skip known exclusions (founders, alt accounts, non-department members)
            if (EXCLUDED_SLACK_IDS.has(profile.slackUserId)) continue;
            if (EXCLUDED_NAMES.has(profile.realName.trim().toLowerCase())) continue;
            if (EXCLUDED_NAMES.has((profile.displayName || '').trim().toLowerCase())) continue;

            // Skip Pitch Health agents — they share our main Slack channel but are a separate department
            if (PITCH_HEALTH_NAMES.has(profile.realName.trim().toLowerCase())) {
                continue;
            }

            // Genuinely new employee — add to directory
            const country = lookupCountry(profile.realName);
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
                    role: AGENT_ROLE,
                    hired_at: new Date().toISOString(),
                    ...(country ? { country } : {}),
                });
            if (!error) results.reconcile.added++;
            else results.errors.push(`Insert failed: ${profile.realName} — ${error.message}`);
        } else if (emp.employee_status === 'Terminated') {
            // Reactivate
            const updateData: Record<string, any> = {
                employee_status: 'Active',
                slack_user_id: profile.slackUserId,
                slack_display_name: profile.displayName || profile.realName,
                terminated_at: null,
            };
            if (profile.image) updateData.user_image = profile.image;
            if (!emp.email && profile.email) updateData.email = profile.email;
            const { error } = await supabaseAdmin
                .from('employee_directory')
                .update(updateData)
                .eq('id', emp.id);
            if (!error) results.reconcile.reactivated++;
        } else {
            results.reconcile.matched++;
            // Backfill missing data
            const updates: Record<string, any> = {};
            if (!emp.slack_user_id) updates.slack_user_id = profile.slackUserId;
            if (!emp.email && profile.email) updates.email = profile.email;
            if (!emp.user_image && profile.image) updates.user_image = profile.image;
            if (!emp.slack_display_name && (profile.displayName || profile.realName)) {
                updates.slack_display_name = profile.displayName || profile.realName;
            }
            if (!emp.country) {
                const country = lookupCountry(`${emp.first_name} ${emp.last_name}`);
                if (country) updates.country = country;
            }
            if (Object.keys(updates).length > 0) {
                const { error } = await supabaseAdmin
                    .from('employee_directory')
                    .update(updates)
                    .eq('id', emp.id);
                if (!error) results.reconcile.backfilled++;
            }
        }
    }

    // Mark terminations: Active employees with slack_user_id NOT in channel
    const potentialTerminations = employees.filter(
        e => e.employee_status === 'Active' && e.slack_user_id && !channelSlackIds.has(e.slack_user_id)
    );
    for (const emp of potentialTerminations) {
        const { error } = await supabaseAdmin
            .from('employee_directory')
            .update({
                employee_status: 'Terminated',
                terminated_at: new Date().toISOString(),
            })
            .eq('id', emp.id);
        if (!error) results.reconcile.terminated++;
    }
}

// ---------------------------------------------------------------------------
// Phase 2: Sync campaign assignments from channel membership
// ---------------------------------------------------------------------------
async function syncCampaignAssignments(
    results: { campaigns: { updated: number; cleared: number }; errors: string[] }
) {
    // Get all active agents with slack_user_id
    const { data: agents } = await supabaseAdmin
        .from('employee_directory')
        .select('id, slack_user_id, current_campaigns')
        .eq('employee_status', 'Active')
        .eq('role', AGENT_ROLE)
        .not('slack_user_id', 'is', null);

    if (!agents || agents.length === 0) return;

    const agentBySlack = new Map<string, (typeof agents)[0]>();
    for (const a of agents) {
        if (a.slack_user_id) agentBySlack.set(a.slack_user_id, a);
    }

    // Fetch members from each campaign channel
    const agentCampaigns = new Map<string, Set<string>>(); // employee_id -> campaigns

    for (const [campaignName, channelId] of Object.entries(CAMPAIGN_CHANNELS)) {
        try {
            const memberIds = await getChannelMembers(channelId);
            for (const slackId of memberIds) {
                const agent = agentBySlack.get(slackId);
                if (agent) {
                    if (!agentCampaigns.has(agent.id)) {
                        agentCampaigns.set(agent.id, new Set());
                    }
                    agentCampaigns.get(agent.id)!.add(campaignName);
                }
            }
        } catch (err: any) {
            results.errors.push(`Campaign ${campaignName} (${channelId}): ${err.message}`);
        }
    }

    // Update agents with changed campaigns
    for (const agent of agents) {
        const newCampaigns = agentCampaigns.get(agent.id);
        const newList = newCampaigns ? Array.from(newCampaigns).sort() : [];
        const oldList = (agent.current_campaigns || []).sort();

        // Only update if changed
        if (JSON.stringify(newList) !== JSON.stringify(oldList)) {
            const { error } = await supabaseAdmin
                .from('employee_directory')
                .update({ current_campaigns: newList })
                .eq('id', agent.id);

            if (!error) {
                if (newList.length === 0) results.campaigns.cleared++;
                else results.campaigns.updated++;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Phase 3: Backfill missing profile photos
// ---------------------------------------------------------------------------
async function backfillMissingPhotos(
    results: { photos: { backfilled: number }; errors: string[] }
) {
    const { data: missingPhotos } = await supabaseAdmin
        .from('employee_directory')
        .select('id, slack_user_id')
        .eq('employee_status', 'Active')
        .is('user_image', null)
        .not('slack_user_id', 'is', null)
        .limit(50);

    if (!missingPhotos || missingPhotos.length === 0) {
        console.log('[SlackSync] Phase 3: No missing photos to backfill');
        return;
    }

    console.log(`[SlackSync] Phase 3: ${missingPhotos.length} agents missing photos`);

    for (const emp of missingPhotos) {
        try {
            const profile = await getSlackUserProfile(emp.slack_user_id);
            if (profile?.image) {
                const { error } = await supabaseAdmin
                    .from('employee_directory')
                    .update({ user_image: profile.image })
                    .eq('id', emp.id);

                if (!error) {
                    results.photos.backfilled++;
                }
            }
        } catch (err: any) {
            console.error(`[SlackSync] Photo backfill error for ${emp.id}:`, err.message);
        }
    }

    console.log(`[SlackSync] Phase 3: Backfilled ${results.photos.backfilled} photos`);
}

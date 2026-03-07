/**
 * Slack Channel Cleanup — Executes all audit action items
 *
 * 1. Remove terminated agents from Slack channels
 * 2. Mark Pitch Health agents as Terminated in employee_directory
 * 3. Merge duplicate Ron MacDonald / Ronald Mcdonald entries
 * 4. Trigger cron sync to fix campaign mismatches
 * 5. Report unknown Slack members for manual review
 *
 * Usage: node scripts/slack-cleanup.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MAIN_CHANNEL_ID = 'C031F6MCS9W';
const CAMPAIGN_CHANNELS = [
    { name: 'Medicare', id: 'C0A896J4JEM' },
    { name: 'ACA', id: 'C07A07ANCAG' },
    { name: 'Medicare WhatIF', id: 'C06CDFV4ECR' },
    { name: 'Home Care Michigan', id: 'C0A3AH1K56E' },
    { name: 'Home Care PA', id: 'C09JRPT6HME' },
    { name: 'Hospital', id: 'C0AE4E14S8M' },
    { name: 'Pitch Meals', id: 'C0AEWM51U90' },
];
const ALL_CHANNEL_IDS = [MAIN_CHANNEL_ID, ...CAMPAIGN_CHANNELS.map(c => c.id)];

// Known exclusions
const EXCLUDED_SLACK_IDS = new Set([
    'U09K9NUQ691', // Alex Pitch Perfect
    'U0470TMNGLB', // Hanan Abogamil
    'U032D1HHH2M', // Mohamed Roumieh
]);
const EXCLUDED_NAMES = new Set(['boris', 'the grinch', 'shawn z']);

let PITCH_HEALTH_NAMES = new Set();
try {
    const blocklist = JSON.parse(readFileSync('scripts/pitch-health-blocklist.json', 'utf8'));
    PITCH_HEALTH_NAMES = new Set(blocklist.map(n => n.trim().toLowerCase()));
} catch { /* ignore */ }

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ── Slack API ──
async function slackPost(method, body) {
    const res = await fetch(`https://slack.com/api/${method}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SLACK_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return res.json();
}

async function getChannelMembers(channelId) {
    const members = [];
    let cursor = '';
    do {
        const url = `https://slack.com/api/conversations.members?channel=${channelId}&limit=200${cursor ? `&cursor=${cursor}` : ''}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });
        const data = await res.json();
        if (!data.ok) { console.error(`  [ERROR] conversations.members: ${data.error}`); break; }
        members.push(...(data.members || []));
        cursor = data.response_metadata?.next_cursor || '';
    } while (cursor);
    return members;
}

async function getProfile(userId) {
    await delay(400);
    const res = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
        headers: { Authorization: `Bearer ${SLACK_TOKEN}` },
    });
    const data = await res.json();
    if (!data.ok) return null;
    const user = data.user;
    const p = user.profile || {};
    return {
        id: user.id,
        realName: p.real_name || user.real_name || '',
        displayName: p.display_name || '',
        email: p.email || '',
        isBot: user.is_bot || user.id === 'USLACKBOT',
        deleted: user.deleted || false,
    };
}

function normalizeName(name) {
    return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function namesMatch(a, b) {
    const na = normalizeName(a);
    const nb = normalizeName(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    const pa = na.split(' '), pb = nb.split(' ');
    if (pa.length >= 2 && pb.length >= 2 && pa[0] === pb[0] && pa[pa.length - 1] === pb[pb.length - 1]) return true;
    return false;
}

// ── Supabase paginated fetch ──
async function fetchAll(table, select) {
    const all = [];
    let from = 0;
    while (true) {
        const { data, error } = await sb.from(table).select(select).range(from, from + 999);
        if (error) { console.error(`  [ERROR] ${table}:`, error.message); break; }
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
    }
    return all;
}

// ══════════════════════════════════════════════════════════════
async function main() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║          SLACK CHANNEL CLEANUP                                ║');
    console.log('║          ' + new Date().toISOString().split('T')[0] + '                                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const results = { kicked: 0, kickFailed: 0, pitchHealthRemoved: 0, duplicatesMerged: 0, errors: [] };

    // ── Load employee directory ──
    process.stdout.write('Loading employee directory... ');
    const allEmployees = await fetchAll('employee_directory', '*');
    const empBySlackId = new Map();
    const empByEmail = new Map();
    for (const e of allEmployees) {
        if (e.slack_user_id) empBySlackId.set(e.slack_user_id, e);
        if (e.email) empByEmail.set(e.email.toLowerCase(), e);
    }
    console.log(`${allEmployees.length} records`);

    // ═══════════════════════════════════════════════════════════
    // ACTION 1: Remove terminated agents from Slack channels
    // ═══════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ACTION 1: REMOVE TERMINATED AGENTS FROM SLACK CHANNELS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // First, ensure bot is in all channels
    for (const chId of ALL_CHANNEL_IDS) {
        const joinRes = await slackPost('conversations.join', { channel: chId });
        if (!joinRes.ok && joinRes.error !== 'already_in_channel') {
            console.log(`  [WARN] Could not join channel ${chId}: ${joinRes.error}`);
        }
    }

    // Fetch members from all channels and identify terminated agents
    const terminatedKicks = []; // { name, slackId, channel, channelId }
    for (const ch of [{ name: 'Main (Hires)', id: MAIN_CHANNEL_ID }, ...CAMPAIGN_CHANNELS]) {
        process.stdout.write(`  Scanning ${ch.name}... `);
        const memberIds = await getChannelMembers(ch.id);
        let termFound = 0;
        for (const uid of memberIds) {
            const emp = empBySlackId.get(uid);
            if (emp && emp.employee_status === 'Terminated') {
                terminatedKicks.push({
                    name: `${emp.first_name} ${emp.last_name}`,
                    slackId: uid,
                    channel: ch.name,
                    channelId: ch.id,
                    terminatedAt: emp.terminated_at ? emp.terminated_at.split('T')[0] : 'unknown',
                });
                termFound++;
            }
        }
        console.log(`${memberIds.length} members, ${termFound} terminated`);
    }

    // Group by person for reporting
    const byPerson = new Map();
    for (const k of terminatedKicks) {
        if (!byPerson.has(k.slackId)) byPerson.set(k.slackId, { ...k, channels: [] });
        byPerson.get(k.slackId).channels.push({ name: k.channel, id: k.channelId });
    }

    console.log(`\n  Found ${byPerson.size} terminated agents across ${terminatedKicks.length} channel memberships`);

    for (const [slackId, person] of byPerson) {
        console.log(`\n  Removing ${person.name} (${slackId}) — terminated ${person.terminatedAt}`);
        for (const ch of person.channels) {
            await delay(1200); // Rate limit for write operations
            const result = await slackPost('conversations.kick', { channel: ch.id, user: slackId });
            if (result.ok) {
                console.log(`    ✓ Removed from ${ch.name}`);
                results.kicked++;
            } else if (result.error === 'not_in_channel') {
                console.log(`    - Already not in ${ch.name}`);
            } else {
                console.log(`    ✗ Failed to remove from ${ch.name}: ${result.error}`);
                results.kickFailed++;
                results.errors.push(`Kick ${person.name} from ${ch.name}: ${result.error}`);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ACTION 2: Remove Pitch Health agents from directory
    // ═══════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ACTION 2: REMOVE PITCH HEALTH AGENTS FROM DIRECTORY');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const active = allEmployees.filter(e => e.employee_status === 'Active');
    const pitchHealthInDir = active.filter(e => {
        const fullName = `${e.first_name} ${e.last_name}`.trim().toLowerCase();
        return PITCH_HEALTH_NAMES.has(fullName);
    });

    if (pitchHealthInDir.length === 0) {
        console.log('  None found — no Pitch Health agents in our Active directory.');
    } else {
        console.log(`  Found ${pitchHealthInDir.length} Pitch Health agents to remove:\n`);
        for (const emp of pitchHealthInDir) {
            console.log(`  Terminating ${emp.first_name} ${emp.last_name} (${emp.id})...`);
            const { error } = await sb
                .from('employee_directory')
                .update({
                    employee_status: 'Terminated',
                    terminated_at: new Date().toISOString(),
                })
                .eq('id', emp.id);
            if (!error) {
                console.log(`    ✓ Marked as Terminated`);
                results.pitchHealthRemoved++;
            } else {
                console.log(`    ✗ Failed: ${error.message}`);
                results.errors.push(`Terminate PH ${emp.first_name} ${emp.last_name}: ${error.message}`);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ACTION 3: Merge duplicate entries
    // ═══════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ACTION 3: MERGE DUPLICATE ENTRIES');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Find duplicate names among active employees
    const nameMap = new Map();
    for (const e of active) {
        const key = `${(e.first_name || '').trim()} ${(e.last_name || '').trim()}`.toLowerCase();
        if (!nameMap.has(key)) nameMap.set(key, []);
        nameMap.get(key).push(e);
    }

    // Also check for Ron MacDonald / Ronald Mcdonald variant
    const ronVariants = active.filter(e => {
        const f = (e.first_name || '').toLowerCase();
        const l = (e.last_name || '').toLowerCase();
        return (f === 'ron' || f === 'ronald') && (l === 'macdonald' || l === 'mcdonald');
    });

    const allDupes = Array.from(nameMap.entries()).filter(([, v]) => v.length > 1);
    // Add Ron variants if they aren't already caught
    if (ronVariants.length > 1) {
        const ronKey = 'ron(ald) mac/mcdonald';
        const alreadyCaught = allDupes.some(([, v]) => v.some(e => ronVariants.includes(e)));
        if (!alreadyCaught) {
            allDupes.push([ronKey, ronVariants]);
        }
    }

    if (allDupes.length === 0 && ronVariants.length <= 1) {
        console.log('  No duplicates found.');
    } else {
        for (const [name, dupes] of allDupes) {
            console.log(`  Duplicate: "${name}" (${dupes.length} entries)`);
            for (const d of dupes) {
                console.log(`    ID: ${d.id}`);
                console.log(`    Name: ${d.first_name} ${d.last_name}`);
                console.log(`    Email: ${d.email || 'N/A'} | Slack: ${d.slack_user_id || 'N/A'}`);
                console.log(`    Wage: ${d.hourly_wage || 'N/A'} | Country: ${d.country || 'N/A'}`);
                console.log(`    Campaigns: ${(d.current_campaigns || []).join(', ') || 'none'}`);
                console.log(`    Hired: ${d.hired_at ? d.hired_at.split('T')[0] : 'N/A'}`);
                console.log('');
            }

            // Merge strategy: keep the one with more data (Slack ID, wage, email)
            const scored = dupes.map(d => ({
                emp: d,
                score: (d.slack_user_id ? 3 : 0) + (d.email ? 2 : 0) + (d.hourly_wage ? 2 : 0) +
                    (d.country ? 1 : 0) + ((d.current_campaigns || []).length > 0 ? 1 : 0) +
                    (d.user_image ? 1 : 0) + (d.phone ? 1 : 0),
            })).sort((a, b) => b.score - a.score);

            const keep = scored[0].emp;
            const remove = scored.slice(1).map(s => s.emp);

            console.log(`  → Keeping: ${keep.first_name} ${keep.last_name} (${keep.id}) — score: ${scored[0].score}`);

            for (const dup of remove) {
                console.log(`  → Merging data from: ${dup.first_name} ${dup.last_name} (${dup.id}) — score: ${scored.find(s => s.emp === dup).score}`);

                // Copy any missing data from dup to keep
                const updates = {};
                if (!keep.email && dup.email) updates.email = dup.email;
                if (!keep.slack_user_id && dup.slack_user_id) updates.slack_user_id = dup.slack_user_id;
                if (!keep.hourly_wage && dup.hourly_wage) updates.hourly_wage = dup.hourly_wage;
                if (!keep.country && dup.country) updates.country = dup.country;
                if (!keep.phone && dup.phone) updates.phone = dup.phone;
                if (!keep.user_image && dup.user_image) updates.user_image = dup.user_image;
                if (!keep.hired_at && dup.hired_at) updates.hired_at = dup.hired_at;
                if ((keep.current_campaigns || []).length === 0 && (dup.current_campaigns || []).length > 0) {
                    updates.current_campaigns = dup.current_campaigns;
                }

                // Apply merge updates to keeper
                if (Object.keys(updates).length > 0) {
                    const { error } = await sb.from('employee_directory').update(updates).eq('id', keep.id);
                    if (error) {
                        console.log(`    ✗ Merge update failed: ${error.message}`);
                        results.errors.push(`Merge update ${keep.id}: ${error.message}`);
                    } else {
                        console.log(`    ✓ Merged fields: ${Object.keys(updates).join(', ')}`);
                    }
                }

                // Mark duplicate as Terminated
                const { error } = await sb
                    .from('employee_directory')
                    .update({ employee_status: 'Terminated', terminated_at: new Date().toISOString() })
                    .eq('id', dup.id);
                if (!error) {
                    console.log(`    ✓ Duplicate marked as Terminated`);
                    results.duplicatesMerged++;
                } else {
                    console.log(`    ✗ Failed to terminate duplicate: ${error.message}`);
                    results.errors.push(`Terminate dup ${dup.id}: ${error.message}`);
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ACTION 4: Trigger cron sync for campaign mismatches
    // ═══════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ACTION 4: TRIGGER CAMPAIGN SYNC (CRON)');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const cronUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL ? '' : ''}http://localhost:3000/api/cron/slack-sync`;
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        console.log('  [SKIP] CRON_SECRET not set — trigger the sync manually:');
        console.log('  curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/slack-sync');
    } else {
        console.log('  Triggering /api/cron/slack-sync...');
        try {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000';
            const url = `${baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`}/api/cron/slack-sync`;
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${cronSecret}` },
                signal: AbortSignal.timeout(120000),
            });
            if (res.ok) {
                const data = await res.json();
                console.log('  ✓ Sync complete:', JSON.stringify(data, null, 2));
            } else {
                console.log(`  ✗ Sync failed: HTTP ${res.status}`);
                results.errors.push(`Cron sync: HTTP ${res.status}`);
            }
        } catch (err) {
            console.log(`  ✗ Sync request failed: ${err.message}`);
            console.log('  (This is expected if the dev server is not running)');
            console.log('  Run manually: curl -H "Authorization: Bearer $CRON_SECRET" <APP_URL>/api/cron/slack-sync');
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ACTION 5: Report unknown Slack members
    // ═══════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ACTION 5: UNKNOWN SLACK MEMBERS (INVESTIGATION)');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Refresh employee data after our changes
    const updatedEmployees = await fetchAll('employee_directory', '*');
    const updEmpBySlackId = new Map();
    const updEmpByEmail = new Map();
    for (const e of updatedEmployees) {
        if (e.slack_user_id) updEmpBySlackId.set(e.slack_user_id, e);
        if (e.email) updEmpByEmail.set(e.email.toLowerCase(), e);
    }

    process.stdout.write('  Scanning main channel for unknown members... ');
    const mainMembers = await getChannelMembers(MAIN_CHANNEL_ID);
    console.log(`${mainMembers.length} members`);

    const unknowns = [];
    let profilesFetched = 0;
    for (const uid of mainMembers) {
        // Quick check against known Slack IDs
        if (updEmpBySlackId.has(uid)) continue;
        if (EXCLUDED_SLACK_IDS.has(uid)) continue;

        // Need profile for further matching
        const p = await getProfile(uid);
        profilesFetched++;
        if (!p || p.isBot || p.deleted) continue;

        const nameL = p.realName.trim().toLowerCase();
        const displayL = p.displayName.trim().toLowerCase();

        // Check exclusions
        if (EXCLUDED_NAMES.has(nameL) || EXCLUDED_NAMES.has(displayL)) continue;

        // Check email match
        if (p.email && updEmpByEmail.has(p.email.toLowerCase())) continue;

        // Check name match
        const nameMatched = updatedEmployees.find(e => namesMatch(`${e.first_name} ${e.last_name}`, p.realName));
        if (nameMatched) continue;

        // Check Pitch Health
        if (PITCH_HEALTH_NAMES.has(nameL)) {
            // Expected — Pitch Health agents are in main channel
            continue;
        }

        unknowns.push(p);
        if (profilesFetched % 20 === 0) process.stdout.write(`  ${profilesFetched} profiles checked...\r`);
    }

    console.log(`                                           `);
    if (unknowns.length === 0) {
        console.log('  ✓ No unknown members found — all accounted for.');
    } else {
        console.log(`  Found ${unknowns.length} unknown members (not in directory, not excluded, not Pitch Health):\n`);
        for (const u of unknowns) {
            console.log(`  [UNKNOWN] ${u.realName} (${u.id})`);
            console.log(`            Display: "${u.displayName}", Email: ${u.email || 'N/A'}`);
        }
        console.log('\n  These need manual review: are they new hires, Pitch Health, or external?');
    }

    // ═══════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  CLEANUP SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`  Terminated agents removed from channels: ${results.kicked} (${results.kickFailed} failures)`);
    console.log(`  Pitch Health agents terminated in directory: ${results.pitchHealthRemoved}`);
    console.log(`  Duplicate entries merged/removed: ${results.duplicatesMerged}`);
    console.log(`  Unknown members requiring review: ${unknowns.length}`);
    if (results.errors.length > 0) {
        console.log(`\n  Errors (${results.errors.length}):`);
        for (const err of results.errors) console.log(`    - ${err}`);
    }
    console.log('\n  Cleanup complete.\n');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

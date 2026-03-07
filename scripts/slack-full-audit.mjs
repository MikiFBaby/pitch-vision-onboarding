/**
 * Comprehensive Slack Channel Audit
 *
 * Audits all Slack channels (main + 7 campaign) and cross-references against:
 * - employee_directory (Supabase)
 * - DialedIn agent performance data
 * - Pitch Health blocklist
 *
 * READ-ONLY — no destructive actions. Produces a report only.
 *
 * Usage: node scripts/slack-full-audit.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Channel Configuration ──
const MAIN_CHANNEL = { name: 'Main (Hires)', id: 'C031F6MCS9W' };
const CAMPAIGN_CHANNELS = [
    { name: 'Medicare', id: 'C0A896J4JEM' },
    { name: 'ACA', id: 'C07A07ANCAG' },
    { name: 'Medicare WhatIF', id: 'C06CDFV4ECR' },
    { name: 'Home Care Michigan', id: 'C0A3AH1K56E' },
    { name: 'Home Care PA', id: 'C09JRPT6HME' },
    { name: 'Hospital', id: 'C0AE4E14S8M' },
    { name: 'Pitch Meals', id: 'C0AEWM51U90' },
];
const ALL_CHANNELS = [MAIN_CHANNEL, ...CAMPAIGN_CHANNELS];

// ── Known Exclusions ──
const EXCLUDED_SLACK_IDS = new Set([
    'U09K9NUQ691', // Alex Pitch Perfect — alt account
    'U0470TMNGLB', // Hanan Abogamil — not in our department
    'U032D1HHH2M', // Mohamed Roumieh — not in our department
    'U0A2F5D9HKQ', // Maz — duplicate/alt of Maaz Khan (U06GRC03A5R)
    'U0A2H6GBGCA', // Maaz/Can — duplicate/alt of Maaz Khan (U06GRC03A5R)
]);
const EXCLUDED_NAMES = new Set(['boris', 'the grinch', 'shawn z']);

// ── Pitch Health Blocklist ──
let PITCH_HEALTH_NAMES = new Set();
try {
    const blocklist = JSON.parse(readFileSync('scripts/pitch-health-blocklist.json', 'utf8'));
    PITCH_HEALTH_NAMES = new Set(blocklist.map(n => n.trim().toLowerCase()));
} catch { /* ignore if missing */ }

// ── DialedIn team → expected campaign mapping ──
const TEAM_TO_CAMPAIGN = {
    'jade aca team': 'ACA',
    'aragon team a': 'Medicare',
    'aragon team b': 'Medicare',
    'whatif': 'Medicare WhatIF',
    'tld': 'Medicare',
    'elite fym': 'Medicare',
};

// ── Slack API Helpers ──
const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function getChannelMembers(channelId) {
    const members = [];
    let cursor = '';
    do {
        const url = `https://slack.com/api/conversations.members?channel=${channelId}&limit=200${cursor ? `&cursor=${cursor}` : ''}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });
        const data = await res.json();
        if (!data.ok) { console.error(`  [ERROR] conversations.members failed for ${channelId}:`, data.error); break; }
        members.push(...(data.members || []));
        cursor = data.response_metadata?.next_cursor || '';
    } while (cursor);
    return members;
}

const profileCache = new Map();
async function getProfile(userId) {
    if (profileCache.has(userId)) return profileCache.get(userId);
    await delay(400); // Rate limit: ~2.5 req/s
    const res = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
        headers: { Authorization: `Bearer ${SLACK_TOKEN}` },
    });
    const data = await res.json();
    if (!data.ok) { profileCache.set(userId, null); return null; }
    const user = data.user;
    const profile = user.profile || {};
    const result = {
        id: user.id,
        realName: profile.real_name || user.real_name || '',
        firstName: profile.first_name || '',
        lastName: profile.last_name || '',
        displayName: profile.display_name || '',
        email: profile.email || '',
        isBot: user.is_bot || user.id === 'USLACKBOT',
        deleted: user.deleted || false,
    };
    profileCache.set(userId, result);
    return result;
}

function normalizeName(name) {
    return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function namesMatch(a, b) {
    const na = normalizeName(a);
    const nb = normalizeName(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    const partsA = na.split(' ');
    const partsB = nb.split(' ');
    if (partsA.length >= 2 && partsB.length >= 2) {
        if (partsA[0] === partsB[0] && partsA[partsA.length - 1] === partsB[partsB.length - 1]) return true;
    }
    // Compound last name
    if (partsA.length >= 2 && partsB.length >= 2) {
        const [shorter, longer] = partsA.length <= partsB.length ? [partsA, partsB] : [partsB, partsA];
        if (shorter.length >= 2 && longer.length > shorter.length) {
            let j = 0;
            for (const part of longer) { if (part === shorter[j]) j++; if (j === shorter.length) break; }
            if (j === shorter.length) return true;
        }
    }
    return false;
}

// ── Supabase paginated fetch ──
async function fetchAll(table, select, filters = {}) {
    const all = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
        let q = sb.from(table).select(select).range(from, from + PAGE - 1);
        for (const [k, v] of Object.entries(filters)) {
            if (k === 'eq') for (const [col, val] of Object.entries(v)) q = q.eq(col, val);
            if (k === 'gte') for (const [col, val] of Object.entries(v)) q = q.gte(col, val);
            if (k === 'not_null') for (const col of v) q = q.not(col, 'is', null);
        }
        const { data, error } = await q;
        if (error) { console.error(`  [ERROR] Fetching ${table}:`, error.message); break; }
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
    }
    return all;
}

// ── Main Audit ──
async function runAudit() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║          COMPREHENSIVE SLACK CHANNEL AUDIT                    ║');
    console.log('║          ' + new Date().toISOString().split('T')[0] + '                                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');

    // ── Fetch all employee directory data ──
    process.stdout.write('Loading employee directory... ');
    const allEmployees = await fetchAll('employee_directory', '*');
    const active = allEmployees.filter(e => e.employee_status === 'Active');
    const terminated = allEmployees.filter(e => e.employee_status === 'Terminated');
    const activeAgents = active.filter(e => (e.role || '').toLowerCase() === 'agent');
    console.log(`${allEmployees.length} total (${active.length} active, ${terminated.length} terminated)`);

    // Build lookup maps
    const empBySlackId = new Map();
    const empByEmail = new Map();
    for (const e of allEmployees) {
        if (e.slack_user_id) empBySlackId.set(e.slack_user_id, e);
        if (e.email) empByEmail.set(e.email.toLowerCase(), e);
    }

    // ── Fetch DialedIn performance data (last 14 days) ──
    process.stdout.write('Loading DialedIn performance data (14d)... ');
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const dialedInData = await fetchAll(
        'dialedin_agent_performance',
        'agent_name, team, employee_id, report_date',
        { gte: { report_date: fourteenDaysAgo.toISOString().split('T')[0] } }
    );
    // Build agent → latest team + dates worked
    const dialedInByName = new Map();
    for (const row of dialedInData) {
        const key = row.agent_name.toLowerCase();
        const existing = dialedInByName.get(key);
        if (!existing || row.report_date > existing.latest_date) {
            dialedInByName.set(key, {
                name: row.agent_name,
                team: row.team,
                employee_id: row.employee_id,
                latest_date: row.report_date,
                dates: existing ? [...existing.dates, row.report_date] : [row.report_date],
            });
        } else {
            existing.dates.push(row.report_date);
        }
    }
    console.log(`${dialedInData.length} rows, ${dialedInByName.size} unique agents`);

    // ══════════════════════════════════════════════════════════════════
    // SECTION 1: Channel Membership Snapshot
    // ══════════════════════════════════════════════════════════════════
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SECTION 1: CHANNEL MEMBERSHIP SNAPSHOT');
    console.log('═══════════════════════════════════════════════════════════════');

    const channelData = {}; // channelName → { memberIds, profiles }
    const allUniqueSlackIds = new Set();

    for (const ch of ALL_CHANNELS) {
        process.stdout.write(`  Fetching ${ch.name} (${ch.id})... `);
        const memberIds = await getChannelMembers(ch.id);
        channelData[ch.name] = { id: ch.id, memberIds, profiles: [] };
        memberIds.forEach(id => allUniqueSlackIds.add(id));
        console.log(`${memberIds.length} members`);
    }

    // Fetch profiles for all unique members (with caching)
    const uniqueIds = Array.from(allUniqueSlackIds);
    console.log(`\n  Fetching profiles for ${uniqueIds.length} unique Slack users...`);
    let fetched = 0;
    for (const uid of uniqueIds) {
        await getProfile(uid);
        fetched++;
        if (fetched % 50 === 0) process.stdout.write(`    ${fetched}/${uniqueIds.length}...\r`);
    }
    console.log(`  Fetched ${profileCache.size} profiles                    `);

    // Assign profiles to channels
    let totalBots = 0;
    let totalDeactivated = 0;
    for (const ch of ALL_CHANNELS) {
        const cd = channelData[ch.name];
        const humans = [];
        let bots = 0, deactivated = 0;
        for (const uid of cd.memberIds) {
            const p = profileCache.get(uid);
            if (!p) continue;
            if (p.isBot) { bots++; continue; }
            if (p.deleted) { deactivated++; continue; }
            humans.push(p);
        }
        cd.profiles = humans;
        cd.bots = bots;
        cd.deactivated = deactivated;
        totalBots += bots;
        totalDeactivated += deactivated;
    }

    console.log('');
    console.log('  Channel                  | Members | Humans | Bots | Deactivated');
    console.log('  ─────────────────────────┼─────────┼────────┼──────┼────────────');
    for (const ch of ALL_CHANNELS) {
        const cd = channelData[ch.name];
        console.log(`  ${ch.name.padEnd(25)} | ${String(cd.memberIds.length).padStart(7)} | ${String(cd.profiles.length).padStart(6)} | ${String(cd.bots).padStart(4)} | ${String(cd.deactivated).padStart(10)}`);
    }
    const totalHumans = channelData[MAIN_CHANNEL.name].profiles.length;
    console.log(`\n  Total unique Slack IDs: ${uniqueIds.length}`);
    console.log(`  Main channel humans: ${totalHumans} | Total bots: ${totalBots} | Total deactivated: ${totalDeactivated}`);

    // ══════════════════════════════════════════════════════════════════
    // SECTION 2: Terminated Agents Still in Channels
    // ══════════════════════════════════════════════════════════════════
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SECTION 2: TERMINATED AGENTS STILL IN CHANNELS [ACTION REQUIRED]');
    console.log('═══════════════════════════════════════════════════════════════');

    const terminatedInChannels = [];
    for (const ch of ALL_CHANNELS) {
        const cd = channelData[ch.name];
        for (const p of cd.profiles) {
            const emp = empBySlackId.get(p.id);
            if (emp && emp.employee_status === 'Terminated') {
                terminatedInChannels.push({
                    name: `${emp.first_name} ${emp.last_name}`,
                    slackId: p.id,
                    slackName: p.realName,
                    channel: ch.name,
                    terminatedAt: emp.terminated_at ? emp.terminated_at.split('T')[0] : 'unknown',
                });
            }
        }
    }

    // Group by person
    const termByPerson = new Map();
    for (const t of terminatedInChannels) {
        const key = t.slackId;
        if (!termByPerson.has(key)) termByPerson.set(key, { ...t, channels: [t.channel] });
        else termByPerson.get(key).channels.push(t.channel);
    }

    if (termByPerson.size === 0) {
        console.log('  None found — all terminated agents have been removed from channels.');
    } else {
        console.log(`  Found ${termByPerson.size} terminated agents still in channels:\n`);
        for (const [, t] of termByPerson) {
            console.log(`  [ACTION] ${t.name} (${t.slackId}) — Terminated: ${t.terminatedAt}`);
            console.log(`           Channels: ${t.channels.join(', ')}`);
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // SECTION 3: Active Agents Missing from Main Channel
    // ══════════════════════════════════════════════════════════════════
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SECTION 3: ACTIVE EMPLOYEES MISSING FROM MAIN CHANNEL [WARNING]');
    console.log('═══════════════════════════════════════════════════════════════');

    const mainChannelSlackIds = new Set(channelData[MAIN_CHANNEL.name].profiles.map(p => p.id));
    const activeNotInMain = active.filter(e => e.slack_user_id && !mainChannelSlackIds.has(e.slack_user_id));
    const activeNoSlackId = active.filter(e => !e.slack_user_id);

    if (activeNotInMain.length === 0) {
        console.log('  None — all active employees with Slack IDs are in the main channel.');
    } else {
        console.log(`  Found ${activeNotInMain.length} active employees with Slack ID NOT in main channel:\n`);
        for (const e of activeNotInMain) {
            console.log(`  [WARNING] ${e.first_name} ${e.last_name} (${e.slack_user_id}) — Role: ${e.role || 'N/A'}, Campaigns: ${(e.current_campaigns || []).join(', ') || 'none'}`);
        }
    }

    if (activeNoSlackId.length > 0) {
        console.log(`\n  Additionally, ${activeNoSlackId.length} active employees have NO Slack ID at all:`);
        for (const e of activeNoSlackId) {
            console.log(`  [WARNING] ${e.first_name} ${e.last_name} — Role: ${e.role || 'N/A'}, Email: ${e.email || 'N/A'}`);
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // SECTION 4: Campaign Mismatch Detection
    // ══════════════════════════════════════════════════════════════════
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SECTION 4: CAMPAIGN ASSIGNMENT AUDIT');
    console.log('═══════════════════════════════════════════════════════════════');

    // 4a. Slack channel membership vs DB current_campaigns
    console.log('\n  4a. Slack Channel Membership vs DB current_campaigns:');
    const slackCampaignsBySlackId = new Map(); // slackId → Set<campaignName>
    for (const ch of CAMPAIGN_CHANNELS) {
        const cd = channelData[ch.name];
        for (const p of cd.profiles) {
            if (!slackCampaignsBySlackId.has(p.id)) slackCampaignsBySlackId.set(p.id, new Set());
            slackCampaignsBySlackId.get(p.id).add(ch.name);
        }
    }

    let campaignMismatches = 0;
    const missingFromDB = [];
    const extraInDB = [];
    for (const agent of activeAgents) {
        if (!agent.slack_user_id) continue;
        const slackCampaigns = slackCampaignsBySlackId.get(agent.slack_user_id);
        const slackSet = slackCampaigns ? Array.from(slackCampaigns).sort() : [];
        const dbSet = (agent.current_campaigns || []).sort();

        if (JSON.stringify(slackSet) !== JSON.stringify(dbSet)) {
            campaignMismatches++;
            const inSlackNotDB = slackSet.filter(c => !dbSet.includes(c));
            const inDBNotSlack = dbSet.filter(c => !slackSet.includes(c));
            if (inSlackNotDB.length > 0) missingFromDB.push({ name: `${agent.first_name} ${agent.last_name}`, campaigns: inSlackNotDB });
            if (inDBNotSlack.length > 0) extraInDB.push({ name: `${agent.first_name} ${agent.last_name}`, campaigns: inDBNotSlack });
        }
    }

    console.log(`  Campaign mismatches between Slack channels and DB: ${campaignMismatches}`);
    if (missingFromDB.length > 0) {
        console.log(`\n  In Slack channel but NOT in DB current_campaigns (${missingFromDB.length}):`);
        for (const m of missingFromDB.slice(0, 25)) {
            console.log(`    ${m.name}: missing ${m.campaigns.join(', ')} in DB`);
        }
        if (missingFromDB.length > 25) console.log(`    ... and ${missingFromDB.length - 25} more`);
    }
    if (extraInDB.length > 0) {
        console.log(`\n  In DB current_campaigns but NOT in Slack channel (${extraInDB.length}):`);
        for (const m of extraInDB.slice(0, 25)) {
            console.log(`    ${m.name}: has ${m.campaigns.join(', ')} in DB but not in Slack channel`);
        }
        if (extraInDB.length > 25) console.log(`    ... and ${extraInDB.length - 25} more`);
    }

    // 4b. DialedIn team vs Slack campaign channels
    console.log('\n  4b. DialedIn Team Assignment vs Slack Campaign Channels:');
    let dialedInMismatches = 0;
    const dialedInMismatchList = [];

    for (const agent of activeAgents) {
        if (!agent.slack_user_id) continue;
        const fullName = `${agent.first_name} ${agent.last_name}`.toLowerCase();
        const diData = dialedInByName.get(fullName);
        if (!diData || !diData.team) continue;

        // Skip Pitch Health
        if (diData.team.toLowerCase().includes('pitch health')) continue;

        const expectedCampaign = TEAM_TO_CAMPAIGN[diData.team.toLowerCase()];
        if (!expectedCampaign) continue; // Unknown team — can't map

        const slackCampaigns = slackCampaignsBySlackId.get(agent.slack_user_id);
        const inExpectedChannel = slackCampaigns && slackCampaigns.has(expectedCampaign);

        if (!inExpectedChannel) {
            dialedInMismatches++;
            dialedInMismatchList.push({
                name: `${agent.first_name} ${agent.last_name}`,
                dialedInTeam: diData.team,
                expectedCampaign,
                actualSlackCampaigns: slackCampaigns ? Array.from(slackCampaigns).join(', ') : 'none',
                dbCampaigns: (agent.current_campaigns || []).join(', ') || 'none',
            });
        }
    }

    console.log(`  DialedIn team vs Slack channel mismatches: ${dialedInMismatches}`);
    if (dialedInMismatchList.length > 0) {
        console.log('');
        for (const m of dialedInMismatchList.slice(0, 30)) {
            console.log(`  [WARNING] ${m.name}: DialedIn team="${m.dialedInTeam}" → expects "${m.expectedCampaign}"`);
            console.log(`            Slack channels: ${m.actualSlackCampaigns} | DB campaigns: ${m.dbCampaigns}`);
        }
        if (dialedInMismatchList.length > 30) console.log(`  ... and ${dialedInMismatchList.length - 30} more`);
    }

    // 4c. Agents in no campaign channel at all
    const noCampaignChannel = activeAgents.filter(a => {
        if (!a.slack_user_id) return false;
        const slackCampaigns = slackCampaignsBySlackId.get(a.slack_user_id);
        return !slackCampaigns || slackCampaigns.size === 0;
    });
    console.log(`\n  Active agents in NO campaign channel: ${noCampaignChannel.length}`);
    if (noCampaignChannel.length > 0 && noCampaignChannel.length <= 30) {
        for (const a of noCampaignChannel) {
            const diData = dialedInByName.get(`${a.first_name} ${a.last_name}`.toLowerCase());
            console.log(`    ${a.first_name} ${a.last_name} — DialedIn team: ${diData?.team || 'no data'}, DB campaigns: ${(a.current_campaigns || []).join(', ') || 'none'}`);
        }
    } else if (noCampaignChannel.length > 30) {
        for (const a of noCampaignChannel.slice(0, 30)) {
            const diData = dialedInByName.get(`${a.first_name} ${a.last_name}`.toLowerCase());
            console.log(`    ${a.first_name} ${a.last_name} — DialedIn team: ${diData?.team || 'no data'}`);
        }
        console.log(`    ... and ${noCampaignChannel.length - 30} more`);
    }

    // ══════════════════════════════════════════════════════════════════
    // SECTION 5: Data Completeness Check
    // ══════════════════════════════════════════════════════════════════
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SECTION 5: DATA COMPLETENESS (Active Agents)');
    console.log('═══════════════════════════════════════════════════════════════');

    const isMissing = (val, field) => {
        if (val === null || val === undefined || val === '') return true;
        if (field === 'current_campaigns' && Array.isArray(val) && val.length === 0) return true;
        return false;
    };

    const criticalFields = [
        { field: 'slack_user_id', label: 'Slack User ID' },
        { field: 'current_campaigns', label: 'Campaign Assignment' },
        { field: 'hourly_wage', label: 'Hourly Wage' },
        { field: 'country', label: 'Country' },
        { field: 'email', label: 'Email' },
        { field: 'user_image', label: 'Profile Photo' },
        { field: 'hired_at', label: 'Hire Date' },
        { field: 'phone', label: 'Phone' },
    ];

    console.log(`\n  Active Agents: ${activeAgents.length}\n`);
    console.log('  Field                | Missing | % Complete');
    console.log('  ─────────────────────┼─────────┼───────────');
    for (const { field, label } of criticalFields) {
        const missing = activeAgents.filter(e => isMissing(e[field], field));
        const pct = ((activeAgents.length - missing.length) / activeAgents.length * 100).toFixed(1);
        const severity = missing.length > 0 ? (field === 'slack_user_id' || field === 'hourly_wage' ? ' [CRITICAL]' : '') : '';
        console.log(`  ${label.padEnd(21)} | ${String(missing.length).padStart(7)} | ${pct.padStart(6)}%${severity}`);
    }

    // List agents missing critical fields
    const noWage = activeAgents.filter(e => isMissing(e.hourly_wage, 'hourly_wage'));
    if (noWage.length > 0) {
        console.log(`\n  Agents missing hourly wage (${noWage.length}):`);
        for (const e of noWage.slice(0, 20)) {
            console.log(`    ${e.first_name} ${e.last_name} — Country: ${e.country || 'N/A'}, Hired: ${e.hired_at ? e.hired_at.split('T')[0] : 'N/A'}`);
        }
        if (noWage.length > 20) console.log(`    ... and ${noWage.length - 20} more`);
    }

    const noCountry = activeAgents.filter(e => isMissing(e.country, 'country'));
    if (noCountry.length > 0) {
        console.log(`\n  Agents missing country (${noCountry.length}):`);
        for (const e of noCountry.slice(0, 20)) {
            console.log(`    ${e.first_name} ${e.last_name} — Email: ${e.email || 'N/A'}`);
        }
        if (noCountry.length > 20) console.log(`    ... and ${noCountry.length - 20} more`);
    }

    // ══════════════════════════════════════════════════════════════════
    // SECTION 6: Unknown Slack Members (Not in Directory)
    // ══════════════════════════════════════════════════════════════════
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SECTION 6: UNKNOWN SLACK MEMBERS (NOT IN DIRECTORY)');
    console.log('═══════════════════════════════════════════════════════════════');

    const mainProfiles = channelData[MAIN_CHANNEL.name].profiles;
    const unknownMembers = [];
    const pitchHealthInChannel = [];
    const knownExclusions = [];

    for (const p of mainProfiles) {
        // Try to find in directory
        let emp = empBySlackId.get(p.id);
        if (!emp && p.email) emp = empByEmail.get(p.email.toLowerCase());
        if (!emp) emp = allEmployees.find(e => namesMatch(`${e.first_name} ${e.last_name}`, p.realName));

        if (!emp) {
            const nameL = p.realName.trim().toLowerCase();
            const displayL = p.displayName.trim().toLowerCase();

            if (EXCLUDED_SLACK_IDS.has(p.id) || EXCLUDED_NAMES.has(nameL) || EXCLUDED_NAMES.has(displayL)) {
                knownExclusions.push({ name: p.realName, id: p.id, email: p.email, reason: 'Known exclusion' });
            } else if (PITCH_HEALTH_NAMES.has(nameL)) {
                pitchHealthInChannel.push({ name: p.realName, id: p.id, email: p.email });
            } else {
                unknownMembers.push({ name: p.realName, displayName: p.displayName, id: p.id, email: p.email });
            }
        }
    }

    console.log(`\n  Main channel humans: ${mainProfiles.length}`);
    console.log(`  Matched to directory: ${mainProfiles.length - unknownMembers.length - pitchHealthInChannel.length - knownExclusions.length}`);
    console.log(`  Pitch Health agents in main channel: ${pitchHealthInChannel.length}`);
    console.log(`  Known exclusions: ${knownExclusions.length}`);
    console.log(`  Unknown (no directory match): ${unknownMembers.length}`);

    if (pitchHealthInChannel.length > 0) {
        console.log(`\n  Pitch Health agents in our main channel (${pitchHealthInChannel.length}):`);
        for (const m of pitchHealthInChannel) {
            console.log(`    [INFO] ${m.name} (${m.id}) — ${m.email || 'no email'}`);
        }
    }

    if (knownExclusions.length > 0) {
        console.log(`\n  Known exclusions (${knownExclusions.length}):`);
        for (const m of knownExclusions) {
            console.log(`    [INFO] ${m.name} (${m.id}) — ${m.reason}`);
        }
    }

    if (unknownMembers.length > 0) {
        console.log(`\n  Unknown members not in directory (${unknownMembers.length}):`);
        for (const m of unknownMembers) {
            console.log(`  [ACTION] ${m.name} (${m.id}) — Display: "${m.displayName}", Email: ${m.email || 'N/A'}`);
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // SECTION 7: Duplicate & Integrity Checks
    // ══════════════════════════════════════════════════════════════════
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SECTION 7: DUPLICATE & INTEGRITY CHECKS');
    console.log('═══════════════════════════════════════════════════════════════');

    // 7a. Duplicate names
    const nameMap = new Map();
    for (const e of active) {
        const key = `${(e.first_name || '').trim()} ${(e.last_name || '').trim()}`.toLowerCase();
        if (!nameMap.has(key)) nameMap.set(key, []);
        nameMap.get(key).push(e);
    }
    const dupeNames = Array.from(nameMap.entries()).filter(([, v]) => v.length > 1);

    console.log(`\n  7a. Duplicate Names (Active): ${dupeNames.length}`);
    for (const [name, dupes] of dupeNames) {
        console.log(`  [WARNING] "${name}" appears ${dupes.length} times:`);
        for (const d of dupes) {
            console.log(`    ID: ${d.id} | Email: ${d.email || 'N/A'} | Slack: ${d.slack_user_id || 'N/A'} | Role: ${d.role || 'N/A'}`);
        }
    }

    // 7b. Duplicate Slack IDs
    const slackIdMap = new Map();
    for (const e of active) {
        if (!e.slack_user_id) continue;
        if (!slackIdMap.has(e.slack_user_id)) slackIdMap.set(e.slack_user_id, []);
        slackIdMap.get(e.slack_user_id).push(e);
    }
    const dupeSlackIds = Array.from(slackIdMap.entries()).filter(([, v]) => v.length > 1);

    console.log(`\n  7b. Duplicate Slack IDs (Active): ${dupeSlackIds.length}`);
    for (const [sid, dupes] of dupeSlackIds) {
        console.log(`  [WARNING] Slack ID ${sid} shared by:`);
        for (const d of dupes) {
            console.log(`    ${d.first_name} ${d.last_name} (${d.id}) — Email: ${d.email || 'N/A'}`);
        }
    }

    // 7c. Ghost agents — Active in directory but no DialedIn data in 14 days
    const ghostAgents = activeAgents.filter(a => {
        const fullName = `${a.first_name} ${a.last_name}`.toLowerCase();
        return !dialedInByName.has(fullName);
    });

    console.log(`\n  7c. Active agents with NO DialedIn data in last 14 days: ${ghostAgents.length}`);
    if (ghostAgents.length > 0 && ghostAgents.length <= 40) {
        for (const a of ghostAgents) {
            console.log(`    ${a.first_name} ${a.last_name} — Hired: ${a.hired_at ? a.hired_at.split('T')[0] : 'N/A'}, Campaigns: ${(a.current_campaigns || []).join(', ') || 'none'}`);
        }
    } else if (ghostAgents.length > 40) {
        for (const a of ghostAgents.slice(0, 40)) {
            console.log(`    ${a.first_name} ${a.last_name} — Hired: ${a.hired_at ? a.hired_at.split('T')[0] : 'N/A'}`);
        }
        console.log(`    ... and ${ghostAgents.length - 40} more`);
    }

    // 7d. Pitch Health agents in our directory
    const pitchHealthInDir = active.filter(e => {
        const fullName = `${e.first_name} ${e.last_name}`.trim().toLowerCase();
        return PITCH_HEALTH_NAMES.has(fullName);
    });

    console.log(`\n  7d. Pitch Health agents in our Active directory: ${pitchHealthInDir.length}`);
    if (pitchHealthInDir.length > 0) {
        for (const e of pitchHealthInDir) {
            console.log(`  [ACTION] ${e.first_name} ${e.last_name} (${e.id}) — Should be removed from our directory`);
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // SUMMARY
    // ══════════════════════════════════════════════════════════════════
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  AUDIT SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');

    const actionItems = [
        termByPerson.size > 0 ? `Remove ${termByPerson.size} terminated agents from channels` : null,
        unknownMembers.length > 0 ? `Investigate ${unknownMembers.length} unknown Slack members` : null,
        pitchHealthInDir.length > 0 ? `Remove ${pitchHealthInDir.length} Pitch Health agents from directory` : null,
        dupeNames.length > 0 ? `Resolve ${dupeNames.length} duplicate name entries` : null,
        dupeSlackIds.length > 0 ? `Resolve ${dupeSlackIds.length} duplicate Slack ID entries` : null,
        campaignMismatches > 0 ? `Fix ${campaignMismatches} campaign mismatches (Slack vs DB)` : null,
        dialedInMismatches > 0 ? `Review ${dialedInMismatches} DialedIn team mismatches` : null,
        noWage.length > 0 ? `Set wages for ${noWage.length} agents missing hourly_wage` : null,
        activeNotInMain.length > 0 ? `Investigate ${activeNotInMain.length} active employees not in main channel` : null,
    ].filter(Boolean);

    if (actionItems.length === 0) {
        console.log('\n  All clear — no action items found.');
    } else {
        console.log(`\n  ${actionItems.length} action items:\n`);
        actionItems.forEach((item, i) => console.log(`  ${i + 1}. ${item}`));
    }

    console.log('\n  Audit complete.\n');
}

runAudit().catch(err => {
    console.error('Fatal audit error:', err);
    process.exit(1);
});

import { createClient } from '@supabase/supabase-js';

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const CHANNEL_ID = process.env.SLACK_HIRES_CHANNEL_ID || 'C031F6MCS9W';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getChannelMembers() {
  const allMembers = [];
  let cursor = '';
  do {
    const url = `https://slack.com/api/conversations.members?channel=${CHANNEL_ID}&limit=200${cursor ? '&cursor=' + cursor : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } });
    const data = await res.json();
    if (!data.ok) { console.error('Slack API error:', data.error); return []; }
    allMembers.push(...data.members);
    cursor = data.response_metadata?.next_cursor || '';
  } while (cursor);
  return allMembers;
}

async function getSlackProfile(userId) {
  const res = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
    headers: { Authorization: `Bearer ${SLACK_TOKEN}` },
  });
  const data = await res.json();
  if (!data.ok) return null;
  const u = data.user;
  return {
    id: u.id,
    realName: u.profile?.real_name || u.real_name || '',
    displayName: u.profile?.display_name || '',
    email: u.profile?.email || '',
    isBot: u.is_bot || u.id === 'USLACKBOT',
    deleted: u.deleted || false,
    image: u.profile?.image_192 || '',
  };
}

async function getDirectory() {
  const all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('employee_directory')
      .select('id, first_name, last_name, email, employee_status, role, slack_user_id, country, phone, hourly_wage, hired_at')
      .range(from, from + pageSize - 1);
    if (error) { console.error('DB error:', error); break; }
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function normName(s) {
  return (s || '').toLowerCase().replace(/\./g, '').replace(/\b(jr|sr|ii|iii|iv)\b/gi, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

function namesMatch(a, b) {
  const na = normName(a), nb = normName(b);
  if (na === nb) return true;
  // First word of each
  const aParts = na.split(' '), bParts = nb.split(' ');
  if (aParts[0] === bParts[0] && aParts[aParts.length - 1] === bParts[bParts.length - 1]) return true;
  // First + last only
  if (aParts.length > 2 && `${aParts[0]} ${aParts[aParts.length - 1]}` === nb) return true;
  if (bParts.length > 2 && `${bParts[0]} ${bParts[bParts.length - 1]}` === na) return true;
  return false;
}

async function main() {
  console.log('Fetching Slack channel members...');
  const memberIds = await getChannelMembers();
  console.log(`Found ${memberIds.length} Slack channel members\n`);

  console.log('Fetching Slack profiles (this may take a moment)...');
  const profiles = [];
  // Batch in groups of 20 to avoid rate limits
  for (let i = 0; i < memberIds.length; i += 20) {
    const batch = memberIds.slice(i, i + 20);
    const results = await Promise.all(batch.map(id => getSlackProfile(id)));
    profiles.push(...results.filter(Boolean));
    if (i + 20 < memberIds.length) await new Promise(r => setTimeout(r, 1200)); // rate limit
    process.stdout.write(`  ${Math.min(i + 20, memberIds.length)}/${memberIds.length}\r`);
  }
  console.log(`\nFetched ${profiles.length} profiles\n`);

  const humans = profiles.filter(p => !p.isBot && !p.deleted);
  const bots = profiles.filter(p => p.isBot);
  const deactivated = profiles.filter(p => p.deleted);
  console.log(`Humans: ${humans.length} | Bots: ${bots.length} | Deactivated: ${deactivated.length}\n`);

  console.log('Fetching employee directory...');
  const directory = await getDirectory();
  const active = directory.filter(e => e.employee_status === 'Active');
  const terminated = directory.filter(e => e.employee_status === 'Terminated');
  console.log(`Directory: ${directory.length} total (${active.length} Active, ${terminated.length} Terminated)\n`);

  // Build directory lookup maps
  const dirBySlackId = new Map();
  const dirByEmail = new Map();
  const dirByName = new Map();
  for (const e of directory) {
    if (e.slack_user_id) dirBySlackId.set(e.slack_user_id, e);
    if (e.email) dirByEmail.set(e.email.toLowerCase(), e);
    const fullName = normName(`${e.first_name} ${e.last_name}`);
    dirByName.set(fullName, e);
  }

  // === Analysis 1: Slack members NOT in directory ===
  const slackNotInDir = [];
  const slackMatchedDir = [];
  for (const p of humans) {
    let match = dirBySlackId.get(p.id);
    if (!match && p.email) match = dirByEmail.get(p.email.toLowerCase());
    if (!match) {
      // Name match
      for (const e of directory) {
        if (namesMatch(`${e.first_name} ${e.last_name}`, p.realName)) {
          match = e;
          break;
        }
      }
    }
    if (match) {
      slackMatchedDir.push({ slack: p, dir: match });
    } else {
      slackNotInDir.push(p);
    }
  }

  // === Analysis 2: Active directory members NOT in Slack channel ===
  const slackIdSet = new Set(memberIds);
  const slackEmailSet = new Set(humans.map(p => (p.email || '').toLowerCase()).filter(Boolean));
  const slackNameSet = new Set(humans.map(p => normName(p.realName)));

  const activeNotInSlack = [];
  for (const e of active) {
    if (e.slack_user_id && slackIdSet.has(e.slack_user_id)) continue;
    if (e.email && slackEmailSet.has(e.email.toLowerCase())) continue;
    const eName = normName(`${e.first_name} ${e.last_name}`);
    let found = false;
    for (const p of humans) {
      if (namesMatch(`${e.first_name} ${e.last_name}`, p.realName)) { found = true; break; }
    }
    if (!found) activeNotInSlack.push(e);
  }

  // === Analysis 3: Terminated in directory but still in Slack channel ===
  const terminatedInSlack = [];
  for (const { slack, dir } of slackMatchedDir) {
    if (dir.employee_status === 'Terminated') {
      terminatedInSlack.push({ slack, dir });
    }
  }

  // === Analysis 4: Missing data fields for active employees ===
  const missingFields = { email: [], country: [], phone: [], hourly_wage: [], slack_user_id: [] };
  for (const e of active) {
    const name = `${e.first_name} ${e.last_name}`;
    if (!e.email) missingFields.email.push(name);
    if (!e.country) missingFields.country.push(name);
    if (!e.phone) missingFields.phone.push(name);
    if (!e.hourly_wage) missingFields.hourly_wage.push(name);
    if (!e.slack_user_id) missingFields.slack_user_id.push(name);
  }

  // === Print Results ===
  console.log('='.repeat(80));
  console.log('AUDIT RESULTS');
  console.log('='.repeat(80));

  console.log(`\n--- 1. IN SLACK CHANNEL BUT NOT IN DIRECTORY (${slackNotInDir.length}) ---`);
  console.log('These people are in the Slack channel but have no matching directory entry.');
  console.log('Action: Verify if they are employees. If yes, add to directory.\n');
  for (const p of slackNotInDir.sort((a, b) => a.realName.localeCompare(b.realName))) {
    console.log(`  ${p.realName.padEnd(30)} ${(p.email || 'no email').padEnd(40)} ${p.id}`);
  }

  console.log(`\n--- 2. ACTIVE IN DIRECTORY BUT NOT IN SLACK CHANNEL (${activeNotInSlack.length}) ---`);
  console.log('These employees are marked Active but not found in the Slack channel.');
  console.log('Action: Verify status. If terminated, update directory. If active, add to Slack channel.\n');
  for (const e of activeNotInSlack.sort((a, b) => `${a.first_name}`.localeCompare(`${b.first_name}`))) {
    console.log(`  ${(e.first_name + ' ' + e.last_name).padEnd(30)} ${(e.email || 'no email').padEnd(40)} ${e.role || ''}`);
  }

  console.log(`\n--- 3. TERMINATED IN DIRECTORY BUT STILL IN SLACK CHANNEL (${terminatedInSlack.length}) ---`);
  console.log('These employees are marked Terminated but still in the Slack channel.');
  console.log('Action: Remove from Slack channel or re-activate in directory.\n');
  for (const { slack, dir } of terminatedInSlack.sort((a, b) => a.slack.realName.localeCompare(b.slack.realName))) {
    console.log(`  ${slack.realName.padEnd(30)} ${(dir.email || slack.email || 'no email').padEnd(40)}`);
  }

  console.log(`\n--- 4. MISSING DATA FIELDS FOR ACTIVE EMPLOYEES ---`);
  console.log(`  Missing email:          ${missingFields.email.length}`);
  console.log(`  Missing country:        ${missingFields.country.length}`);
  console.log(`  Missing phone:          ${missingFields.phone.length}`);
  console.log(`  Missing hourly_wage:    ${missingFields.hourly_wage.length}`);
  console.log(`  Missing slack_user_id:  ${missingFields.slack_user_id.length}`);

  if (missingFields.email.length > 0 && missingFields.email.length <= 30) {
    console.log('\n  Missing email:');
    missingFields.email.forEach(n => console.log(`    - ${n}`));
  }
  if (missingFields.country.length > 0 && missingFields.country.length <= 50) {
    console.log('\n  Missing country:');
    missingFields.country.forEach(n => console.log(`    - ${n}`));
  }

  console.log(`\n--- 5. SUMMARY ---`);
  console.log(`  Slack channel members (humans):    ${humans.length}`);
  console.log(`  Matched to directory:              ${slackMatchedDir.length}`);
  console.log(`  Directory Active employees:        ${active.length}`);
  console.log(`  Slack ↔ Directory match rate:     ${((slackMatchedDir.length / humans.length) * 100).toFixed(1)}%`);
  console.log('');
}

main().catch(console.error);

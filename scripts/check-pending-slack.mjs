import { createClient } from '@supabase/supabase-js';

const token = process.env.SLACK_BOT_TOKEN;
const channel = process.env.SLACK_HIRES_CHANNEL_ID || 'C031F6MCS9W';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getChannelMembers() {
  const all = [];
  let cursor = '';
  do {
    const url = `https://slack.com/api/conversations.members?channel=${channel}&limit=200${cursor ? '&cursor=' + cursor : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!data.ok) { console.error('Error:', data.error); return new Set(); }
    all.push(...data.members);
    cursor = data.response_metadata?.next_cursor || '';
  } while (cursor);
  return all;
}

async function getProfile(userId) {
  const res = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.ok) return null;
  const u = data.user;
  return {
    id: u.id,
    realName: u.profile?.real_name || u.real_name || '',
    email: u.profile?.email || '',
    isBot: u.is_bot || u.id === 'USLACKBOT',
  };
}

// Get pending employees
const { data: pending } = await sb.from('employee_directory')
  .select('id, first_name, last_name, email, employee_status, hired_at, country')
  .eq('employee_status', 'Pending');

console.log(`${pending.length} Pending employees to check against Slack\n`);

// Get all channel members and their profiles
const memberIds = await getChannelMembers();
console.log(`${memberIds.length} Slack channel members\n`);

// Fetch all profiles (for name matching since pending have no slack_user_id)
console.log('Fetching Slack profiles for name matching...');
const profiles = [];
for (let i = 0; i < memberIds.length; i += 20) {
  const batch = memberIds.slice(i, i + 20);
  const results = await Promise.all(batch.map(id => getProfile(id)));
  profiles.push(...results.filter(p => p && !p.isBot));
  if (i + 20 < memberIds.length) await new Promise(r => setTimeout(r, 1200));
  process.stdout.write(`  ${Math.min(i + 20, memberIds.length)}/${memberIds.length}\r`);
}
console.log(`\nFetched ${profiles.length} human profiles\n`);

const norm = s => (s || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

for (const emp of pending) {
  const empName = norm(`${emp.first_name} ${emp.last_name}`);
  const empParts = empName.split(' ');
  const empFirst = empParts[0];
  const empLast = empParts[empParts.length - 1];

  let match = null;
  for (const p of profiles) {
    const pName = norm(p.realName);
    const pParts = pName.split(' ');
    const pFirst = pParts[0];
    const pLast = pParts[pParts.length - 1];

    // Match: first name + last name (or last word)
    if (empFirst === pFirst && (empLast === pLast || pName.includes(empLast) || empName.includes(pLast))) {
      match = p;
      break;
    }
  }

  const status = match ? 'IN SLACK' : 'NOT IN SLACK';
  const pad = match ? '  ' : '';
  console.log(`${status.padEnd(15)} ${(emp.first_name + ' ' + emp.last_name).padEnd(35)} hired: ${(emp.hired_at || '').substring(0, 10)}  country: ${emp.country || 'none'}${match ? '  →  ' + match.realName + ' (' + match.email + ') ' + match.id : ''}`);
}

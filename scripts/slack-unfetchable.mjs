const token = process.env.SLACK_BOT_TOKEN;
const channel = process.env.SLACK_HIRES_CHANNEL_ID || 'C031F6MCS9W';

async function getMembers() {
  const all = [];
  let cursor = '';
  do {
    const url = `https://slack.com/api/conversations.members?channel=${channel}&limit=200${cursor ? '&cursor=' + cursor : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!data.ok) { console.error('Error:', data.error); return []; }
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
  if (!data.ok) return { id: userId, error: data.error, fetched: false };
  const u = data.user;
  return {
    id: u.id,
    realName: u.profile?.real_name || u.real_name || '',
    displayName: u.profile?.display_name || '',
    email: u.profile?.email || '',
    isBot: u.is_bot || u.id === 'USLACKBOT',
    deleted: u.deleted || false,
    fetched: true,
  };
}

const memberIds = await getMembers();
console.log(`Total channel members: ${memberIds.length}\n`);

const unfetched = [];
const bots = [];
const deleted = [];

for (let i = 0; i < memberIds.length; i += 20) {
  const batch = memberIds.slice(i, i + 20);
  const results = await Promise.all(batch.map(id => getProfile(id)));
  for (const r of results) {
    if (!r.fetched) unfetched.push(r);
    else if (r.isBot) bots.push(r);
    else if (r.deleted) deleted.push(r);
  }
  if (i + 20 < memberIds.length) await new Promise(r => setTimeout(r, 1200));
  process.stdout.write(`  ${Math.min(i + 20, memberIds.length)}/${memberIds.length}\r`);
}

console.log(`\n--- UNFETCHABLE PROFILES (${unfetched.length}) ---`);
for (const u of unfetched) {
  console.log(`  ${u.id}  error: ${u.error}`);
}

console.log(`\n--- BOTS (${bots.length}) ---`);
for (const b of bots) {
  console.log(`  ${b.realName.padEnd(30)} ${b.id}`);
}

console.log(`\n--- DEACTIVATED ACCOUNTS (${deleted.length}) ---`);
for (const d of deleted) {
  console.log(`  ${d.realName.padEnd(30)} ${(d.email || 'no email').padEnd(40)} ${d.id}`);
}

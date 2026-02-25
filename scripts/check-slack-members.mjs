const token = process.env.SLACK_BOT_TOKEN;
const channel = process.env.SLACK_HIRES_CHANNEL_ID || 'C031F6MCS9W';

async function getMembers() {
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
  return new Set(all);
}

const people = [
  { name: 'Anthony Pride', email: 'kingd505050@gmail.com', id: 'U07RL3444T0' },
  { name: 'Austen Strupp', email: 'austenstrupp555@hotmail.com', id: 'U08E63ELAH3' },
  { name: 'Diondre Bogle', email: 'diondrebogle@hotmail.com', id: 'U07E2F5G0P4' },
  { name: 'John Tierney', email: 'jwftierney@gmail.com', id: 'U09ERPPNN3U' },
  { name: 'Michael Pierce', email: 'mikeypierre19@gmail.com', id: 'U099ULY44DB' },
  { name: 'Monique Kelly Harden', email: 'moharden65@gmail.com', id: 'U0A9FJAS99D' },
  { name: 'Nameer Imam', email: 'nameerimam@gmail.com', id: 'U0AE3FWLP7Y' },
  { name: 'Shanice Henry', email: 'shanicehenry224@gmail.com', id: 'U0A71ASTYTG' },
];

const members = await getMembers();
console.log(`Channel has ${members.size} members right now\n`);

for (const p of people) {
  const status = members.has(p.id) ? 'IN CHANNEL    ' : 'NOT IN CHANNEL';
  console.log(`  ${status}  ${p.name.padEnd(25)} ${p.email}`);
}

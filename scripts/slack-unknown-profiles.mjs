const token = process.env.SLACK_BOT_TOKEN;

const unknowns = [
  { id: 'U0A2H6GBGCA', displayName: 'Maaz', email: '5millioninmybank@gmail.com' },
  { id: 'U0A2F5D9HKQ', displayName: 'Maz', email: 'bbasmillion@gmail.com' },
  { id: 'U09G87FLFU7', displayName: 'Shawn Z', email: 'shawn@pitchperfectsolutions.net' },
  { id: 'U0A403KPFAT', displayName: 'THE GRINCH', email: 'grinchmountain4lyfe@outlook.com' },
];

for (const u of unknowns) {
  const res = await fetch(`https://slack.com/api/users.info?user=${u.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.ok) { console.log(`${u.displayName}: ERROR - ${data.error}`); continue; }

  const p = data.user;
  console.log(`=== ${u.displayName} ===`);
  console.log(`  Slack ID:       ${p.id}`);
  console.log(`  Real Name:      ${p.profile?.real_name || 'N/A'}`);
  console.log(`  Display Name:   ${p.profile?.display_name || 'N/A'}`);
  console.log(`  Email:          ${p.profile?.email || 'N/A'}`);
  console.log(`  Title:          ${p.profile?.title || 'N/A'}`);
  console.log(`  Phone:          ${p.profile?.phone || 'N/A'}`);
  console.log(`  Timezone:       ${p.tz || 'N/A'} (${p.tz_label || ''})`);
  console.log(`  Status:         ${p.profile?.status_text || 'none'}`);
  console.log(`  Is Bot:         ${p.is_bot}`);
  console.log(`  Deleted:        ${p.deleted}`);
  console.log(`  Is Admin:       ${p.is_admin}`);
  console.log(`  Is Owner:       ${p.is_owner}`);
  console.log(`  Updated:        ${new Date((p.updated || 0) * 1000).toISOString().split('T')[0]}`);
  console.log('');
}

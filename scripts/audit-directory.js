const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: all, error } = await sb.from('employee_directory').select('*');
  if (error) { console.error(error); return; }

  const active = all.filter(e => e.employee_status === 'Active');
  const terminated = all.filter(e => e.employee_status === 'Terminated');
  const agents = active.filter(e => e.role === 'Agent');
  const nonAgents = active.filter(e => e.role && e.role !== 'Agent');

  console.log('=== OVERVIEW ===');
  console.log('Total records:', all.length);
  console.log('Active:', active.length, '| Terminated:', terminated.length);
  console.log('Active Agents:', agents.length, '| Active Non-Agents:', nonAgents.length);
  console.log('');

  const fields = [
    'first_name', 'last_name', 'email', 'phone', 'country',
    'slack_user_id', 'slack_display_name', 'user_image',
    'hourly_wage', 'hired_at', 'role', 'current_campaigns'
  ];

  const isMissing = (val, field) => {
    if (val === null || val === undefined || val === '') return true;
    if (field === 'current_campaigns' && Array.isArray(val) && val.length === 0) return true;
    return false;
  };

  console.log('=== MISSING DATA (Active employees) ===');
  for (const f of fields) {
    const missing = active.filter(e => isMissing(e[f], f));
    if (missing.length > 0) console.log(f + ':', missing.length, 'missing');
  }

  console.log('');
  console.log('=== MISSING DATA (Active Agents only) ===');
  for (const f of fields) {
    const missing = agents.filter(e => isMissing(e[f], f));
    if (missing.length > 0) console.log(f + ':', missing.length, 'missing');
  }

  console.log('');
  console.log('=== AGENTS MISSING WAGES ===');
  const noWage = agents.filter(e => e.hourly_wage === null || e.hourly_wage === undefined || e.hourly_wage === '');
  if (noWage.length === 0) console.log('  None — all agents have wages set');
  noWage.forEach(e => console.log(' -', e.first_name, e.last_name, '| Country:', e.country || 'N/A', '| Hired:', e.hired_at ? e.hired_at.split('T')[0] : 'N/A'));

  console.log('');
  console.log('=== AGENTS MISSING CAMPAIGNS ===');
  const noCamp = agents.filter(e => isMissing(e.current_campaigns, 'current_campaigns'));
  if (noCamp.length === 0) console.log('  None — all agents have campaigns');
  noCamp.forEach(e => console.log(' -', e.first_name, e.last_name, '| Slack:', e.slack_display_name || 'N/A'));

  console.log('');
  console.log('=== AGENTS MISSING COUNTRY ===');
  const noCountry = agents.filter(e => isMissing(e.country, 'country'));
  if (noCountry.length === 0) console.log('  None — all agents have country');
  noCountry.forEach(e => console.log(' -', e.first_name, e.last_name, '| Email:', e.email || 'N/A'));

  console.log('');
  console.log('=== ACTIVE EMPLOYEES MISSING EMAIL ===');
  const noEmail = active.filter(e => isMissing(e.email, 'email'));
  if (noEmail.length === 0) console.log('  None');
  noEmail.forEach(e => console.log(' -', e.first_name, e.last_name, '| Role:', e.role, '| Slack:', e.slack_display_name || 'N/A'));

  console.log('');
  console.log('=== ACTIVE EMPLOYEES MISSING SLACK ID ===');
  const noSlack = active.filter(e => isMissing(e.slack_user_id, 'slack_user_id'));
  if (noSlack.length === 0) console.log('  None');
  noSlack.forEach(e => console.log(' -', e.first_name, e.last_name, '| Role:', e.role, '| Email:', e.email || 'N/A'));

  console.log('');
  console.log('=== ACTIVE EMPLOYEES MISSING PHOTO ===');
  const noPhoto = active.filter(e => isMissing(e.user_image, 'user_image'));
  if (noPhoto.length === 0) console.log('  None');
  noPhoto.forEach(e => console.log(' -', e.first_name, e.last_name, '| Role:', e.role));

  console.log('');
  console.log('=== ACTIVE NON-AGENT ROLES ===');
  const roleCounts = {};
  nonAgents.forEach(e => { const r = e.role || 'NULL'; roleCounts[r] = (roleCounts[r] || 0) + 1; });
  Object.entries(roleCounts).sort((a, b) => b[1] - a[1]).forEach(([r, c]) => console.log(' ', r + ':', c));

  console.log('');
  console.log('=== POTENTIAL DUPLICATE NAMES (Active) ===');
  const nameMap = {};
  active.forEach(e => {
    const key = (e.first_name + ' ' + e.last_name).trim().toLowerCase();
    if (nameMap[key] === undefined) nameMap[key] = [];
    nameMap[key].push(e);
  });
  let dupeCount = 0;
  Object.entries(nameMap).filter(([k, v]) => v.length > 1).forEach(([name, dupes]) => {
    dupeCount++;
    console.log(' ', name, '(' + dupes.length + ' entries):');
    dupes.forEach(d => console.log('   id:', d.id, '| email:', d.email || 'N/A', '| slack:', d.slack_user_id || 'N/A', '| status:', d.employee_status));
  });
  if (dupeCount === 0) console.log('  None — no duplicate names found');

  console.log('');
  console.log('=== DUPLICATE SLACK IDS (Active) ===');
  const slackMap = {};
  active.filter(e => e.slack_user_id).forEach(e => {
    if (slackMap[e.slack_user_id] === undefined) slackMap[e.slack_user_id] = [];
    slackMap[e.slack_user_id].push(e);
  });
  let slackDupes = 0;
  Object.entries(slackMap).filter(([k, v]) => v.length > 1).forEach(([sid, dupes]) => {
    slackDupes++;
    console.log(' ', sid, '(' + dupes.length + ' entries):');
    dupes.forEach(d => console.log('   ', d.first_name, d.last_name, '| id:', d.id));
  });
  if (slackDupes === 0) console.log('  None — no duplicate Slack IDs');

  console.log('');
  console.log('=== WAGE DISTRIBUTION (Active Agents) ===');
  const wageMap = {};
  agents.filter(e => e.hourly_wage !== null && e.hourly_wage !== undefined).forEach(e => {
    const w = parseFloat(e.hourly_wage).toFixed(2);
    wageMap[w] = (wageMap[w] || 0) + 1;
  });
  Object.entries(wageMap).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0])).forEach(([w, c]) => console.log('  $' + w + ':', c, 'agents'));

  // Schedule match check
  console.log('');
  console.log('=== SCHEDULE MATCH CHECK (Active Agents vs Agent Schedule) ===');
  let allSchedules = [];
  let from = 0;
  while (true) {
    const { data: page } = await sb.from('Agent Schedule').select('"First Name", "Last Name"').range(from, from + 999);
    if (!page || page.length === 0) break;
    allSchedules = allSchedules.concat(page);
    if (page.length < 1000) break;
    from += 1000;
  }

  const schedKeys = new Set();
  allSchedules.forEach(r => {
    const f = (r['First Name'] || '').trim().toLowerCase();
    const l = (r['Last Name'] || '').trim().toLowerCase();
    if (f) schedKeys.add(f + '|' + l);
  });

  const strip = s => s.replace(/[''`.\-]/g, '').trim().toLowerCase();
  let noSchedule = 0;
  const unmatched = [];
  agents.forEach(e => {
    const f = (e.first_name || '').trim().toLowerCase();
    const l = (e.last_name || '').trim().toLowerCase();
    const fFirst = f.split(/\s+/)[0];

    // Try: exact, first-word, stripped
    if (schedKeys.has(f + '|' + l)) return;
    if (schedKeys.has(fFirst + '|' + l)) return;
    if (schedKeys.has(strip(f) + '|' + strip(l))) return;
    if (schedKeys.has(strip(fFirst) + '|' + strip(l))) return;

    // Contains matching
    for (const sk of schedKeys) {
      const [sf, sl] = sk.split('|');
      const sfFirst = sf.split(/\s+/)[0];
      const firstMatch = sf === f || sf === fFirst || sfFirst === f || sfFirst === fFirst || strip(sf) === strip(f) || strip(sfFirst) === strip(fFirst);
      if (firstMatch && (sl === l || sl.includes(l) || l.includes(sl) || strip(sl) === strip(l))) return;
    }

    noSchedule++;
    unmatched.push(e.first_name + ' ' + e.last_name);
  });
  console.log('Schedule entries:', allSchedules.length);
  console.log('Agents with schedule match:', agents.length - noSchedule, '/', agents.length);
  console.log('Agents WITHOUT schedule match:', noSchedule);
  if (unmatched.length > 0 && unmatched.length <= 30) {
    unmatched.forEach(n => console.log(' -', n));
  } else if (unmatched.length > 30) {
    unmatched.slice(0, 30).forEach(n => console.log(' -', n));
    console.log('  ... and', unmatched.length - 30, 'more');
  }

})();

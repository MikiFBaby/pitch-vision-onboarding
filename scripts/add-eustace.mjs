import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '/Users/MikiF/pitch-vision-web/.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const payroll = JSON.parse(readFileSync('/tmp/payroll_combined.json', 'utf8'));

// Find Eustace in payroll
const eustacePayroll = payroll.filter(p => p.name.toLowerCase().includes('eustace'));
console.log('=== EUSTACE IN PAYROLL ===');
for (const p of eustacePayroll) {
  console.log(JSON.stringify(p, null, 2));
}

// Check DialedIn for team/campaign info
const { data: diData } = await supabase
  .from('dialedin_agent_performance')
  .select('agent_name,team,report_date,transfers,logged_in_time_min,skill,subcampaign')
  .ilike('agent_name', '%eustace%')
  .order('report_date', { ascending: false })
  .limit(10);

console.log('\n=== EUSTACE IN DIALEDIN (recent) ===');
const teams = new Set();
const skills = new Set();
for (const d of diData) {
  if (d.team) teams.add(d.team);
  if (d.skill) skills.add(d.skill);
  console.log(`  ${d.report_date} — Team: ${d.team}, Skill: ${d.skill}, Sub: ${d.subcampaign}, ${d.transfers} transfers, ${(d.logged_in_time_min/60).toFixed(1)}h`);
}

// Check if already exists
const { data: existing } = await supabase
  .from('employee_directory')
  .select('id,first_name,last_name,employee_status')
  .or('first_name.ilike.%eustace%,last_name.ilike.%martin%');

console.log('\n=== EXISTING DIRECTORY ENTRIES ===');
for (const e of existing) {
  console.log(`  ${e.first_name} ${e.last_name} — ${e.employee_status} (${e.id})`);
}

// Also check HR Hired
const { data: hrHired } = await supabase
  .from('HR Hired')
  .select('*')
  .ilike('Employee Name', '%eustace%');

console.log('\n=== HR HIRED ===');
if (hrHired.length === 0) {
  console.log('  Not found in HR Hired');
} else {
  for (const h of hrHired) {
    console.log(`  ${h['Employee Name']} — ${h['Canadian or American']} — Hired: ${h['Hire Date']}`);
  }
}

// Determine campaign from DialedIn skill/team
let campaigns = [];
const teamStr = [...teams].join(', ') || '(no team)';
const skillStr = [...skills].join(', ') || '(no skill)';

// Check skills for campaign clues
for (const s of skills) {
  const sl = (s || '').toLowerCase();
  if (sl.includes('aca') || sl.includes('jade')) campaigns.push('ACA');
  if (sl.includes('medicare') || sl.includes('aragon') || sl.includes('whatif')) campaigns.push('Medicare');
}
campaigns = [...new Set(campaigns)];

console.log(`\n=== DERIVED INFO ===`);
console.log(`  Teams: ${teamStr}`);
console.log(`  Skills: ${skillStr}`);
console.log(`  Derived campaigns: ${JSON.stringify(campaigns)}`);

// Add to directory if not exists
const eustaceExists = existing.some(e =>
  e.first_name.toLowerCase().includes('eustace') && e.last_name.toLowerCase().includes('martin')
);

if (!eustaceExists && eustacePayroll.length > 0) {
  const pay = eustacePayroll[0];
  const country = pay.country; // from payroll combined data

  const newEntry = {
    first_name: 'Eustace',
    last_name: 'Martin',
    employee_status: 'Active',
    role: 'Agent',
    country: country,
    hourly_wage: parseFloat(pay.rate),
    current_campaigns: campaigns.length > 0 ? campaigns : ['Medicare'],
  };

  console.log('\n=== ADDING TO DIRECTORY ===');
  console.log(JSON.stringify(newEntry, null, 2));

  const { data: inserted, error } = await supabase
    .from('employee_directory')
    .insert(newEntry)
    .select('id,first_name,last_name,employee_status,country,hourly_wage,current_campaigns');

  if (error) {
    console.log(`  FAILED: ${error.message}`);
  } else {
    console.log(`  SUCCESS: ${JSON.stringify(inserted[0])}`);
  }
} else if (eustaceExists) {
  console.log('\n  Already in directory — skipping');
} else {
  console.log('\n  Not found in payroll — cannot add');
}

// Cleanup
import { unlinkSync } from 'fs';
try { unlinkSync('/Users/MikiF/pitch-vision-web/scripts/add-eustace.mjs'); } catch(e) {}

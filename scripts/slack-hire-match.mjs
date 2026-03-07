import { readFileSync } from 'fs';

import { resolve } from 'path';
const envText = readFileSync(resolve(import.meta.dirname, '../.env.local'), 'utf-8');
const env = {};
for (const l of envText.split('\n')) { const m = l.match(/^([A-Z_][A-Z_0-9]*)=["']?(.+?)["']?$/); if (m) env[m[1]] = m[2]; }
const SUPABASE_URL = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function fetchAllActiveEmployees() {
  const select = 'id,first_name,last_name,email,hired_at,slack_user_id';
  const url = `${SUPABASE_URL}/employee_directory?employee_status=eq.Active&select=${select}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'count=exact',
      'Range': '0-999',
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase error: ${res.status} ${await res.text()}`);
  }
  const contentRange = res.headers.get('content-range');
  const data = await res.json();
  
  // Check if we need more pages
  if (contentRange) {
    const match = contentRange.match(/\/(\d+)/);
    const total = match ? parseInt(match[1]) : data.length;
    if (total > 1000) {
      // Fetch remaining pages
      for (let offset = 1000; offset < total; offset += 1000) {
        const res2 = await fetch(`${url}`, {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Range: `${offset}-${offset + 999}`,
          },
        });
        const page = await res2.json();
        data.push(...page);
      }
    }
  }
  return data;
}

function daysDiff(dateA, dateB) {
  if (!dateA || !dateB) return null;
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round(Math.abs(a - b) / (1000 * 60 * 60 * 24));
}

async function main() {
  // Load Slack hire dates
  const slackData = JSON.parse(readFileSync('/Users/MikiF/pitch-vision-web/scripts/slack-hire-dates-output.json', 'utf8'));
  console.log(`Slack hire dates file: ${slackData.length} entries\n`);

  // Build lookup maps for Slack data
  const slackByEmail = new Map();
  const slackBySlackId = new Map();
  for (const entry of slackData) {
    if (entry.email) slackByEmail.set(entry.email.toLowerCase(), entry);
    if (entry.slack_user_id) slackBySlackId.set(entry.slack_user_id, entry);
  }

  // Fetch active employees from Supabase
  const employees = await fetchAllActiveEmployees();
  console.log(`Active employees in directory: ${employees.length}\n`);

  // Cross-reference
  const matched = [];
  const unmatched = [];

  for (const emp of employees) {
    const name = `${emp.first_name} ${emp.last_name}`.trim();
    let slackEntry = null;
    let matchMethod = '';

    // Try slack_user_id first
    if (emp.slack_user_id && slackBySlackId.has(emp.slack_user_id)) {
      slackEntry = slackBySlackId.get(emp.slack_user_id);
      matchMethod = 'slack_user_id';
    }
    // Then try email
    else if (emp.email && slackByEmail.has(emp.email.toLowerCase())) {
      slackEntry = slackByEmail.get(emp.email.toLowerCase());
      matchMethod = 'email';
    }

    if (slackEntry) {
      const diff = daysDiff(emp.hired_at, slackEntry.estimated_hire_date);
      matched.push({
        name,
        email: emp.email,
        directory_hired_at: emp.hired_at || '(null)',
        slack_estimated: slackEntry.estimated_hire_date,
        diff_days: diff,
        match_method: matchMethod,
        hired_at_missing: !emp.hired_at,
      });
    } else {
      unmatched.push({ name, email: emp.email, slack_user_id: emp.slack_user_id });
    }
  }

  // Sort matched by diff descending
  matched.sort((a, b) => (b.diff_days ?? -1) - (a.diff_days ?? -1));

  console.log('='.repeat(80));
  console.log('CROSS-REFERENCE SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total active employees:       ${employees.length}`);
  console.log(`Matched to Slack dates:       ${matched.length}`);
  console.log(`Unmatched:                    ${unmatched.length}`);
  console.log(`  - by slack_user_id:         ${matched.filter(m => m.match_method === 'slack_user_id').length}`);
  console.log(`  - by email:                 ${matched.filter(m => m.match_method === 'email').length}`);
  console.log();

  const withHiredAt = matched.filter(m => !m.hired_at_missing);
  const missingHiredAt = matched.filter(m => m.hired_at_missing);
  console.log(`Matched WITH hired_at:        ${withHiredAt.length}`);
  console.log(`Matched WITHOUT hired_at:     ${missingHiredAt.length}`);
  console.log();

  const bigDiff = withHiredAt.filter(m => m.diff_days > 30);
  const smallDiff = withHiredAt.filter(m => m.diff_days !== null && m.diff_days <= 30);
  const exactMatch = withHiredAt.filter(m => m.diff_days === 0);
  console.log(`Exact match (0 days):         ${exactMatch.length}`);
  console.log(`Close match (<=30 days):      ${smallDiff.length}`);
  console.log(`Significant diff (>30 days):  ${bigDiff.length}`);
  console.log();

  // Show all matched records with hired_at, grouped
  if (bigDiff.length > 0) {
    console.log('='.repeat(80));
    console.log('SIGNIFICANT DIFFERENCES (> 30 days)');
    console.log('='.repeat(80));
    console.log(
      'Name'.padEnd(30) +
      'Directory hired_at'.padEnd(22) +
      'Slack estimated'.padEnd(22) +
      'Diff (days)'.padEnd(14) +
      'Match by'
    );
    console.log('-'.repeat(96));
    for (const m of bigDiff) {
      console.log(
        m.name.padEnd(30) +
        m.directory_hired_at.padEnd(22) +
        m.slack_estimated.padEnd(22) +
        String(m.diff_days).padEnd(14) +
        m.match_method
      );
    }
    console.log();
  }

  if (smallDiff.length > 0) {
    console.log('='.repeat(80));
    console.log('CLOSE MATCHES (<= 30 days difference)');
    console.log('='.repeat(80));
    console.log(
      'Name'.padEnd(30) +
      'Directory hired_at'.padEnd(22) +
      'Slack estimated'.padEnd(22) +
      'Diff (days)'.padEnd(14) +
      'Match by'
    );
    console.log('-'.repeat(96));
    for (const m of smallDiff) {
      console.log(
        m.name.padEnd(30) +
        m.directory_hired_at.padEnd(22) +
        m.slack_estimated.padEnd(22) +
        String(m.diff_days).padEnd(14) +
        m.match_method
      );
    }
    console.log();
  }

  if (missingHiredAt.length > 0) {
    console.log('='.repeat(80));
    console.log('MATCHED BUT NO hired_at IN DIRECTORY (could backfill from Slack)');
    console.log('='.repeat(80));
    console.log(
      'Name'.padEnd(30) +
      'Slack estimated'.padEnd(22) +
      'Match by'
    );
    console.log('-'.repeat(60));
    for (const m of missingHiredAt) {
      console.log(
        m.name.padEnd(30) +
        m.slack_estimated.padEnd(22) +
        m.match_method
      );
    }
    console.log();
  }

  if (unmatched.length > 0) {
    console.log('='.repeat(80));
    console.log('UNMATCHED ACTIVE EMPLOYEES (no Slack hire date found)');
    console.log('='.repeat(80));
    console.log(
      'Name'.padEnd(30) +
      'Email'.padEnd(40) +
      'Slack ID'
    );
    console.log('-'.repeat(80));
    for (const u of unmatched) {
      console.log(
        u.name.padEnd(30) +
        (u.email || '(none)').padEnd(40) +
        (u.slack_user_id || '(none)')
      );
    }
    console.log();
  }
}

main().catch(console.error);

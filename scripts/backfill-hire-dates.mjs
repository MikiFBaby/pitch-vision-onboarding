#!/usr/bin/env node
/**
 * backfill-hire-dates.mjs
 *
 * Backfills hired_at on employee_directory using estimated_hire_date
 * from Slack account creation dates (slack-hire-dates-output.json).
 *
 * Usage:
 *   node scripts/backfill-hire-dates.mjs          # DRY RUN (default)
 *   node scripts/backfill-hire-dates.mjs --live    # Actually execute updates
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load env vars from .env.local ──────────────────────────────────────────
const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=["']?(.+?)["']?$/);
  if (match) env[match[1]] = match[2];
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const IS_LIVE = process.argv.includes('--live');
const TODAY = '2026-03-06';

console.log(`\n${'='.repeat(60)}`);
console.log(`  Backfill Hire Dates from Slack Account Creation`);
console.log(`  Mode: ${IS_LIVE ? 'LIVE (will update DB)' : 'DRY RUN (no changes)'}`);
console.log(`  Today: ${TODAY}`);
console.log(`${'='.repeat(60)}\n`);

// ── Load Slack hire dates ──────────────────────────────────────────────────
const slackDataPath = resolve(__dirname, 'slack-hire-dates-output.json');
const slackData = JSON.parse(readFileSync(slackDataPath, 'utf-8'));

// Build lookup by slack_user_id
const slackByUserId = new Map();
for (const entry of slackData) {
  if (entry.slack_user_id) {
    slackByUserId.set(entry.slack_user_id, entry);
  }
}
console.log(`Loaded ${slackData.length} Slack entries (${slackByUserId.size} with user IDs)\n`);

// ── Fetch all Active employees with pagination ─────────────────────────────
async function fetchActiveEmployees() {
  const allRows = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const url = `${SUPABASE_URL}/rest/v1/employee_directory?employee_status=eq.Active&select=id,first_name,last_name,email,hired_at,slack_user_id`;

    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Range': `${from}-${to}`,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase GET failed (${res.status}): ${body}`);
    }

    const rows = await res.json();
    allRows.push(...rows);

    // If we got fewer than pageSize, we've reached the end
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

// ── Update a single employee's hired_at ────────────────────────────────────
async function updateHiredAt(id, hiredAt) {
  const url = `${SUPABASE_URL}/rest/v1/employee_directory?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ hired_at: hiredAt }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PATCH failed for ${id}: ${res.status} ${body}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const employees = await fetchActiveEmployees();
  console.log(`Fetched ${employees.length} Active employees from employee_directory\n`);

  const updates = [];
  const skippedNoSlack = [];
  const skippedNoMatch = [];
  const skippedFuture = [];
  const skippedEustace = [];

  for (const emp of employees) {
    const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();

    // Skip Eustace Martin
    if (fullName.toLowerCase() === 'eustace martin') {
      skippedEustace.push(fullName);
      continue;
    }

    // Skip employees without slack_user_id
    if (!emp.slack_user_id) {
      skippedNoSlack.push(fullName);
      continue;
    }

    // Find matching Slack entry
    const slackEntry = slackByUserId.get(emp.slack_user_id);
    if (!slackEntry) {
      skippedNoMatch.push({ name: fullName, slack_user_id: emp.slack_user_id });
      continue;
    }

    const estimatedDate = slackEntry.estimated_hire_date;

    // Skip future dates
    if (estimatedDate > TODAY) {
      skippedFuture.push({ name: fullName, date: estimatedDate });
      continue;
    }

    updates.push({
      id: emp.id,
      name: fullName,
      email: emp.email,
      currentHiredAt: emp.hired_at,
      newHiredAt: estimatedDate,
      slackName: slackEntry.fullname,
    });
  }

  // ── Print updates ──────────────────────────────────────────────────────
  console.log(`--- UPDATES (${updates.length}) ---\n`);
  console.log(
    'Name'.padEnd(30) +
    'Current hired_at'.padEnd(22) +
    'New hired_at'.padEnd(16) +
    'Slack Name'
  );
  console.log('-'.repeat(90));

  for (const u of updates) {
    console.log(
      u.name.padEnd(30) +
      (u.currentHiredAt || '(null)').padEnd(22) +
      u.newHiredAt.padEnd(16) +
      u.slackName
    );
  }

  // ── Print skips ────────────────────────────────────────────────────────
  console.log(`\n--- SKIPPED ---`);
  console.log(`  No slack_user_id:     ${skippedNoSlack.length}`);
  if (skippedNoSlack.length > 0) {
    console.log(`    ${skippedNoSlack.join(', ')}`);
  }
  console.log(`  No Slack data match:  ${skippedNoMatch.length}`);
  if (skippedNoMatch.length > 0) {
    for (const s of skippedNoMatch) {
      console.log(`    ${s.name} (${s.slack_user_id})`);
    }
  }
  console.log(`  Future hire date:     ${skippedFuture.length}`);
  if (skippedFuture.length > 0) {
    for (const s of skippedFuture) {
      console.log(`    ${s.name} (${s.date})`);
    }
  }
  console.log(`  Eustace Martin:       ${skippedEustace.length}`);

  // ── Summary ────────────────────────────────────────────────────────────
  console.log(`\n--- SUMMARY ---`);
  console.log(`  Total Active employees: ${employees.length}`);
  console.log(`  Would update:           ${updates.length}`);
  console.log(`  Skipped:                ${employees.length - updates.length}`);

  // ── Execute if --live ──────────────────────────────────────────────────
  if (IS_LIVE) {
    console.log(`\nExecuting ${updates.length} updates...`);
    let success = 0;
    let failed = 0;

    for (const u of updates) {
      try {
        await updateHiredAt(u.id, u.newHiredAt);
        success++;
        if (success % 20 === 0) {
          console.log(`  ...updated ${success}/${updates.length}`);
        }
      } catch (err) {
        console.error(`  FAILED: ${u.name} -- ${err.message}`);
        failed++;
      }
    }

    console.log(`\nDone. ${success} updated, ${failed} failed.`);
  } else {
    console.log(`\nDRY RUN complete. Pass --live to execute updates.`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

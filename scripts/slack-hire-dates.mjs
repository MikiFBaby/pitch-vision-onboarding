#!/usr/bin/env node
/**
 * slack-hire-dates.mjs
 *
 * Reads a Slack member CSV export, decodes Slack user IDs to numeric values,
 * uses known calibration points (Slack profile start_date) to build a
 * piecewise-linear interpolation from decoded-ID -> date, and outputs
 * estimated creation / hire dates for every member.
 *
 * Usage:  node scripts/slack-hire-dates.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// --- Config ---

const CSV_PATH = '/Users/MikiF/Desktop/slack-pitchperfectsolutions-members.csv';
const OUTPUT_PATH = resolve(
  '/Users/MikiF/pitch-vision-web/scripts/slack-hire-dates-output.json',
);

// Known calibration points: slack_user_id -> ISO date string (YYYY-MM-DD)
const CALIBRATION_POINTS = [
  { id: 'U030RE7JE6N', date: '2021-11-17' },
  { id: 'U032D1HHH2M', date: '2022-02-01' },
  { id: 'U0339JCUHFW', date: '2022-02-15' },
  { id: 'U037ASFMAJ4', date: '2022-11-14' },
  { id: 'U04KBMU7WDB', date: '2023-03-01' },
  { id: 'U04ST3QG85N', date: '2023-03-21' },
  { id: 'U057CLQGQBE', date: '2023-06-05' },
  { id: 'U05V14ER5NZ', date: '2023-09-18' },
  { id: 'U06DKRHBDCH', date: '2024-01-02' },
  { id: 'U07TBG1QVKL', date: '2024-10-14' },
];

// --- Helpers ---

/**
 * Decode a Slack user ID (U + base36 alphanumeric string) to a numeric value.
 * Slack IDs use uppercase A-Z + 0-9 which is standard base-36.
 */
function decodeSlackId(uid) {
  if (!uid || uid.length < 2 || uid[0] !== 'U') return null;
  const body = uid.slice(1); // strip leading 'U'
  const num = parseInt(body, 36);
  if (isNaN(num)) return null;
  return num;
}

/** Parse YYYY-MM-DD to epoch ms */
function dateToMs(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').getTime();
}

/** Format epoch ms to YYYY-MM-DD */
function msToDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Days between two epoch-ms values */
function msToDays(ms) {
  return ms / (1000 * 60 * 60 * 24);
}

// --- Build calibration table (sorted by decoded numeric ID) ---

const calibration = CALIBRATION_POINTS.map((cp) => ({
  id: cp.id,
  decoded: decodeSlackId(cp.id),
  dateStr: cp.date,
  dateMs: dateToMs(cp.date),
})).sort((a, b) => a.decoded - b.decoded);

console.log('=== Calibration Points (sorted by decoded ID) ===');
console.log(
  'Slack ID          | Decoded Numeric    | Date',
);
console.log('-'.repeat(62));
for (const cp of calibration) {
  console.log(
    `${cp.id.padEnd(18)}| ${String(cp.decoded).padEnd(19)}| ${cp.dateStr}`,
  );
}
console.log();

// --- Piecewise linear interpolation ---

/**
 * Given a decoded numeric ID, interpolate a date using the calibration points.
 * - Between two calibration points: linear interpolation
 * - Below the first calibration point: extrapolate from the first two
 * - Above the last calibration point: extrapolate from the last two
 */
function interpolateDate(decodedId) {
  if (decodedId == null) return null;

  // Find the interval
  for (let i = 0; i < calibration.length - 1; i++) {
    const lo = calibration[i];
    const hi = calibration[i + 1];
    if (decodedId >= lo.decoded && decodedId <= hi.decoded) {
      const t = (decodedId - lo.decoded) / (hi.decoded - lo.decoded);
      const ms = lo.dateMs + t * (hi.dateMs - lo.dateMs);
      return msToDate(ms);
    }
  }

  // Extrapolate below
  if (decodedId < calibration[0].decoded) {
    const lo = calibration[0];
    const hi = calibration[1];
    const rate = (hi.dateMs - lo.dateMs) / (hi.decoded - lo.decoded);
    const ms = lo.dateMs + rate * (decodedId - lo.decoded);
    return msToDate(ms);
  }

  // Extrapolate above
  const lo = calibration[calibration.length - 2];
  const hi = calibration[calibration.length - 1];
  const rate = (hi.dateMs - lo.dateMs) / (hi.decoded - lo.decoded);
  const ms = hi.dateMs + rate * (decodedId - hi.decoded);
  return msToDate(ms);
}

// --- Calibration quality check ---

console.log('=== Calibration Quality (leave-one-out cross-validation) ===');
console.log(
  'Slack ID          | Actual Date  | Estimated    | Error (days)',
);
console.log('-'.repeat(65));

let totalAbsError = 0;
let maxAbsError = 0;

for (let i = 0; i < calibration.length; i++) {
  const cp = calibration[i];

  // Build a temporary calibration table without this point
  const tempCal = calibration.filter((_, j) => j !== i);

  // Interpolate using the remaining points
  function interpWithout(decodedId) {
    for (let k = 0; k < tempCal.length - 1; k++) {
      const lo = tempCal[k];
      const hi = tempCal[k + 1];
      if (decodedId >= lo.decoded && decodedId <= hi.decoded) {
        const t = (decodedId - lo.decoded) / (hi.decoded - lo.decoded);
        const ms = lo.dateMs + t * (hi.dateMs - lo.dateMs);
        return msToDate(ms);
      }
    }
    if (decodedId < tempCal[0].decoded) {
      const lo = tempCal[0];
      const hi = tempCal[1];
      const rate = (hi.dateMs - lo.dateMs) / (hi.decoded - lo.decoded);
      const ms = lo.dateMs + rate * (decodedId - lo.decoded);
      return msToDate(ms);
    }
    const lo2 = tempCal[tempCal.length - 2];
    const hi2 = tempCal[tempCal.length - 1];
    const rate = (hi2.dateMs - lo2.dateMs) / (hi2.decoded - lo2.decoded);
    const ms = hi2.dateMs + rate * (decodedId - hi2.decoded);
    return msToDate(ms);
  }

  const estimated = interpWithout(cp.decoded);
  const errorDays = msToDays(
    Math.abs(dateToMs(estimated) - cp.dateMs),
  ).toFixed(1);
  totalAbsError += parseFloat(errorDays);
  maxAbsError = Math.max(maxAbsError, parseFloat(errorDays));

  console.log(
    `${cp.id.padEnd(18)}| ${cp.dateStr.padEnd(13)}| ${estimated.padEnd(13)}| ${errorDays}`,
  );
}

const meanError = (totalAbsError / calibration.length).toFixed(1);
console.log('-'.repeat(65));
console.log(`Mean absolute error: ${meanError} days`);
console.log(`Max absolute error:  ${maxAbsError} days`);
console.log();

// Also show self-prediction (should be ~0)
console.log('=== Self-prediction (using all calibration points) ===');
console.log(
  'Slack ID          | Actual Date  | Predicted    | Error (days)',
);
console.log('-'.repeat(65));
for (const cp of calibration) {
  const predicted = interpolateDate(cp.decoded);
  const errorDays = msToDays(
    Math.abs(dateToMs(predicted) - cp.dateMs),
  ).toFixed(1);
  console.log(
    `${cp.id.padEnd(18)}| ${cp.dateStr.padEnd(13)}| ${predicted.padEnd(13)}| ${errorDays}`,
  );
}
console.log();

// --- Parse CSV ---

const raw = readFileSync(CSV_PATH, 'utf-8');
const lines = raw.split('\n').filter((l) => l.trim());
const header = parseCSVLine(lines[0]);

/**
 * Minimal CSV parser that handles quoted fields with commas inside.
 */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

// Map header names to indices
const colIdx = {};
header.forEach((h, i) => {
  colIdx[h.trim().toLowerCase()] = i;
});

console.log(`CSV columns: ${header.join(', ')}`);
console.log(`Total data rows: ${lines.length - 1}`);
console.log();

// --- Process all rows ---

const results = [];
let skipped = 0;

for (let i = 1; i < lines.length; i++) {
  const fields = parseCSVLine(lines[i]);
  const email = (fields[colIdx['email']] || '').trim();
  const userId = (fields[colIdx['userid']] || '').trim();
  const fullname = (fields[colIdx['fullname']] || '').trim();
  const status = (fields[colIdx['status']] || '').trim();
  const username = (fields[colIdx['username']] || '').trim();

  if (!userId) {
    skipped++;
    continue;
  }

  const decoded = decodeSlackId(userId);
  if (decoded == null) {
    skipped++;
    continue;
  }

  const estimatedDate = interpolateDate(decoded);

  results.push({
    email: email || null,
    estimated_hire_date: estimatedDate,
    slack_user_id: userId,
    fullname,
    decoded_id: decoded,
    status,
    username,
  });
}

// Sort by estimated date
results.sort((a, b) => (a.estimated_hire_date || '').localeCompare(b.estimated_hire_date || ''));

// --- Write output ---

writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf-8');

console.log(`Processed: ${results.length} members`);
console.log(`Skipped:   ${skipped} (no valid user ID)`);
console.log(`Output:    ${OUTPUT_PATH}`);
console.log();

// --- Summary stats ---

// Date distribution by year
const byYear = {};
for (const r of results) {
  const year = r.estimated_hire_date ? r.estimated_hire_date.slice(0, 4) : 'unknown';
  byYear[year] = (byYear[year] || 0) + 1;
}

console.log('=== Estimated Hire Date Distribution by Year ===');
for (const [year, count] of Object.entries(byYear).sort()) {
  console.log(`  ${year}: ${count} members`);
}
console.log();

// Show earliest and latest
const earliest = results[0];
const latest = results[results.length - 1];
console.log(`Earliest: ${earliest.estimated_hire_date} - ${earliest.fullname} (${earliest.slack_user_id})`);
console.log(`Latest:   ${latest.estimated_hire_date} - ${latest.fullname} (${latest.slack_user_id})`);
console.log();

// Status breakdown
const byStatus = {};
for (const r of results) {
  byStatus[r.status] = (byStatus[r.status] || 0) + 1;
}
console.log('=== Status Breakdown ===');
for (const [status, count] of Object.entries(byStatus).sort()) {
  console.log(`  ${status}: ${count}`);
}

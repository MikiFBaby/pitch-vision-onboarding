#!/usr/bin/env node
/**
 * schedule-audit.mjs
 * Thorough audit of Active agents missing from Agent Schedule / Agent Break Schedule.
 * Uses Supabase REST API with pagination.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = resolve(__dirname, '..', '.env.local');
const envText = readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*)"?$/);
  if (m) env[m[1]] = m[2];
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SERVICE_KEY');
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'count=exact',
};

// ── Paginated fetch helper ───────────────────────────────────────────────────
async function fetchAll(table, select = '*', filters = '') {
  const rows = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const encodedTable = encodeURIComponent(table);
    const url = `${SUPABASE_URL}/rest/v1/${encodedTable}?select=${encodeURIComponent(select)}${filters}&offset=${offset}&limit=${PAGE}`;
    const res = await fetch(url, { headers: { ...headers, Range: `${offset}-${offset + PAGE - 1}` } });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Fetch ${table} failed (${res.status}): ${body}`);
    }
    const data = await res.json();
    rows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

// ── Normalize helpers ────────────────────────────────────────────────────────
function norm(s) {
  if (!s) return '';
  return s
    .normalize('NFKD')
    .replace(/[\u2018\u2019\u0060\u00B4]/g, "'")
    .replace(/['\u2018\u2019`\u00B4]/g, "'")
    .replace(/\./g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function stripSuffix(s) {
  return s.replace(/\b(jr|sr|iii|ii|iv)\b\.?/gi, '').trim().replace(/\s+/g, ' ');
}

function stripMiddleInitials(s) {
  return s.replace(/\b[a-z]\b/gi, '').trim().replace(/\s+/g, ' ');
}

// ── Build lookup key variants for a schedule entry ───────────────────────────
function scheduleKeys(firstName, lastName) {
  const fn = norm(firstName);
  const ln = norm(lastName);
  if (!fn && !ln) return [];

  const full = `${fn} ${ln}`.trim();
  const keys = new Set();
  keys.add(full);

  keys.add(stripSuffix(full));
  keys.add(stripMiddleInitials(stripSuffix(full)));

  // Swapped
  keys.add(`${ln} ${fn}`.trim());

  // Hyphenated parts
  for (const part of fn.split(/[-\u2013]/)) {
    if (part.trim().length > 1) {
      keys.add(`${part.trim()} ${ln}`.trim());
    }
  }
  for (const part of ln.split(/[-\u2013]/)) {
    if (part.trim().length > 1) {
      keys.add(`${fn} ${part.trim()}`.trim());
    }
  }

  return [...keys];
}

// ── Build lookup key variants for a directory entry ──────────────────────────
function directoryKeys(fullName) {
  const n = norm(fullName);
  if (!n) return [];

  const keys = new Set();
  keys.add(n);

  const stripped = stripSuffix(n);
  keys.add(stripped);
  keys.add(stripMiddleInitials(stripped));

  const parts = stripped.split(' ');
  if (parts.length >= 3) {
    keys.add(`${parts[0]} ${parts[parts.length - 1]}`);
  }

  if (parts.length >= 2) {
    keys.add(`${parts[parts.length - 1]} ${parts[0]}`);
  }

  // Hyphen splits
  for (const part of n.split(/[-\u2013]/)) {
    const trimmed = part.trim();
    if (trimmed.length > 1 && trimmed !== n) {
      keys.add(trimmed);
    }
  }

  return [...keys];
}

// ── Levenshtein distance ─────────────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Fetching data from Supabase...\n');

  const [activeAgents, scheduleRows, breakRows] = await Promise.all([
    fetchAll('employee_directory', 'id,first_name,last_name,employee_status,role,hired_at', '&employee_status=eq.Active&role=eq.Agent'),
    fetchAll('Agent Schedule', 'First Name,Last Name,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Notes'),
    fetchAll('Agent Break Schedule', 'First Name,Last Name,First Break,Lunch Break,Second Break,Notes'),
  ]);

  console.log(`Active Agents (role=Agent): ${activeAgents.length}`);
  console.log(`Agent Schedule entries:     ${scheduleRows.length}`);
  console.log(`Break Schedule entries:     ${breakRows.length}`);
  console.log('');

  // ── Build schedule lookup maps ───────────────────────────────────────────
  const schedMap = new Map();
  const breakMap = new Map();

  for (const row of scheduleRows) {
    const fn = row['First Name'] || '';
    const ln = row['Last Name'] || '';
    const origName = `${fn} ${ln}`.trim();
    const keys = scheduleKeys(fn, ln);
    for (const k of keys) {
      if (!schedMap.has(k)) {
        schedMap.set(k, { name: origName, row });
      }
    }
  }

  for (const row of breakRows) {
    const fn = row['First Name'] || '';
    const ln = row['Last Name'] || '';
    const origName = `${fn} ${ln}`.trim();
    const keys = scheduleKeys(fn, ln);
    for (const k of keys) {
      if (!breakMap.has(k)) {
        breakMap.set(k, { name: origName, row });
      }
    }
  }

  // Build last-name-only maps for unique last names
  const schedByLast = new Map();
  for (const row of scheduleRows) {
    const fn = norm(row['First Name'] || '');
    const ln = norm(row['Last Name'] || '');
    if (!ln) continue;
    if (!schedByLast.has(ln)) schedByLast.set(ln, []);
    schedByLast.get(ln).push({ name: `${row['First Name'] || ''} ${row['Last Name'] || ''}`.trim(), fn, ln });
  }

  const breakByLast = new Map();
  for (const row of breakRows) {
    const fn = norm(row['First Name'] || '');
    const ln = norm(row['Last Name'] || '');
    if (!ln) continue;
    if (!breakByLast.has(ln)) breakByLast.set(ln, []);
    breakByLast.get(ln).push({ name: `${row['First Name'] || ''} ${row['Last Name'] || ''}`.trim(), fn, ln });
  }

  // ── Match each active agent ────────────────────────────────────────────
  const results = [];

  for (const agent of activeAgents) {
    const fullName = `${agent.first_name || ''} ${agent.last_name || ''}`.trim();
    const dirKeys = directoryKeys(fullName);
    const firstName = norm(agent.first_name || '');
    const lastName = norm(agent.last_name || '');
    const nameParts = norm(fullName).split(' ');

    let schedMatch = null;
    let schedMatchType = null;
    let breakMatch = null;
    let breakMatchType = null;

    // ─── Helper to classify match type ───
    function classifyType(key, normFull) {
      if (key === normFull) return 'exact';
      if (key === stripSuffix(normFull)) return 'suffix-removed';
      if (key === stripMiddleInitials(stripSuffix(normFull))) return 'middle-initial-removed';
      if (nameParts.length >= 2 && key === `${nameParts[nameParts.length - 1]} ${nameParts[0]}`) return 'name-swap';
      if (nameParts.length >= 3 && key === `${nameParts[0]} ${nameParts[nameParts.length - 1]}`) return 'middle-name-drop';
      if (key.includes(' ') && norm(fullName).includes('-')) return 'hyphen-split';
      return 'normalized';
    }

    // ─── Strategy 1: Key-based matching ───
    const normFull = norm(fullName);
    for (const key of dirKeys) {
      if (!schedMatch && schedMap.has(key)) {
        schedMatch = schedMap.get(key).name;
        schedMatchType = classifyType(key, normFull);
      }
      if (!breakMatch && breakMap.has(key)) {
        breakMatch = breakMap.get(key).name;
        breakMatchType = classifyType(key, normFull);
      }
    }

    // ─── Strategy 2: Nickname matching (first 3+ chars + exact last name) ───
    if (!schedMatch && firstName.length >= 3 && lastName) {
      for (const [k, v] of schedMap) {
        const kParts = k.split(' ');
        if (kParts.length >= 2) {
          const kFirst = kParts[0];
          const kLast = kParts.slice(1).join(' ');
          if (kLast === lastName && kFirst.length >= 3 && firstName.length >= 3) {
            const minLen = Math.min(3, firstName.length, kFirst.length);
            if (firstName.substring(0, minLen) === kFirst.substring(0, minLen) && firstName !== kFirst) {
              schedMatch = v.name;
              schedMatchType = `nickname (${kFirst} ~ ${firstName})`;
              break;
            }
          }
        }
      }
    }
    if (!breakMatch && firstName.length >= 3 && lastName) {
      for (const [k, v] of breakMap) {
        const kParts = k.split(' ');
        if (kParts.length >= 2) {
          const kFirst = kParts[0];
          const kLast = kParts.slice(1).join(' ');
          if (kLast === lastName && kFirst.length >= 3 && firstName.length >= 3) {
            const minLen = Math.min(3, firstName.length, kFirst.length);
            if (firstName.substring(0, minLen) === kFirst.substring(0, minLen) && firstName !== kFirst) {
              breakMatch = v.name;
              breakMatchType = `nickname (${kFirst} ~ ${firstName})`;
              break;
            }
          }
        }
      }
    }

    // ─── Strategy 3: Last name only + first initial (unique last names) ───
    if (!schedMatch && lastName && firstName) {
      const candidates = schedByLast.get(lastName);
      if (candidates && candidates.length === 1) {
        const c = candidates[0];
        if (c.fn && firstName[0] === c.fn[0]) {
          schedMatch = c.name;
          schedMatchType = `last-name-unique + first-initial (${c.fn[0]})`;
        }
      }
    }
    if (!breakMatch && lastName && firstName) {
      const candidates = breakByLast.get(lastName);
      if (candidates && candidates.length === 1) {
        const c = candidates[0];
        if (c.fn && firstName[0] === c.fn[0]) {
          breakMatch = c.name;
          breakMatchType = `last-name-unique + first-initial (${c.fn[0]})`;
        }
      }
    }

    // ─── Strategy 4: Partial last name match (compound last names without hyphen) ───
    if (!schedMatch && lastName) {
      const lastParts = lastName.split(' ');
      if (lastParts.length >= 2) {
        for (const part of lastParts) {
          if (part.length > 2) {
            const tryKey = `${firstName} ${part}`;
            if (schedMap.has(tryKey)) {
              schedMatch = schedMap.get(tryKey).name;
              schedMatchType = `compound-last-name (matched "${part}")`;
              break;
            }
          }
        }
      }
    }
    if (!breakMatch && lastName) {
      const lastParts = lastName.split(' ');
      if (lastParts.length >= 2) {
        for (const part of lastParts) {
          if (part.length > 2) {
            const tryKey = `${firstName} ${part}`;
            if (breakMap.has(tryKey)) {
              breakMatch = breakMap.get(tryKey).name;
              breakMatchType = `compound-last-name (matched "${part}")`;
              break;
            }
          }
        }
      }
    }

    // ─── Strategy 5: Fuzzy first name with exact last name (Levenshtein <= 2) ───
    if (!schedMatch && firstName.length >= 4 && lastName) {
      for (const [k, v] of schedMap) {
        const kParts = k.split(' ');
        if (kParts.length >= 2) {
          const kFirst = kParts[0];
          const kLast = kParts.slice(1).join(' ');
          if (kLast === lastName && kFirst.length >= 3) {
            const dist = levenshtein(firstName, kFirst);
            if (dist > 0 && dist <= 2) {
              schedMatch = v.name;
              schedMatchType = `fuzzy-first-name (lev=${dist}: "${kFirst}" ~ "${firstName}")`;
              break;
            }
          }
        }
      }
    }
    if (!breakMatch && firstName.length >= 4 && lastName) {
      for (const [k, v] of breakMap) {
        const kParts = k.split(' ');
        if (kParts.length >= 2) {
          const kFirst = kParts[0];
          const kLast = kParts.slice(1).join(' ');
          if (kLast === lastName && kFirst.length >= 3) {
            const dist = levenshtein(firstName, kFirst);
            if (dist > 0 && dist <= 2) {
              breakMatch = v.name;
              breakMatchType = `fuzzy-first-name (lev=${dist}: "${kFirst}" ~ "${firstName}")`;
              break;
            }
          }
        }
      }
    }

    // ─── Strategy 6: Fuzzy last name with exact first name (Levenshtein <= 2) ───
    if (!schedMatch && lastName.length >= 4 && firstName) {
      for (const [k, v] of schedMap) {
        const kParts = k.split(' ');
        if (kParts.length >= 2) {
          const kFirst = kParts[0];
          const kLast = kParts.slice(1).join(' ');
          if (kFirst === firstName && kLast.length >= 3) {
            const dist = levenshtein(lastName, kLast);
            if (dist > 0 && dist <= 2) {
              schedMatch = v.name;
              schedMatchType = `fuzzy-last-name (lev=${dist}: "${kLast}" ~ "${lastName}")`;
              break;
            }
          }
        }
      }
    }
    if (!breakMatch && lastName.length >= 4 && firstName) {
      for (const [k, v] of breakMap) {
        const kParts = k.split(' ');
        if (kParts.length >= 2) {
          const kFirst = kParts[0];
          const kLast = kParts.slice(1).join(' ');
          if (kFirst === firstName && kLast.length >= 3) {
            const dist = levenshtein(lastName, kLast);
            if (dist > 0 && dist <= 2) {
              breakMatch = v.name;
              breakMatchType = `fuzzy-last-name (lev=${dist}: "${kLast}" ~ "${lastName}")`;
              break;
            }
          }
        }
      }
    }

    // ─── Strategy 7: First name only match when schedule has empty last name ───
    if (!schedMatch && firstName) {
      for (const [k, v] of schedMap) {
        if (k === firstName && !k.includes(' ')) {
          schedMatch = v.name;
          schedMatchType = 'first-name-only (empty last in schedule)';
          break;
        }
      }
    }
    if (!breakMatch && firstName) {
      for (const [k, v] of breakMap) {
        if (k === firstName && !k.includes(' ')) {
          breakMatch = v.name;
          breakMatchType = 'first-name-only (empty last in schedule)';
          break;
        }
      }
    }

    results.push({
      directoryName: fullName,
      hireDate: agent.hired_at ? agent.hired_at.split('T')[0] : 'N/A',
      schedMatch,
      schedMatchType,
      breakMatch,
      breakMatchType,
    });
  }

  // ── Categorize results ─────────────────────────────────────────────────
  const trulyMissing = results.filter(r => !r.schedMatch && !r.breakMatch);
  const noSchedule = results.filter(r => !r.schedMatch);
  const noBreak = results.filter(r => !r.breakMatch);
  const bothMatched = results.filter(r => r.schedMatch && r.breakMatch);
  const noSchedHasBreak = results.filter(r => !r.schedMatch && r.breakMatch);
  const noBreakHasSched = results.filter(r => r.schedMatch && !r.breakMatch);

  // ── Print report ───────────────────────────────────────────────────────
  console.log('='.repeat(100));
  console.log('  SCHEDULE AUDIT REPORT -- Active Agents vs Agent Schedule & Break Schedule');
  console.log('='.repeat(100));

  // ── Section 1: Exact matches ──────────────────────────────────────────
  const exactBoth = results.filter(r => r.schedMatchType === 'exact' && r.breakMatchType === 'exact');
  console.log(`\n${'─'.repeat(100)}`);
  console.log(`  EXACT MATCHES (both schedules): ${exactBoth.length}`);
  console.log(`${'─'.repeat(100)}`);
  for (const r of exactBoth.sort((a, b) => a.directoryName.localeCompare(b.directoryName))) {
    console.log(`    ${r.directoryName}`);
  }

  // ── Section 2: Non-exact solvable matches ─────────────────────────────
  console.log(`\n${'─'.repeat(100)}`);
  console.log('  SOLVABLE MATCHES (non-exact -- grouped by match type)');
  console.log(`${'─'.repeat(100)}`);

  const allSolvable = results.filter(r =>
    (r.schedMatch && r.schedMatchType !== 'exact') ||
    (r.breakMatch && r.breakMatchType !== 'exact')
  );

  if (allSolvable.length === 0) {
    console.log('  (none)');
  } else {
    const byType = {};
    for (const r of allSolvable) {
      const primaryType = (r.schedMatchType && r.schedMatchType !== 'exact')
        ? r.schedMatchType
        : r.breakMatchType;
      const typeKey = primaryType.split(' (')[0]; // group parameterized types
      if (!byType[typeKey]) byType[typeKey] = [];
      byType[typeKey].push(r);
    }

    for (const [type, items] of Object.entries(byType).sort()) {
      console.log(`\n  >> ${type.toUpperCase()} (${items.length}):`);
      for (const r of items.sort((a, b) => a.directoryName.localeCompare(b.directoryName))) {
        const schedInfo = r.schedMatch
          ? `Sched: "${r.schedMatch}" [${r.schedMatchType}]`
          : 'Sched: MISSING';
        const breakInfo = r.breakMatch
          ? `Break: "${r.breakMatch}" [${r.breakMatchType}]`
          : 'Break: MISSING';
        console.log(`    ${r.directoryName.padEnd(35)} | Hired: ${String(r.hireDate).padEnd(12)} | ${schedInfo} | ${breakInfo}`);
      }
    }
  }

  // ── Section 3: Missing from schedule only ─────────────────────────────
  if (noSchedHasBreak.length > 0) {
    console.log(`\n${'─'.repeat(100)}`);
    console.log(`  MISSING FROM AGENT SCHEDULE ONLY (have break schedule): ${noSchedHasBreak.length}`);
    console.log(`${'─'.repeat(100)}`);
    for (const r of noSchedHasBreak.sort((a, b) => a.directoryName.localeCompare(b.directoryName))) {
      console.log(`    ${r.directoryName.padEnd(35)} | Hired: ${String(r.hireDate).padEnd(12)} | Break: "${r.breakMatch}" [${r.breakMatchType}]`);
    }
  }

  // ── Section 4: Missing from break only ────────────────────────────────
  if (noBreakHasSched.length > 0) {
    console.log(`\n${'─'.repeat(100)}`);
    console.log(`  MISSING FROM BREAK SCHEDULE ONLY (have agent schedule): ${noBreakHasSched.length}`);
    console.log(`${'─'.repeat(100)}`);
    for (const r of noBreakHasSched.sort((a, b) => a.directoryName.localeCompare(b.directoryName))) {
      console.log(`    ${r.directoryName.padEnd(35)} | Hired: ${String(r.hireDate).padEnd(12)} | Sched: "${r.schedMatch}" [${r.schedMatchType}]`);
    }
  }

  // ── Section 5: TRULY MISSING ──────────────────────────────────────────
  console.log(`\n${'─'.repeat(100)}`);
  console.log(`  TRULY MISSING (no match in either schedule): ${trulyMissing.length}`);
  console.log(`${'─'.repeat(100)}`);
  if (trulyMissing.length === 0) {
    console.log('  (none)');
  } else {
    for (const r of trulyMissing.sort((a, b) => a.directoryName.localeCompare(b.directoryName))) {
      console.log(`    ${r.directoryName.padEnd(35)} | Hired: ${String(r.hireDate).padEnd(12)} | TRULY MISSING`);
    }
  }

  // ── Section 6: Summary ────────────────────────────────────────────────
  console.log(`\n${'='.repeat(100)}`);
  console.log('  SUMMARY');
  console.log(`${'='.repeat(100)}`);
  console.log(`  Total Active Agents (role=Agent):     ${activeAgents.length}`);
  console.log(`  Agent Schedule entries:                ${scheduleRows.length}`);
  console.log(`  Break Schedule entries:                ${breakRows.length}`);
  console.log('');
  console.log(`  Matched in Agent Schedule:             ${results.filter(r => r.schedMatch).length}  (${(results.filter(r => r.schedMatch).length / activeAgents.length * 100).toFixed(1)}%)`);
  console.log(`    - Exact:                             ${results.filter(r => r.schedMatchType === 'exact').length}`);
  console.log(`    - Non-exact (solvable):              ${results.filter(r => r.schedMatch && r.schedMatchType !== 'exact').length}`);
  console.log(`  NOT matched in Agent Schedule:         ${noSchedule.length}  (${(noSchedule.length / activeAgents.length * 100).toFixed(1)}%)`);
  console.log('');
  console.log(`  Matched in Break Schedule:             ${results.filter(r => r.breakMatch).length}  (${(results.filter(r => r.breakMatch).length / activeAgents.length * 100).toFixed(1)}%)`);
  console.log(`    - Exact:                             ${results.filter(r => r.breakMatchType === 'exact').length}`);
  console.log(`    - Non-exact (solvable):              ${results.filter(r => r.breakMatch && r.breakMatchType !== 'exact').length}`);
  console.log(`  NOT matched in Break Schedule:         ${noBreak.length}  (${(noBreak.length / activeAgents.length * 100).toFixed(1)}%)`);
  console.log('');
  console.log(`  Both schedules matched:                ${bothMatched.length}`);
  console.log(`  Schedule only (no break):              ${noBreakHasSched.length}`);
  console.log(`  Break only (no schedule):              ${noSchedHasBreak.length}`);
  console.log(`  TRULY MISSING (neither):               ${trulyMissing.length}`);

  // ── Match type breakdown ──────────────────────────────────────────────
  console.log(`\n${'─'.repeat(100)}`);
  console.log('  MATCH TYPE BREAKDOWN');
  console.log(`${'─'.repeat(100)}`);

  const schedTypes = {};
  const breakTypes = {};
  for (const r of results) {
    if (r.schedMatchType) {
      const t = r.schedMatchType.split(' (')[0];
      schedTypes[t] = (schedTypes[t] || 0) + 1;
    }
    if (r.breakMatchType) {
      const t = r.breakMatchType.split(' (')[0];
      breakTypes[t] = (breakTypes[t] || 0) + 1;
    }
  }

  console.log('\n  Agent Schedule match types:');
  for (const [t, c] of Object.entries(schedTypes).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${t.padEnd(45)} ${c}`);
  }

  console.log('\n  Break Schedule match types:');
  for (const [t, c] of Object.entries(breakTypes).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${t.padEnd(45)} ${c}`);
  }

  console.log(`\n${'='.repeat(100)}`);
  console.log('  AUDIT COMPLETE');
  console.log(`${'='.repeat(100)}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

#!/usr/bin/env node
// Standalone DialedIn Intraday Scraper — VPS/EC2 version
//
// Run via system cron every 5 min during business hours (ET):
//   */5 13-23 * * 1-5 bash -c 'set -a; source /opt/intraday-scraper/.env; set +a; node /opt/intraday-scraper/intraday-scraper-vps.mjs' >> /var/log/intraday-scraper.log 2>&1
//
// Requires: playwright, xlsx (npm install playwright xlsx)
// Env vars: DIALEDIN_PORTAL_USER, DIALEDIN_PORTAL_PASS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Optional env vars:
//   ALERT_CALLBACK_URL - e.g. https://pitch-vision-web.vercel.app/api/dialedin/intraday-alerts
//   CRON_SECRET        - Bearer token for alert callback
//
// Can also be triggered manually:
//   node scripts/intraday-scraper-vps.mjs

import { chromium } from 'playwright';
import * as XLSX from 'xlsx';
import { existsSync, writeFileSync, unlinkSync, readFileSync, statSync } from 'fs';

// ─── Config ────────────────────────────────────────────────
const PORTAL_URL = 'https://portal.chasedatacorp.com';
const REPORT_URL = `${PORTAL_URL}/reports/agent_summary`;
const ANALYSIS_REPORT_URL = `${PORTAL_URL}/reports/agent_analysis`;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 8000;
const PAGE_TIMEOUT_MS = 90_000;
const LOCKFILE = '/tmp/intraday-scraper.lock';
const LOCK_STALE_MS = 5 * 60_000; // 5 min — assume stale if lockfile is older

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORTAL_USER = process.env.DIALEDIN_PORTAL_USER;
const PORTAL_PASS = process.env.DIALEDIN_PORTAL_PASS;
const ALERT_CALLBACK_URL = process.env.ALERT_CALLBACK_URL;
const CRON_SECRET = process.env.CRON_SECRET;

// ─── Lockfile ────────────────────────────────────────────────

function acquireLock() {
  if (existsSync(LOCKFILE)) {
    try {
      const stat = statSync(LOCKFILE);
      const age = Date.now() - stat.mtimeMs;
      if (age < LOCK_STALE_MS) {
        const pid = readFileSync(LOCKFILE, 'utf8').trim();
        console.log(`[intraday-scraper] Another instance running (PID ${pid}, ${Math.round(age / 1000)}s ago). Exiting.`);
        process.exit(0);
      }
      console.log(`[intraday-scraper] Stale lockfile (${Math.round(age / 1000)}s old). Overriding.`);
    } catch {
      // Can't stat/read lockfile — proceed
    }
  }
  writeFileSync(LOCKFILE, String(process.pid));
}

function releaseLock() {
  try { unlinkSync(LOCKFILE); } catch { /* already removed */ }
}

// ─── Helpers ───────────────────────────────────────────────

function roundTo5Min(date) {
  const ms = date.getTime();
  const fiveMin = 5 * 60 * 1000;
  return new Date(Math.round(ms / fiveMin) * fiveMin);
}

function isPitchHealth(team) {
  return !!team && team.toLowerCase().includes('pitch health');
}

function toNum(val) {
  if (val === undefined || val === null || val === '') return 0;
  const s = String(val).replace(/,/g, '').replace(/%$/, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function timeToMinutes(val) {
  if (!val) return 0;
  const s = String(val).trim();
  const parts = s.split(':');
  if (parts.length === 3) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]) + parseInt(parts[2]) / 60;
  }
  return 0;
}

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// ─── XLS Parser (minimal AgentSummary) ─────────────────────

function parseAgentSummaryXLS(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const agents = [];
  for (const row of rows) {
    const rep = row['Rep'] || row['rep'] || '';
    if (!rep || rep === 'Total:') continue;

    agents.push({
      rep: String(rep).trim(),
      team: String(row['Team'] || row['team'] || '').trim() || null,
      dialed: toNum(row['Dialed']),
      connects: toNum(row['Connects']),
      contacts: toNum(row['Contacts']),
      hours_worked: toNum(row['Hours Worked']),
      transfers: toNum(row['Sale/Lead/App']),
      connects_per_hour: toNum(row['Connects per Hour']),
      sla_hr: toNum(row['S-L-A/HR']),
      conversion_rate_pct: toNum(row['Conversion Rate']),
      talk_time_min: timeToMinutes(row['Talk Time']),
      wrap_time_min: timeToMinutes(row['Wrap Up Time']),
      logged_in_time_min: timeToMinutes(row['Logged In Time']),
    });
  }

  return agents;
}

// ─── XLS Parser (AgentAnalysis — for pause time) ─────────

function parseAgentAnalysisXLS(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  // AgentAnalysis has per-agent per-campaign rows.
  // We sum pause_time and time_avail across campaigns per agent.
  const agentPause = new Map(); // agent_name → { pause_min, avail_min }

  for (const row of rows) {
    const rep = row['Rep'] || row['rep'] || '';
    if (!rep || rep === 'Total:') continue;

    const name = String(rep).trim();
    const pauseMin = timeToMinutes(row['Time Paused']);
    const availMin = timeToMinutes(row['Time Avail']);

    const existing = agentPause.get(name) || { pause_min: 0, avail_min: 0 };
    existing.pause_min += pauseMin;
    existing.avail_min += availMin;
    agentPause.set(name, existing);
  }

  return agentPause;
}

// ─── Scraper ───────────────────────────────────────────────

async function downloadReports(user, pass) {
  let browser = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);

    // 1. Login
    console.log(`[${ts()}] Logging in to DialedIn portal...`);
    await page.goto(PORTAL_URL);
    await page.getByRole('textbox', { name: 'Email Address' }).fill(user);
    await page.getByRole('textbox', { name: 'Password' }).fill(pass);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForSelector('button:has-text("Log Out")', { timeout: 30_000 });
    console.log(`[${ts()}] Logged in successfully`);

    // ── Report 1: Agent Summary ──────────────────────────
    console.log(`[${ts()}] Navigating to Agent Summary report...`);
    await page.goto(REPORT_URL);
    await page.waitForSelector('button:has-text("Run Report")', { timeout: 15_000 });

    // Check "Show Only Active Reps"
    const checkbox = page.getByRole('checkbox', { name: 'Show Only Active Reps' });
    if (!(await checkbox.isChecked())) {
      await checkbox.click();
    }

    console.log(`[${ts()}] Running Agent Summary report...`);
    await page.getByRole('button', { name: 'Run Report' }).click();

    await page.waitForSelector('a[href*="report_export/agent_summary"]', { timeout: 60_000 });
    console.log(`[${ts()}] Agent Summary generated, downloading XLS...`);
    await new Promise((r) => setTimeout(r, 2000));

    const summaryXlsUrl = await page.evaluate(() => {
      const link = document.querySelector('a[href*="report_export/agent_summary/xls"]');
      return link ? link.href : null;
    });
    if (!summaryXlsUrl) throw new Error('Agent Summary XLS download link not found');

    const summaryResp = await context.request.get(summaryXlsUrl);
    if (!summaryResp.ok()) {
      throw new Error(`Agent Summary XLS download failed: ${summaryResp.status()}`);
    }
    const summaryBuffer = await summaryResp.body();
    if (summaryBuffer.length < 100) {
      throw new Error(`Agent Summary XLS too small (${summaryBuffer.length} bytes)`);
    }

    const allRows = parseAgentSummaryXLS(summaryBuffer);
    console.log(`[${ts()}] Parsed ${allRows.length} total agents from Agent Summary`);
    if (allRows.length < 10) {
      throw new Error(`Only ${allRows.length} agents — suspiciously low, aborting`);
    }

    // ── Report 2: Agent Analysis (for pause time) ────────
    let agentPauseMap = new Map();
    try {
      console.log(`[${ts()}] Navigating to Agent Analysis report...`);
      await page.goto(ANALYSIS_REPORT_URL);
      await page.waitForSelector('button:has-text("Run Report")', { timeout: 15_000 });

      // Try to check "Show Only Active Reps" (may not exist on this report page)
      try {
        const analysisCheckbox = page.getByRole('checkbox', { name: 'Show Only Active Reps' });
        if (await analysisCheckbox.isVisible({ timeout: 3000 })) {
          if (!(await analysisCheckbox.isChecked())) {
            await analysisCheckbox.click();
          }
        }
      } catch {
        // Checkbox not found — that's OK, proceed without it
        console.log(`[${ts()}] No "Active Reps" checkbox on Agent Analysis page, proceeding`);
      }

      console.log(`[${ts()}] Running Agent Analysis report...`);
      await page.getByRole('button', { name: 'Run Report' }).click();

      await page.waitForSelector('a[href*="report_export/agent_analysis"]', { timeout: 90_000 });
      console.log(`[${ts()}] Agent Analysis generated, downloading XLS...`);
      await new Promise((r) => setTimeout(r, 2000));

      const analysisXlsUrl = await page.evaluate(() => {
        const link = document.querySelector('a[href*="report_export/agent_analysis/xls"]');
        return link ? link.href : null;
      });

      if (analysisXlsUrl) {
        const analysisResp = await context.request.get(analysisXlsUrl);
        if (analysisResp.ok()) {
          const analysisBuffer = await analysisResp.body();
          if (analysisBuffer.length >= 100) {
            agentPauseMap = parseAgentAnalysisXLS(analysisBuffer);
            console.log(`[${ts()}] Parsed pause data for ${agentPauseMap.size} agents from Agent Analysis`);
          }
        }
      }
    } catch (analysisErr) {
      // Agent Analysis is supplementary — don't fail the whole scrape
      console.warn(`[${ts()}] Agent Analysis scrape failed (non-fatal): ${analysisErr.message || analysisErr}`);
    }

    // ── Merge pause data + filter Pitch Health ───────────
    const filteredRows = allRows
      .filter((r) => !isPitchHealth(r.team))
      .map((r) => {
        const pauseData = agentPauseMap.get(r.rep);
        return {
          ...r,
          pause_time_min: pauseData ? pauseData.pause_min : 0,
          time_avail_min: pauseData ? pauseData.avail_min : 0,
        };
      });

    const pauseMatches = filteredRows.filter((r) => r.pause_time_min > 0).length;
    console.log(`[${ts()}] Merged pause data: ${pauseMatches}/${filteredRows.length} agents have pause time`);

    await browser.close();
    browser = null;

    return { rows: filteredRows, rawCount: allRows.length };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ─── Supabase REST API ─────────────────────────────────────

async function supabasePost(table, records, onConflict) {
  const url = onConflict
    ? `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`
    : `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: onConflict
        ? 'resolution=merge-duplicates,return=minimal'
        : 'return=minimal',
    },
    body: JSON.stringify(records),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase POST to ${table} failed: ${res.status} — ${text}`);
  }
}

async function upsertSnapshots(rows, snapshotAt) {
  const snapshotDate = snapshotAt.toISOString().split('T')[0];
  const snapshotAtISO = snapshotAt.toISOString();

  const CHUNK_SIZE = 200;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const records = chunk.map((r) => ({
      snapshot_at: snapshotAtISO,
      snapshot_date: snapshotDate,
      agent_name: r.rep,
      team: r.team || null,
      dialed: r.dialed,
      connects: r.connects,
      contacts: r.contacts,
      hours_worked: r.hours_worked,
      transfers: r.transfers,
      connects_per_hour: r.connects_per_hour,
      sla_hr: r.sla_hr,
      conversion_rate_pct: r.conversion_rate_pct,
      talk_time_min: r.talk_time_min,
      wrap_time_min: r.wrap_time_min,
      logged_in_time_min: r.logged_in_time_min,
      pause_time_min: r.pause_time_min || 0,
      time_avail_min: r.time_avail_min || 0,
    }));
    await supabasePost('dialedin_intraday_snapshots', records, 'agent_name,snapshot_at');
  }
}

async function logScrape(result) {
  try {
    await supabasePost('dialedin_intraday_scrape_log', [{
      status: result.success ? 'success' : 'error',
      agent_count: result.agentCount,
      duration_ms: result.durationMs,
      error_message: result.error || null,
      snapshot_at: result.snapshotAt,
    }]);
  } catch (e) {
    console.error(`[${ts()}] Failed to log scrape:`, e.message || e);
  }
}

// ─── Alert Callback ───────────────────────────────────────

async function triggerAlertEvaluation(snapshotAtISO) {
  if (!ALERT_CALLBACK_URL || !CRON_SECRET) {
    console.log(`[${ts()}] Alert callback not configured, skipping`);
    return;
  }
  try {
    const res = await fetch(ALERT_CALLBACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify({ snapshot_at: snapshotAtISO }),
    });
    const data = await res.json();
    console.log(`[${ts()}] Alert callback: ${res.status} — ${JSON.stringify(data)}`);
  } catch (err) {
    console.error(`[${ts()}] Alert callback failed:`, err.message || err);
  }
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  if (!PORTAL_USER || !PORTAL_PASS) {
    console.error('[intraday-scraper] DIALEDIN_PORTAL_USER/PASS not configured');
    process.exit(1);
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[intraday-scraper] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured');
    process.exit(1);
  }

  // Prevent concurrent runs
  acquireLock();
  process.on('exit', releaseLock);
  process.on('SIGINT', () => { releaseLock(); process.exit(1); });
  process.on('SIGTERM', () => { releaseLock(); process.exit(1); });

  const snapshotAt = roundTo5Min(new Date());
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const start = Date.now();
    try {
      console.log(`\n[${ts()}] ═══ Attempt ${attempt}/${MAX_RETRIES} — snapshot ${snapshotAt.toISOString()} ═══`);
      const { rows, rawCount } = await downloadReports(PORTAL_USER, PORTAL_PASS);
      console.log(`[${ts()}] Parsed ${rows.length} agents (${rawCount} raw, Pitch Health filtered)`);

      await upsertSnapshots(rows, snapshotAt);
      console.log(`[${ts()}] Upserted ${rows.length} snapshot rows to Supabase`);

      const durationMs = Date.now() - start;
      await logScrape({
        success: true,
        agentCount: rows.length,
        durationMs,
        snapshotAt: snapshotAt.toISOString(),
      });

      console.log(`[${ts()}] SUCCESS — ${rows.length} agents in ${durationMs}ms`);
      await triggerAlertEvaluation(snapshotAt.toISOString());
      releaseLock();
      process.exit(0);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`[${ts()}] Attempt ${attempt} failed:`, lastError);
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt; // exponential-ish backoff
        console.log(`[${ts()}] Retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  // All retries exhausted
  await logScrape({
    success: false,
    agentCount: 0,
    durationMs: 0,
    snapshotAt: snapshotAt.toISOString(),
    error: `All ${MAX_RETRIES} attempts failed. Last error: ${lastError}`,
  });

  console.error(`[${ts()}] FAILED — All ${MAX_RETRIES} attempts failed. Last error: ${lastError}`);
  releaseLock();
  process.exit(1);
}

main();

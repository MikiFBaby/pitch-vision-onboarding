#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// Pitch Vision — Self-Hosted Cron Scheduler
//
// Replaces Vercel's cron system. Runs as a sidecar container
// that fires HTTP requests to the Next.js app on schedule.
//
// All schedules from vercel.json are replicated here.
// Auth: Bearer CRON_SECRET header on every request.
// ─────────────────────────────────────────────────────────────

const APP_URL = process.env.CRON_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://host.docker.internal:3000';
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error('[cron] CRON_SECRET is required');
  process.exit(1);
}

// ─── Schedule definitions (mirrored from vercel.json) ───────
const JOBS = [
  { path: '/api/dialedin/alerts/check',    cron: '0 17 * * 1-5',  name: 'DialedIn Alerts' },
  { path: '/api/dialedin/slack-summary',    cron: '0 4 * * 2-6',   name: 'DialedIn Slack Summary' },
  { path: '/api/cron/sam-alerts',           cron: '0 19 * * 1-5',  name: 'SAM Alerts' },
  { path: '/api/cron/sam-weekly-digest',    cron: '0 18 * * 1',    name: 'SAM Weekly Digest' },
  { path: '/api/cron/slack-sync',           cron: '0 11 * * *',    name: 'Slack Sync' },
  { path: '/api/dialedin/webhook/retry',    cron: '0 12 * * *',    name: 'DialedIn Webhook Retry' },
  { path: '/api/retreaver/sync',            cron: '0 10 * * *',    name: 'Retreaver S3 Sync' },
  { path: '/api/cron/sync-health',          cron: '0 17 * * 1-5',  name: 'Sync Health Check' },
  { path: '/api/cron/dialedin-ingest',      cron: '0 22 * * *',    name: 'DialedIn Ingest' },
  { path: '/api/cron/retreaver-ingest',     cron: '0 2 * * *',     name: 'Retreaver IMAP Ingest' },
  { path: '/api/cron/directory-audit',      cron: '0 14 * * 1',    name: 'Directory Audit' },
];

// ─── Minimal cron parser ────────────────────────────────────
// Supports: number, *, */N, ranges (1-5), lists (2,4,6)
function fieldMatches(field, value) {
  if (field === '*') return true;
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    return value % step === 0;
  }
  // Comma-separated list (e.g. "2-6" or "1,3,5" or "1-5")
  return field.split(',').some(part => {
    if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number);
      return value >= lo && value <= hi;
    }
    return parseInt(part, 10) === value;
  });
}

function shouldRun(cronExpr, now) {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = cronExpr.split(' ');
  return (
    fieldMatches(minute, now.getUTCMinutes()) &&
    fieldMatches(hour, now.getUTCHours()) &&
    fieldMatches(dayOfMonth, now.getUTCDate()) &&
    fieldMatches(month, now.getUTCMonth() + 1) &&
    fieldMatches(dayOfWeek, now.getUTCDay())
  );
}

// ─── Job executor ───────────────────────────────────────────
async function runJob(job) {
  const url = `${APP_URL}${job.path}`;
  const startMs = Date.now();
  console.log(`[cron] ▶ ${job.name} → ${url}`);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'User-Agent': 'PitchVision-CronScheduler/1.0',
      },
      signal: AbortSignal.timeout(300_000), // 5 min timeout
    });

    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    if (res.ok) {
      console.log(`[cron] ✓ ${job.name} completed (${res.status}) in ${elapsed}s`);
    } else {
      const body = await res.text().catch(() => '');
      console.error(`[cron] ✗ ${job.name} failed (${res.status}) in ${elapsed}s: ${body.slice(0, 200)}`);
    }
  } catch (err) {
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    console.error(`[cron] ✗ ${job.name} error after ${elapsed}s:`, err.message);
  }
}

// ─── Main loop — check every minute ─────────────────────────
console.log(`[cron] Scheduler started — ${JOBS.length} jobs registered`);
console.log(`[cron] Target: ${APP_URL}`);
JOBS.forEach(j => console.log(`  ${j.cron.padEnd(18)} ${j.name}`));

// Wait for the app to be healthy before starting
async function waitForApp() {
  const maxWait = 120_000; // 2 min
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(`${APP_URL}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        console.log('[cron] App is healthy, starting scheduler loop');
        return;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 3000));
  }
  console.warn('[cron] App did not become healthy within 2 min — starting anyway');
}

await waitForApp();

// Check at the start of every minute
function scheduleNextCheck() {
  const now = new Date();
  const msUntilNextMinute = (60 - now.getUTCSeconds()) * 1000 - now.getUTCMilliseconds();
  setTimeout(async () => {
    const checkTime = new Date();
    const matching = JOBS.filter(j => shouldRun(j.cron, checkTime));
    if (matching.length > 0) {
      // Run matching jobs concurrently
      await Promise.allSettled(matching.map(runJob));
    }
    scheduleNextCheck();
  }, msUntilNextMinute + 500); // +500ms buffer to ensure we're past the minute boundary
}

scheduleNextCheck();

// Keep process alive
process.on('SIGTERM', () => {
  console.log('[cron] Received SIGTERM, shutting down');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('[cron] Received SIGINT, shutting down');
  process.exit(0);
});

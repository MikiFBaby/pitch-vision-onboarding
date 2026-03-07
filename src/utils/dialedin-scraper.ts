/**
 * DialedIn Portal Scraper — Playwright-based intraday Agent Summary fetcher
 *
 * Logs into portal.chasedatacorp.com, navigates to Reports → Agent Summary,
 * runs the "Current Day" report, downloads the XLS export, and parses it
 * using the existing dialedin-parser.
 */
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { parseXLSBuffer } from '@/utils/dialedin-parser';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { AgentSummaryRow } from '@/types/dialedin-types';

const PORTAL_URL = 'https://portal.chasedatacorp.com';
const REPORT_URL = `${PORTAL_URL}/reports/agent_summary`;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const PAGE_TIMEOUT_MS = 90_000;

interface ScrapeResult {
  success: boolean;
  agentCount: number;
  durationMs: number;
  snapshotAt: string;
  error?: string;
}

/** Round a Date to the nearest 5-minute boundary */
function roundTo5Min(date: Date): Date {
  const ms = date.getTime();
  const fiveMin = 5 * 60 * 1000;
  return new Date(Math.round(ms / fiveMin) * fiveMin);
}

/** Filter out Pitch Health agents — separate department */
function isPitchHealth(team: string | undefined): boolean {
  return !!team && team.toLowerCase().includes('pitch health');
}

/**
 * Scrape the DialedIn portal for today's Agent Summary data.
 * Returns parsed AgentSummaryRow[] after filtering Pitch Health agents.
 */
async function downloadAgentSummaryXLS(
  user: string,
  pass: string,
): Promise<{ rows: AgentSummaryRow[]; rawCount: number }> {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context: BrowserContext = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);

    // 1. Login
    await page.goto(PORTAL_URL);
    await page.getByRole('textbox', { name: 'Email Address' }).fill(user);
    await page.getByRole('textbox', { name: 'Password' }).fill(pass);
    await page.getByRole('button', { name: 'Login' }).click();
    // Login is AJAX-based (no URL navigation) — wait for the post-login nav menu
    await page.waitForSelector('button:has-text("Log Out")', { timeout: 30_000 });

    // 2. Navigate directly to Agent Summary report page
    await page.goto(REPORT_URL);
    await page.waitForSelector('button:has-text("Run Report")', { timeout: 15_000 });

    // 3. Check "Show Only Active Reps" if not already checked
    const activeRepsCheckbox = page.getByRole('checkbox', { name: 'Show Only Active Reps' });
    if (!(await activeRepsCheckbox.isChecked())) {
      await activeRepsCheckbox.click();
    }

    // 4. Click "Run Report" and wait for the table to load
    await page.getByRole('button', { name: 'Run Report' }).click();
    // Wait for the download links to appear (indicates report is ready)
    await page.waitForSelector('a[href*="report_export/agent_summary"]', { timeout: 60_000 });

    // 5. Download the XLS file via authenticated HTTP request
    // (headless Chromium may not fire 'download' events reliably)
    // Resolve the actual absolute URL from the link element
    const xlsUrl = await page.evaluate(() => {
      const link = document.querySelector('a[href*="report_export/agent_summary/xls"]');
      return link ? (link as HTMLAnchorElement).href : null;
    });
    if (!xlsUrl) throw new Error('XLS download link not found in DOM');

    const response = await context.request.get(xlsUrl);
    if (!response.ok()) {
      throw new Error(`XLS download failed: ${response.status()} ${response.statusText()}`);
    }
    const buffer = await response.body();

    // 6. Parse using existing parser
    const today = new Date();
    const dateStr = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}-${today.getFullYear()}`;
    const fakeFilename = `AgentSummary_${dateStr}_${dateStr}.xls`;

    const parsed = parseXLSBuffer(Buffer.from(buffer), fakeFilename);
    const allRows = parsed.agentSummary || [];

    // 7. Filter out Pitch Health agents
    const filteredRows = allRows.filter((r) => !isPitchHealth(r.team));

    await browser.close();
    browser = null;

    return { rows: filteredRows, rawCount: allRows.length };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Upsert agent summary rows into dialedin_intraday_snapshots.
 * Uses ON CONFLICT (agent_name, snapshot_at) to handle re-runs.
 */
async function upsertSnapshots(
  rows: AgentSummaryRow[],
  snapshotAt: Date,
): Promise<void> {
  // Use ET date — snapshot_date represents the business day in Eastern Time
  const snapshotDate = snapshotAt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const snapshotAtISO = snapshotAt.toISOString();

  // Batch upsert in chunks of 200
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
    }));

    const { error } = await supabaseAdmin
      .from('dialedin_intraday_snapshots')
      .upsert(records, { onConflict: 'agent_name,snapshot_at' });

    if (error) {
      throw new Error(`Upsert failed (chunk ${i}): ${error.message}`);
    }
  }
}

/** Log a scrape attempt to dialedin_intraday_scrape_log */
async function logScrape(result: ScrapeResult): Promise<void> {
  await supabaseAdmin.from('dialedin_intraday_scrape_log').insert({
    status: result.success ? 'success' : 'error',
    agent_count: result.agentCount,
    duration_ms: result.durationMs,
    error_message: result.error || null,
    snapshot_at: result.snapshotAt,
  });
}

/**
 * Main entry point — scrape, parse, store, log.
 * Retries up to MAX_RETRIES times on failure.
 */
export async function scrapeAndStoreIntraday(): Promise<ScrapeResult> {
  const user = process.env.DIALEDIN_PORTAL_USER;
  const pass = process.env.DIALEDIN_PORTAL_PASS;

  if (!user || !pass) {
    const result: ScrapeResult = {
      success: false,
      agentCount: 0,
      durationMs: 0,
      snapshotAt: new Date().toISOString(),
      error: 'DIALEDIN_PORTAL_USER/PASS not configured',
    };
    await logScrape(result);
    return result;
  }

  const snapshotAt = roundTo5Min(new Date());
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const start = Date.now();
    try {
      console.log(`[intraday-scraper] Attempt ${attempt}/${MAX_RETRIES}...`);
      const { rows, rawCount } = await downloadAgentSummaryXLS(user, pass);
      console.log(`[intraday-scraper] Parsed ${rows.length} agents (${rawCount} raw, Pitch Health filtered)`);

      await upsertSnapshots(rows, snapshotAt);

      const result: ScrapeResult = {
        success: true,
        agentCount: rows.length,
        durationMs: Date.now() - start,
        snapshotAt: snapshotAt.toISOString(),
      };
      await logScrape(result);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`[intraday-scraper] Attempt ${attempt} failed:`, lastError);

      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  // All retries exhausted
  const result: ScrapeResult = {
    success: false,
    agentCount: 0,
    durationMs: 0,
    snapshotAt: snapshotAt.toISOString(),
    error: `All ${MAX_RETRIES} attempts failed. Last error: ${lastError}`,
  };
  await logScrape(result);
  return result;
}

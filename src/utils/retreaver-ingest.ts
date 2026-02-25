import { supabaseAdmin } from "@/lib/supabase-admin";

/** Strip phone to last 10 digits */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-10);
}

/** Round timestamp to 5-minute bucket for dedup */
function round5Min(ts: Date): string {
  const ms = ts.getTime();
  const bucket = Math.floor(ms / 300000) * 300000;
  return new Date(bucket).toISOString();
}

/** Round timestamp to 1-minute bucket for CSV dedup */
function round1Min(ts: Date): string {
  const ms = ts.getTime();
  const bucket = Math.floor(ms / 60000) * 60000;
  return new Date(bucket).toISOString();
}

export function buildPingDedupKey(phone: string, revenue: string): string {
  return `ping:${normalizePhone(phone)}:${revenue}:${round5Min(new Date())}`;
}

export function buildCSVDedupKey(
  caller: string,
  timestamp: Date,
  source: "csv_summary" | "csv_detailed"
): string {
  const prefix = source === "csv_detailed" ? "det" : "csv";
  return `${prefix}:${normalizePhone(caller)}:${round1Min(timestamp)}`;
}

/** Parse Retreaver CSV timestamp: "M/D/YY H:MM" or "YYYY-MM-DD HH:MM:SS" */
export function parseTimestamp(ts: string): Date {
  // ISO format: "2026-02-18 08:48:23"
  if (ts.includes("-") && ts.length > 15) {
    return new Date(ts.replace(" ", "T") + "Z");
  }
  // Short format: "2/17/26 9:41"
  const match = ts.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (match) {
    const [, month, day, year, hour, min] = match;
    return new Date(Date.UTC(2000 + Number(year), Number(month) - 1, Number(day), Number(hour), Number(min)));
  }
  return new Date(ts);
}

/** Parse revenue string: strip $ and commas */
export function parseRevenue(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/[$,\s]/g, "")) || 0;
}

export interface RetreaverCSVRow {
  event_timestamp: Date;
  caller_phone: string;
  target_phone: string;
  revenue: number;
  payout: number;
  campaign_name: string;
  publisher_name: string;
  target_name: string;
  agent_name: string;
  subcampaign: string;
  caller_city: string;
  caller_state: string;
  caller_zip: string;
  connected_secs: number | null;
  billable_minutes: number | null;
  converted: boolean | null;
  call_status: string;
  call_uuid: string;
  source: "csv_summary" | "csv_detailed";
}

/** Detect CSV type and parse rows */
export function parseRetreaverCSV(csvText: string): RetreaverCSVRow[] {
  const lines = csvText.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const isDetailed = headers.includes("PublisherName") || headers.includes("ConnectedSecs") || headers.includes("BillableMinutes");
  const source: "csv_summary" | "csv_detailed" = isDetailed ? "csv_detailed" : "csv_summary";

  const colIdx = (name: string) => headers.indexOf(name);

  const rows: RetreaverCSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 3) continue;

    const tsRaw = cols[colIdx("Timestamp")]?.trim();
    if (!tsRaw) continue;

    const row: RetreaverCSVRow = {
      event_timestamp: parseTimestamp(tsRaw),
      caller_phone: cols[colIdx("Caller")]?.trim() || "",
      target_phone: cols[colIdx("Number")]?.trim() || "",
      revenue: parseRevenue(cols[colIdx("Revenue")]?.trim() || cols[colIdx("Payout")]?.trim() || "0"),
      payout: parseRevenue(cols[colIdx("Payout")]?.trim() || "0"),
      campaign_name: cols[colIdx("CampaignName")]?.trim() || cols[colIdx("Campaign")]?.trim() || "",
      publisher_name: isDetailed ? cols[colIdx("PublisherName")]?.trim() || "" : "",
      target_name: isDetailed ? cols[colIdx("TargetName")]?.trim() || "" : "",
      agent_name: isDetailed ? cols[colIdx("Tag-agent_name")]?.trim() || "" : "",
      subcampaign: isDetailed
        ? cols[colIdx("Tag-subcampaign")]?.trim() || cols[colIdx("Subcampaign")]?.trim() || ""
        : cols[colIdx("Subcampaign")]?.trim() || "",
      caller_city: isDetailed ? cols[colIdx("CallerCity")]?.trim() || "" : "",
      caller_state: isDetailed ? cols[colIdx("CallerState")]?.trim() || "" : "",
      caller_zip: isDetailed ? cols[colIdx("CallerZip")]?.trim() || "" : "",
      connected_secs: isDetailed ? parseInt(cols[colIdx("ConnectedSecs")] || "") || null : null,
      billable_minutes: isDetailed ? parseFloat(cols[colIdx("BillableMinutes")] || "") || null : null,
      converted: isDetailed ? cols[colIdx("Converted")]?.trim()?.toLowerCase() === "yes" : null,
      call_status: isDetailed ? cols[colIdx("Status")]?.trim() || "" : "",
      call_uuid: isDetailed ? cols[colIdx("CallUUID")]?.trim() || "" : "",
      source,
    };

    rows.push(row);
  }

  return rows;
}

/** Simple CSV line parser that handles quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/** Safely extract a string field from payload (supports multiple key variants) */
function str(p: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = p[k];
    if (v != null && v !== "") return String(v);
  }
  return null;
}

/** Safely parse an int — returns null only when value is absent, preserves 0 */
function safeInt(s: string | null): number | null {
  if (s == null) return null;
  const n = parseInt(s);
  return Number.isNaN(n) ? null : n;
}

/** Safely parse a float — returns null only when value is absent, preserves 0 */
function safeFloat(s: string | null): number | null {
  if (s == null) return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

/** Insert a single API ping into Supabase (enriched-field aware) */
export async function insertPing(phone: string, revenue: string, rawPayload: Record<string, unknown>) {
  const dedupKey = buildPingDedupKey(phone, revenue);
  const p = rawPayload;

  // Enriched fields — extracted when present, null-safe for old 2-field pings
  const connSecs = str(p, "connected_secs", "ConnectedSecs");
  const billMins = str(p, "billable_minutes", "BillableMinutes");
  const convertedRaw = p.converted ?? p.Converted;
  const payoutRaw = str(p, "payout", "Payout");

  // Use call_start_time (unix epoch) for more accurate event_timestamp when available
  const callStartRaw = str(p, "call_start_time", "CallStartTime");
  const eventTimestamp = callStartRaw && /^\d{8,}$/.test(callStartRaw)
    ? new Date(parseInt(callStartRaw) * 1000).toISOString()
    : new Date().toISOString();

  // Retreaver "phone" param = caller's number (inbound calls).
  // "number"/"target" = our tracking number (if provided).
  const targetRaw = str(p, "number", "target", "target_number", "TargetNumber");

  const { error } = await supabaseAdmin.from("retreaver_events").upsert(
    {
      dedup_key: dedupKey,
      event_timestamp: eventTimestamp,
      caller_phone: normalizePhone(phone),
      target_phone: targetRaw ? normalizePhone(targetRaw) : null,
      revenue: parseRevenue(revenue),
      payout: payoutRaw != null ? parseRevenue(payoutRaw) : null,
      // Bug fix: Retreaver pings send campaign as "number_name", not "campaign_name"
      campaign_name: str(p, "campaign_name", "CampaignName", "campaign", "Campaign", "number_name", "NumberName"),
      publisher_name: str(p, "publisher_name", "PublisherName"),
      target_name: str(p, "target_name", "TargetName"),
      agent_name: str(p, "agent_name", "Tag-agent_name", "AgentName"),
      subcampaign: str(p, "subcampaign", "Subcampaign", "Tag-subcampaign"),
      caller_city: str(p, "caller_city", "CallerCity"),
      caller_state: str(p, "caller_state", "CallerState"),
      caller_zip: str(p, "caller_zip", "CallerZip"),
      // Bug fix: use safeInt/safeFloat instead of parseInt()||null — 0 is valid, not null
      connected_secs: safeInt(connSecs),
      billable_minutes: safeFloat(billMins),
      converted: convertedRaw != null
        ? (typeof convertedRaw === "boolean" ? convertedRaw : String(convertedRaw).toLowerCase() === "yes")
        : null,
      call_status: str(p, "call_status", "Status", "status"),
      source: "api_ping",
      raw_payload: rawPayload,
    },
    { onConflict: "dedup_key", ignoreDuplicates: true }
  );

  return { error, dedupKey };
}

/** Batch upsert CSV rows into Supabase */
export async function upsertCSVRows(
  rows: RetreaverCSVRow[],
  s3Key: string
): Promise<{ imported: number; skipped: number; error?: string }> {
  if (rows.length === 0) return { imported: 0, skipped: 0 };

  const records = rows.map((r) => ({
    dedup_key: buildCSVDedupKey(r.caller_phone || r.target_phone, r.event_timestamp, r.source),
    event_timestamp: r.event_timestamp.toISOString(),
    caller_phone: r.caller_phone ? normalizePhone(r.caller_phone) : null,
    target_phone: r.target_phone ? normalizePhone(r.target_phone) : null,
    revenue: r.revenue,
    payout: r.payout,
    campaign_name: r.campaign_name || null,
    publisher_name: r.publisher_name || null,
    target_name: r.target_name || null,
    agent_name: r.agent_name || null,
    subcampaign: r.subcampaign || null,
    caller_city: r.caller_city || null,
    caller_state: r.caller_state || null,
    caller_zip: r.caller_zip || null,
    connected_secs: r.connected_secs,
    billable_minutes: r.billable_minutes,
    converted: r.converted,
    call_status: r.call_status || null,
    call_uuid: r.call_uuid || null,
    source: r.source,
    s3_file_key: s3Key,
  }));

  // Batch in chunks of 500
  let imported = 0;
  let skipped = 0;
  const BATCH = 500;

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error, count } = await supabaseAdmin
      .from("retreaver_events")
      .upsert(batch, { onConflict: "dedup_key", ignoreDuplicates: true, count: "exact" });

    if (error) {
      return { imported, skipped, error: error.message };
    }
    imported += count ?? batch.length;
    skipped += batch.length - (count ?? batch.length);
  }

  return { imported, skipped };
}

// ─── CSV-to-Ping Enrichment ─────────────────────────────────────────────────

export interface EnrichmentResult {
  total_csv_rows: number;
  enriched: number;
  inserted: number;
  skipped_duplicate: number;
  errors: string[];
}

interface PingCandidate {
  id: string;
  event_timestamp: string;
  revenue: number;
  caller_phone: string;
  enriched_at: string | null;
  call_uuid: string | null;
  campaign_name: string | null;
  caller_state: string | null;
}

/** Normalize campaign name to a canonical type for fuzzy matching.
 *  Ping names (e.g. "FYM - MEDICARE") differ from CSV names
 *  (e.g. "Medicare Campaign A [INBOUNDS]") so we compare by type. */
function normalizeCampaignType(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes("ACA") || upper === "JADE") return "ACA";
  if (upper.includes("MEDICARE") || upper.includes("FYM") || upper.includes("ELITE") || upper.includes("ARAGON") || upper.includes("BRANDON")) return "MEDICARE";
  if (upper.includes("WHATIF") || upper.includes("WHAT IF")) return "WHATIF";
  if (upper.includes("TLD")) return "TLD";
  return upper;
}

/** Find the best matching ping for a CSV row among candidates.
 *  Multi-signal scoring: timestamp proximity + revenue + campaign type + state.
 *  Each signal adds a time-equivalent bonus (lower score = better match). */
function findBestMatch(
  csvRow: RetreaverCSVRow,
  candidates: PingCandidate[],
  usedIds: Set<string>,
): PingCandidate | null {
  const csvTs = csvRow.event_timestamp.getTime();
  const csvCampaignType = csvRow.campaign_name ? normalizeCampaignType(csvRow.campaign_name) : null;
  let best: { candidate: PingCandidate; score: number; delta: number } | null = null;

  for (const c of candidates) {
    if (usedIds.has(c.id)) continue;

    const delta = Math.abs(new Date(c.event_timestamp).getTime() - csvTs);

    // Revenue match: exact within $0.02
    const revenueMatch = Math.abs(Number(c.revenue) - csvRow.revenue) < 0.02;

    // Campaign type match: normalize both sides and compare
    const pingCampaignType = c.campaign_name ? normalizeCampaignType(c.campaign_name) : null;
    const campaignMatch = csvCampaignType && pingCampaignType && csvCampaignType === pingCampaignType;

    // State match: exact state code
    const stateMatch = c.caller_state && csvRow.caller_state
      && c.caller_state.toUpperCase() === csvRow.caller_state.toUpperCase();

    // Score: lower is better. Each signal adds a time-equivalent bonus.
    let score = delta;
    if (revenueMatch) score -= 300_000;    // 5 min bonus
    if (campaignMatch) score -= 200_000;   // ~3.3 min bonus
    if (stateMatch) score -= 50_000;       // ~50s bonus

    if (!best || score < best.score) {
      best = { candidate: c, score, delta };
    }
  }

  if (!best) return null;
  // Hard cap: reject if > 10 min away regardless of signals
  if (best.delta > 600_000) return null;
  // Soft cap: reject if no matching signals (score >= 0) and > 30s away
  if (best.score >= 0 && best.delta > 30_000) return null;

  return best.candidate;
}

/** Match CSV rows to existing API pings and enrich them with missing data.
 *  Unmatched CSV rows are inserted as new csv_detailed records. */
export async function enrichPingsFromCSV(
  rows: RetreaverCSVRow[],
  importKey: string,
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    total_csv_rows: rows.length,
    enriched: 0,
    inserted: 0,
    skipped_duplicate: 0,
    errors: [],
  };

  if (rows.length === 0) return result;

  // Group CSV rows by normalized phone
  const byPhone = new Map<string, RetreaverCSVRow[]>();
  for (const row of rows) {
    const phone = normalizePhone(row.caller_phone || row.target_phone);
    if (!phone) continue;
    if (!byPhone.has(phone)) byPhone.set(phone, []);
    byPhone.get(phone)!.push(row);
  }

  const phoneKeys = [...byPhone.keys()];
  const BATCH = 50;
  const unmatchedRows: RetreaverCSVRow[] = [];

  for (let i = 0; i < phoneKeys.length; i += BATCH) {
    const batchPhones = phoneKeys.slice(i, i + BATCH);

    // Compute timestamp window for this batch
    const allBatchRows = batchPhones.flatMap((p) => byPhone.get(p)!);
    const minTs = new Date(Math.min(...allBatchRows.map((r) => r.event_timestamp.getTime())) - 600_000).toISOString();
    const maxTs = new Date(Math.max(...allBatchRows.map((r) => r.event_timestamp.getTime())) + 600_000).toISOString();

    // Single query: fetch all candidate pings for this batch of phones
    const { data: candidates, error: fetchErr } = await supabaseAdmin
      .from("retreaver_events")
      .select("id, event_timestamp, revenue, caller_phone, enriched_at, call_uuid, campaign_name, caller_state")
      .eq("source", "api_ping")
      .in("caller_phone", batchPhones)
      .is("enriched_at", null)
      .gte("event_timestamp", minTs)
      .lte("event_timestamp", maxTs);

    if (fetchErr) {
      result.errors.push(`Fetch error for batch ${i}: ${fetchErr.message}`);
      // Fall through — unmatched rows will be inserted
      for (const row of allBatchRows) unmatchedRows.push(row);
      continue;
    }

    // Index candidates by phone
    const candidatesByPhone = new Map<string, PingCandidate[]>();
    for (const c of (candidates || []) as PingCandidate[]) {
      const phone = c.caller_phone;
      if (!candidatesByPhone.has(phone)) candidatesByPhone.set(phone, []);
      candidatesByPhone.get(phone)!.push(c);
    }

    // Match each CSV row to its best candidate
    for (const phone of batchPhones) {
      const csvRows = byPhone.get(phone)!;
      const phoneCandidates = candidatesByPhone.get(phone) || [];
      const usedIds = new Set<string>();

      // Sort CSV rows chronologically for consistent matching
      csvRows.sort((a, b) => a.event_timestamp.getTime() - b.event_timestamp.getTime());

      for (const csvRow of csvRows) {
        const match = findBestMatch(csvRow, phoneCandidates, usedIds);

        if (match) {
          usedIds.add(match.id);

          // UPDATE: enrich the ping with CSV data (COALESCE — only overwrite NULL/empty)
          const { error: updateErr } = await supabaseAdmin
            .from("retreaver_events")
            .update({
              campaign_name: csvRow.campaign_name || undefined,
              publisher_name: csvRow.publisher_name || undefined,
              target_name: csvRow.target_name || undefined,
              agent_name: csvRow.agent_name || undefined,
              subcampaign: csvRow.subcampaign || undefined,
              caller_city: csvRow.caller_city || undefined,
              caller_state: csvRow.caller_state || undefined,
              caller_zip: csvRow.caller_zip || undefined,
              connected_secs: csvRow.connected_secs,
              billable_minutes: csvRow.billable_minutes,
              converted: csvRow.converted,
              call_status: csvRow.call_status || undefined,
              payout: csvRow.payout || undefined,
              target_phone: csvRow.target_phone ? normalizePhone(csvRow.target_phone) : undefined,
              call_uuid: csvRow.call_uuid || undefined,
              // Use CSV timestamp — more accurate than ping arrival time
              event_timestamp: csvRow.event_timestamp.toISOString(),
              enriched_at: new Date().toISOString(),
              s3_file_key: importKey,
            })
            .eq("id", match.id);

          if (updateErr) {
            result.errors.push(`Update error for ping ${match.id}: ${updateErr.message}`);
          } else {
            result.enriched++;
          }
        } else {
          unmatchedRows.push(csvRow);
        }
      }
    }
  }

  // Insert unmatched CSV rows as new records
  if (unmatchedRows.length > 0) {
    const insertResult = await upsertCSVRows(unmatchedRows, importKey);
    result.inserted = insertResult.imported;
    result.skipped_duplicate = insertResult.skipped;
    if (insertResult.error) {
      result.errors.push(`Insert error: ${insertResult.error}`);
    }
  }

  return result;
}

/** Refresh daily aggregates for given dates */
export async function refreshDailyAggregates(dates: string[]) {
  if (dates.length === 0) return;

  for (const date of dates) {
    // Campaign-level aggregates
    const { data: campaignAggs } = await supabaseAdmin.rpc("retreaver_aggregate_daily", { target_date: date });

    if (!campaignAggs) {
      // Fallback: direct query + upsert
      const { data: events } = await supabaseAdmin
        .from("retreaver_events")
        .select("campaign_name, revenue, payout, connected_secs, billable_minutes, converted")
        .gte("event_timestamp", `${date}T00:00:00Z`)
        .lt("event_timestamp", `${date}T23:59:59Z`);

      if (!events || events.length === 0) continue;

      // Group by campaign
      const byCampaign = new Map<string, { revenue: number; payout: number; calls: number; secs: number; mins: number; converted: number }>();

      for (const e of events) {
        const key = e.campaign_name || "__all__";
        const agg = byCampaign.get(key) || { revenue: 0, payout: 0, calls: 0, secs: 0, mins: 0, converted: 0 };
        agg.revenue += Number(e.revenue) || 0;
        agg.payout += Number(e.payout) || 0;
        agg.calls += 1;
        agg.secs += e.connected_secs || 0;
        agg.mins += Number(e.billable_minutes) || 0;
        if (e.converted) agg.converted += 1;
        byCampaign.set(key, agg);
      }

      // Also compute __all__ total
      let totalRev = 0, totalPay = 0, totalCalls = 0, totalSecs = 0, totalMins = 0, totalConv = 0;
      for (const agg of byCampaign.values()) {
        totalRev += agg.revenue;
        totalPay += agg.payout;
        totalCalls += agg.calls;
        totalSecs += agg.secs;
        totalMins += agg.mins;
        totalConv += agg.converted;
      }

      const rows = [
        {
          revenue_date: date,
          campaign_name: "__all__",
          agent_name: "__none__",
          total_revenue: Math.round(totalRev * 100) / 100,
          total_payout: Math.round(totalPay * 100) / 100,
          total_calls: totalCalls,
          avg_revenue_per_call: totalCalls > 0 ? Math.round((totalRev / totalCalls) * 100) / 100 : 0,
          total_connected_secs: totalSecs,
          total_billable_minutes: Math.round(totalMins * 100) / 100,
          converted_count: totalConv,
          updated_at: new Date().toISOString(),
        },
        ...Array.from(byCampaign.entries()).map(([campaign, agg]) => ({
          revenue_date: date,
          campaign_name: campaign,
          agent_name: "__none__",
          total_revenue: Math.round(agg.revenue * 100) / 100,
          total_payout: Math.round(agg.payout * 100) / 100,
          total_calls: agg.calls,
          avg_revenue_per_call: agg.calls > 0 ? Math.round((agg.revenue / agg.calls) * 100) / 100 : 0,
          total_connected_secs: agg.secs,
          total_billable_minutes: Math.round(agg.mins * 100) / 100,
          converted_count: agg.converted,
          updated_at: new Date().toISOString(),
        })),
      ];

      await supabaseAdmin
        .from("retreaver_daily_revenue")
        .upsert(rows, { onConflict: "idx_retreaver_daily_unique" });
    }
  }
}

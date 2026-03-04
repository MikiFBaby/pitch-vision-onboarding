import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
// @ts-expect-error — mailparser has no type declarations
import { simpleParser } from "mailparser";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  parseRetreaverCSV,
  enrichPingsFromCSV,
  refreshDailyAggregates,
} from "@/utils/retreaver-ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

const LOOKBACK_DAYS = 3;

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = "reatrever-data";

/**
 * Vercel cron endpoint — fetches Retreaver CSV reports from miki's Gmail via IMAP
 * and enriches existing ping records with the full data.
 *
 * Runs daily at 2 AM UTC (9 PM ET) via Vercel cron.
 * Searches the last 3 days to catch any gaps. Deduplicates via retreaver_import_log.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this header for cron invocations)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Also allow API key for manual triggers
    const apiKey = request.headers.get("X-API-Key");
    if (!apiKey || apiKey !== process.env.REATREVER_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const imapUser = process.env.RETREAVER_IMAP_USER;
  const imapPass = process.env.RETREAVER_IMAP_PASS;
  if (!imapUser || !imapPass) {
    return NextResponse.json(
      { error: "RETREAVER_IMAP_USER/RETREAVER_IMAP_PASS not configured" },
      { status: 500 },
    );
  }

  const log: string[] = [];
  const addLog = (msg: string) => {
    log.push(`[${new Date().toISOString()}] ${msg}`);
    console.log(`[retreaver-ingest] ${msg}`);
  };

  let client: ImapFlow | null = null;

  try {
    // Connect to Gmail IMAP
    client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: imapUser, pass: imapPass },
      logger: false,
    });

    await client.connect();
    addLog("Connected to Gmail IMAP");

    // Open INBOX
    await client.mailboxOpen("INBOX");

    // Search for Retreaver emails from the last N days
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - LOOKBACK_DAYS);

    // Configurable senders — if env var set, search by sender; otherwise broad subject search
    const configuredSenders = process.env.RETREAVER_EMAIL_SENDERS
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // Build search query: broad search for "retreaver" in subject OR from configured senders
    let searchQuery: Record<string, unknown>;
    if (configuredSenders && configuredSenders.length > 0) {
      // Specific senders configured — search by sender
      searchQuery = {
        since: sinceDate,
        or: configuredSenders.map((sender) => ({ from: sender })),
      };
    } else {
      // Broad search — look for "retreaver" in subject (IMAP SUBJECT search is case-insensitive)
      searchQuery = {
        since: sinceDate,
        subject: "retreaver",
      };
    }

    const messages = client.fetch(searchQuery, {
      uid: true,
      envelope: true,
      source: true,
    });

    let totalEmails = 0;
    let totalCSVs = 0;
    let totalSkipped = 0;
    let totalEnriched = 0;
    let totalInserted = 0;
    const allDates = new Set<string>();

    const results: {
      filename: string;
      s3Key: string;
      rows: number;
      enriched: number;
      inserted: number;
      skipped: number;
      errors?: string[];
    }[] = [];

    for await (const msg of messages) {
      totalEmails++;
      const subject = msg.envelope?.subject || "";
      const from = msg.envelope?.from?.[0]?.address || "";
      const source = msg.source;
      if (!source) continue;

      addLog(`Found email: "${subject}" from ${from}`);

      // Parse the email to extract attachments
      const parsed = await simpleParser(source);
      if (!parsed.attachments || parsed.attachments.length === 0) {
        addLog("  No attachments — skipping");
        continue;
      }

      for (const att of parsed.attachments) {
        const filename = att.filename;
        if (!filename || !filename.match(/\.csv$/i)) continue;

        totalCSVs++;
        addLog(`  CSV attachment: ${filename} (${att.size} bytes)`);

        // Build S3 key for archival
        const dateStr = new Date().toISOString().slice(0, 10);
        const s3Key = `email/${dateStr}/${filename}`;

        // Check if already processed (dedup via import log)
        const { data: existing } = await supabaseAdmin
          .from("retreaver_import_log")
          .select("id")
          .eq("s3_key", s3Key)
          .maybeSingle();

        if (existing) {
          addLog(`  Already processed — skipping`);
          totalSkipped++;
          continue;
        }

        // Upload CSV to S3 for archival
        const csvBuffer = att.content;
        await s3.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: s3Key,
            Body: csvBuffer,
            ContentType: "text/csv",
          }),
        );
        addLog(`  Uploaded to S3: ${s3Key}`);

        // Parse CSV
        const csvText = csvBuffer.toString("utf-8");
        const rows = parseRetreaverCSV(csvText);

        if (rows.length === 0) {
          addLog(`  Empty CSV — logging and skipping`);
          await supabaseAdmin.from("retreaver_import_log").upsert(
            {
              s3_key: s3Key,
              file_type: "empty",
              row_count: 0,
              imported_count: 0,
              skipped_count: 0,
              import_status: "completed",
            },
            { onConflict: "s3_key" },
          );
          continue;
        }

        addLog(`  Parsed ${rows.length} rows (${rows[0].source})`);

        // Enrich existing pings with CSV data; insert unmatched rows as new records
        const enrichResult = await enrichPingsFromCSV(rows, s3Key);

        // Log import
        await supabaseAdmin.from("retreaver_import_log").upsert(
          {
            s3_key: s3Key,
            file_type: rows[0].source,
            row_count: rows.length,
            imported_count: enrichResult.inserted,
            skipped_count: enrichResult.skipped_duplicate,
            enriched_count: enrichResult.enriched,
            unmatched_count: enrichResult.inserted,
            error_message:
              enrichResult.errors.length > 0
                ? enrichResult.errors.join("; ")
                : null,
            import_status:
              enrichResult.errors.length > 0 ? "partial" : "completed",
          },
          { onConflict: "s3_key" },
        );

        // Collect affected dates for aggregate refresh
        for (const r of rows) {
          allDates.add(r.event_timestamp.toISOString().slice(0, 10));
        }

        totalEnriched += enrichResult.enriched;
        totalInserted += enrichResult.inserted;

        results.push({
          filename,
          s3Key,
          rows: rows.length,
          enriched: enrichResult.enriched,
          inserted: enrichResult.inserted,
          skipped: enrichResult.skipped_duplicate,
          errors:
            enrichResult.errors.length > 0 ? enrichResult.errors : undefined,
        });

        addLog(
          `  Result: ${enrichResult.enriched} pings enriched, ${enrichResult.inserted} new rows inserted`,
        );
      }
    }

    // Refresh daily aggregates for all affected dates
    if (allDates.size > 0) {
      addLog(`Refreshing daily aggregates for ${allDates.size} dates`);
      await refreshDailyAggregates([...allDates]);
    }

    // Close IMAP connection
    await client.logout();
    client = null;

    const summary = {
      success: true,
      scanned_emails: totalEmails,
      csv_attachments: totalCSVs,
      skipped_already_processed: totalSkipped,
      total_enriched: totalEnriched,
      total_inserted: totalInserted,
      results,
      log,
    };

    addLog(
      `Done. Scanned ${totalEmails} emails, found ${totalCSVs} CSVs, enriched ${totalEnriched} pings, inserted ${totalInserted} new rows.`,
    );

    return NextResponse.json(summary);
  } catch (err) {
    addLog(`Fatal error: ${err instanceof Error ? err.message : "Unknown"}`);
    console.error("[retreaver-ingest] Fatal error:", err);

    // Ensure IMAP connection is closed
    if (client) {
      try {
        await client.logout();
      } catch {
        /* ignore */
      }
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed", log },
      { status: 500 },
    );
  }
}

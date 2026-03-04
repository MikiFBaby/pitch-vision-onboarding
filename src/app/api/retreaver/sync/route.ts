import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { insertPing, parseRetreaverCSV, upsertCSVRows, enrichPingsFromCSV, refreshDailyAggregates } from "@/utils/retreaver-ingest";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for backfill

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET = "reatrever-data";

/** Paginate through ALL objects in the S3 bucket */
async function listAllKeys(): Promise<{ key: string; size: number }[]> {
  const allObjects: { key: string; size: number }[] = [];
  let continuationToken: string | undefined;

  do {
    const listRes = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of listRes.Contents || []) {
      if (obj.Key) {
        allObjects.push({ key: obj.Key, size: obj.Size || 0 });
      }
    }

    continuationToken = listRes.IsTruncated ? listRes.NextContinuationToken : undefined;
  } while (continuationToken);

  return allObjects;
}

export async function GET(request: NextRequest) {
  const backfill = request.nextUrl.searchParams.get("backfill") === "true";

  try {
    const allObjects = await listAllKeys();

    if (backfill) {
      return handleBackfill(allObjects);
    }

    return handleCSVSync(allObjects);
  } catch (err) {
    console.error("Retreaver sync error:", err);
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Standard CSV sync — find and process unimported CSVs */
async function handleCSVSync(allObjects: { key: string; size: number }[]) {
  const csvKeys = allObjects
    .filter((obj) => obj.key.endsWith(".csv"))
    .map((obj) => obj.key);

  if (csvKeys.length === 0) {
    return NextResponse.json({
      message: "No CSV files found",
      total_objects: allObjects.length,
      processed: 0,
    });
  }

  // Check which have already been imported
  const { data: imported } = await supabaseAdmin
    .from("retreaver_import_log")
    .select("s3_key")
    .in("s3_key", csvKeys);

  const importedSet = new Set((imported || []).map((r) => r.s3_key));
  const pending = csvKeys.filter((k) => !importedSet.has(k));

  if (pending.length === 0) {
    return NextResponse.json({
      message: "All CSVs already imported",
      total: csvKeys.length,
      total_objects: allObjects.length,
      processed: 0,
    });
  }

  const results: { key: string; rows: number; enriched?: number; imported?: number; inserted?: number; skipped: number; error?: string }[] = [];
  const allDates = new Set<string>();

  for (const key of pending) {
    try {
      const getRes = await s3.send(
        new GetObjectCommand({ Bucket: BUCKET, Key: key }),
      );
      const csvText = await getRes.Body!.transformToString("utf-8");
      const rows = parseRetreaverCSV(csvText);

      if (rows.length === 0) {
        await supabaseAdmin.from("retreaver_import_log").upsert(
          {
            s3_key: key,
            file_type: "empty",
            row_count: 0,
            imported_count: 0,
            skipped_count: 0,
            import_status: "completed",
          },
          { onConflict: "s3_key" },
        );
        results.push({ key, rows: 0, imported: 0, skipped: 0 });
        continue;
      }

      // Enrich existing pings with CSV data; insert unmatched rows as new records
      const csvResult = await enrichPingsFromCSV(rows, key);

      await supabaseAdmin.from("retreaver_import_log").upsert(
        {
          s3_key: key,
          file_type: rows[0].source,
          row_count: rows.length,
          imported_count: csvResult.inserted,
          skipped_count: csvResult.skipped_duplicate,
          enriched_count: csvResult.enriched,
          unmatched_count: csvResult.inserted,
          error_message: csvResult.errors.length > 0 ? csvResult.errors.join("; ") : null,
          import_status: csvResult.errors.length > 0 ? "partial" : "completed",
        },
        { onConflict: "s3_key" },
      );

      for (const r of rows) {
        allDates.add(r.event_timestamp.toISOString().slice(0, 10));
      }

      results.push({
        key,
        rows: rows.length,
        enriched: csvResult.enriched,
        inserted: csvResult.inserted,
        skipped: csvResult.skipped_duplicate,
        error: csvResult.errors.length > 0 ? csvResult.errors.join("; ") : undefined,
      });
    } catch (fileErr) {
      const msg = fileErr instanceof Error ? fileErr.message : "Unknown error";
      await supabaseAdmin.from("retreaver_import_log").upsert(
        {
          s3_key: key,
          file_type: "unknown",
          row_count: 0,
          imported_count: 0,
          skipped_count: 0,
          error_message: msg,
          import_status: "error",
        },
        { onConflict: "s3_key" },
      );
      results.push({ key, rows: 0, imported: 0, skipped: 0, error: msg });
    }
  }

  // Refresh daily aggregates for all affected dates
  if (allDates.size > 0) {
    await refreshDailyAggregates([...allDates]);
  }

  return NextResponse.json({
    message: `Processed ${results.length} CSV files`,
    total_in_bucket: csvKeys.length,
    total_objects: allObjects.length,
    processed: results.length,
    results,
  });
}

/** Backfill: process .bin and .json files as potential pings */
async function handleBackfill(allObjects: { key: string; size: number }[]) {
  const pingFiles = allObjects.filter(
    (obj) => obj.key.endsWith(".bin") || obj.key.endsWith(".json"),
  );

  if (pingFiles.length === 0) {
    return NextResponse.json({ message: "No .bin/.json files found", processed: 0 });
  }

  // Check which have already been backfilled
  const batchSize = 200;
  const alreadyProcessed = new Set<string>();

  for (let i = 0; i < pingFiles.length; i += batchSize) {
    const batch = pingFiles.slice(i, i + batchSize).map((f) => f.key);
    const { data: imported } = await supabaseAdmin
      .from("retreaver_import_log")
      .select("s3_key")
      .in("s3_key", batch);
    for (const r of imported || []) {
      alreadyProcessed.add(r.s3_key);
    }
  }

  const pending = pingFiles.filter((f) => !alreadyProcessed.has(f.key));

  if (pending.length === 0) {
    return NextResponse.json({
      message: "All files already backfilled",
      total: pingFiles.length,
      processed: 0,
    });
  }

  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  const BATCH = 50;

  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);

    await Promise.all(
      batch.map(async (file) => {
        try {
          const getRes = await s3.send(
            new GetObjectCommand({ Bucket: BUCKET, Key: file.key }),
          );
          const text = await getRes.Body!.transformToString("utf-8");

          let json: Record<string, unknown>;
          try {
            json = JSON.parse(text);
          } catch {
            // Not valid JSON — skip
            skipped++;
            return;
          }

          if (json.phone && json.revenue !== undefined) {
            const { error } = await insertPing(
              String(json.phone),
              String(json.revenue),
              json,
            );
            if (error) {
              // Dedup collision is fine (ignoreDuplicates)
              skipped++;
            } else {
              inserted++;
            }
          } else {
            skipped++;
          }

          // Mark as processed
          await supabaseAdmin.from("retreaver_import_log").upsert(
            {
              s3_key: file.key,
              file_type: "backfill_ping",
              row_count: 1,
              imported_count: 1,
              skipped_count: 0,
              import_status: "completed",
            },
            { onConflict: "s3_key" },
          );
        } catch {
          errors++;
        }
      }),
    );
  }

  // Refresh today's aggregates (pings span recent dates)
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await refreshDailyAggregates([today, yesterday]);

  return NextResponse.json({
    message: `Backfill complete`,
    total_files: pingFiles.length,
    already_processed: alreadyProcessed.size,
    pending: pending.length,
    inserted,
    skipped,
    errors,
  });
}

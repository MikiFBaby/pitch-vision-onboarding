import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { insertPing, parseRetreaverCSV, upsertCSVRows, refreshDailyAggregates } from "@/utils/retreaver-ingest";
import { supabaseAdmin } from "@/lib/supabase-admin";

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = "reatrever-data";
const API_KEY = process.env.REATREVER_API_KEY;

export async function POST(req: NextRequest) {
  // Authenticate
  const authHeader = req.headers.get("x-api-key");
  if (!API_KEY || authHeader !== API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";

    // ── Multipart file uploads → handled separately (body is multipart, not text) ──
    if (contentType.includes("multipart/form-data")) {
      return handleMultipart(req);
    }

    // ── Read raw body once (all non-multipart paths use this) ──
    const rawBody = await req.text();

    // ── Try JSON parse regardless of content-type ──
    // Contact sends pings WITHOUT application/json header — detect by body shape
    let parsedJson: Record<string, unknown> | null = null;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      /* not JSON — continue to raw body handler */
    }

    // ── JSON ping detected → Supabase only (skip S3) ──
    if (parsedJson && typeof parsedJson === "object" && parsedJson.phone && parsedJson.revenue !== undefined) {
      const { error, dedupKey } = await insertPing(
        String(parsedJson.phone),
        String(parsedJson.revenue),
        parsedJson,
      );

      if (error) {
        console.error("Supabase ping insert error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Refresh today's aggregates (non-blocking)
      const today = new Date().toISOString().slice(0, 10);
      refreshDailyAggregates([today]).catch(() => {});

      return NextResponse.json({
        success: true,
        source: "api_ping",
        dedup_key: dedupKey,
      });
    }

    // ── Non-ping JSON → S3 ──
    if (parsedJson && typeof parsedJson === "object") {
      const body = Buffer.from(JSON.stringify(parsedJson, null, 2));
      const key = `${Date.now()}-data.json`;
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: body,
          ContentType: "application/json",
        }),
      );
      return NextResponse.json({ success: true, file: key, size: body.length, bucket: BUCKET });
    }

    // ── Raw body (CSV, XML, text, binary) → S3 + parse CSV into Supabase ──
    const body = Buffer.from(rawBody, "utf-8");
    const isCSV = contentType.includes("csv");
    const ext = isCSV
      ? "csv"
      : contentType.includes("xml")
        ? "xml"
        : contentType.includes("text")
          ? "txt"
          : "bin";
    const key = `${Date.now()}-data.${ext}`;

    // Upload to S3
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType || "application/octet-stream",
      }),
    );

    // If CSV, also parse and insert into Supabase
    let csvResult: { imported: number; skipped: number; error?: string } | null = null;

    if (isCSV) {
      csvResult = await processCSV(rawBody, key);
    }

    return NextResponse.json({
      success: true,
      file: key,
      size: body.length,
      bucket: BUCKET,
      ...(csvResult && {
        csv: {
          imported: csvResult.imported,
          skipped: csvResult.skipped,
          error: csvResult.error,
        },
      }),
    });
  } catch (err: unknown) {
    console.error("Upload error:", err);
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Handle multipart file uploads → S3 + parse CSV into Supabase */
async function handleMultipart(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  const body = Buffer.from(await file.arrayBuffer());
  const key = `${Date.now()}-${file.name}`;

  // Upload to S3
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: file.type || "application/octet-stream",
    }),
  );

  // If CSV, also parse and insert into Supabase
  const isCSV = file.name.endsWith(".csv") || (file.type || "").includes("csv");
  let csvResult: { imported: number; skipped: number; error?: string } | null = null;

  if (isCSV) {
    csvResult = await processCSV(body.toString("utf-8"), key);
  }

  return NextResponse.json({
    success: true,
    file: key,
    size: body.length,
    bucket: BUCKET,
    ...(csvResult && {
      csv: {
        imported: csvResult.imported,
        skipped: csvResult.skipped,
        error: csvResult.error,
      },
    }),
  });
}

/** Parse CSV text and upsert into Supabase */
async function processCSV(csvText: string, s3Key: string) {
  const rows = parseRetreaverCSV(csvText);
  if (rows.length === 0) return null;

  const csvResult = await upsertCSVRows(rows, s3Key);

  // Log import
  await supabaseAdmin.from("retreaver_import_log").upsert(
    {
      s3_key: s3Key,
      file_type: rows[0].source,
      row_count: rows.length,
      imported_count: csvResult.imported,
      skipped_count: csvResult.skipped,
      error_message: csvResult.error || null,
      import_status: csvResult.error ? "error" : "completed",
    },
    { onConflict: "s3_key" },
  );

  // Refresh daily aggregates for affected dates
  const dates = [...new Set(rows.map((r) => r.event_timestamp.toISOString().slice(0, 10)))];
  await refreshDailyAggregates(dates);

  return csvResult;
}

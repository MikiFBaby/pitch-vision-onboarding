import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

interface QARow {
  date?: string;
  review_date?: string;
  time?: string;
  review_time?: string;
  agent_name: string;
  phone_number?: string;
  violation: string;
  reviewer?: string;
  campaign?: string;
}

/**
 * POST /api/hr/qa-sheet-sync
 * Accepts parsed QA manual review rows and upserts into qa_manual_reviews.
 * Uses ON CONFLICT (agent_name, phone_number, review_date, violation) to deduplicate.
 *
 * Body: { rows: QARow[], sheet_id?: string }
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const rows: QARow[] = body.rows;
  const sheetId: string | undefined = body.sheet_id;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows array required" }, { status: 400 });
  }

  // Parse date from various formats: "9-17-2025", "2025-09-17", "1/10/2025"
  // Handles ambiguous M-D vs D-M: if first>12 → D-M-Y; if result is future, try swap
  function parseDate(raw: string): string | null {
    if (!raw || !raw.trim()) return null;
    const s = raw.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const match = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (!match) return null;

    const [a, b, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    let month: number, day: number;

    if (a > 12) {
      month = b; day = a;
    } else if (b > 12) {
      month = a; day = b;
    } else {
      // Both ≤12: assume M-D-Y, swap if result is in the future
      month = a; day = b;
      const today = new Date();
      const parsed = new Date(y, month - 1, day);
      if (parsed > today && a !== b) {
        const alt = new Date(y, b - 1, a);
        if (alt <= today) { month = b; day = a; }
      }
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Normalize phone: strip non-digits
  function normalizePhone(raw?: string): string | null {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, "");
    return digits.length >= 7 ? digits : null;
  }

  // Batch upsert in chunks of 500
  const BATCH = 500;
  let inserted = 0;
  let skipped = 0;
  let errors: string[] = [];

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const records = chunk
      .map((r) => {
        const reviewDate = parseDate(r.date || r.review_date || "");
        if (!reviewDate || !r.agent_name?.trim() || !r.violation?.trim()) {
          skipped++;
          return null;
        }
        return {
          review_date: reviewDate,
          review_time: (r.time || r.review_time)?.trim() || null,
          agent_name: r.agent_name.trim(),
          phone_number: normalizePhone(r.phone_number),
          violation: r.violation.trim(),
          reviewer: r.reviewer?.trim() || null,
          campaign: r.campaign?.trim() || null,
          sheet_id: sheetId || null,
        };
      })
      .filter(Boolean);

    if (records.length === 0) continue;

    const { error, count } = await supabaseAdmin
      .from("qa_manual_reviews")
      .upsert(records, {
        onConflict: "agent_name,phone_number,review_date,violation",
        ignoreDuplicates: true,
      });

    if (error) {
      console.error("qa-sheet-sync upsert error:", error);
      errors.push(error.message);
    } else {
      inserted += records.length;
    }
  }

  return NextResponse.json({
    success: errors.length === 0,
    inserted,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}

/**
 * GET /api/hr/qa-sheet-sync
 * Returns stats about existing qa_manual_reviews data.
 */
export async function GET() {
  const { count, error } = await supabaseAdmin
    .from("qa_manual_reviews")
    .select("*", { count: "exact", head: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: dateRange } = await supabaseAdmin
    .from("qa_manual_reviews")
    .select("review_date")
    .order("review_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: latestDate } = await supabaseAdmin
    .from("qa_manual_reviews")
    .select("review_date")
    .order("review_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    total_reviews: count || 0,
    earliest_date: dateRange?.review_date || null,
    latest_date: latestDate?.review_date || null,
  });
}

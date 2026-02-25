import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * GET /api/hr/qa-manual-stats?name=Agent+Name
 * Returns manual QA review stats for a specific agent.
 * Fuzzy matches: exact → case-insensitive → partial.
 */
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: "name parameter required" }, { status: 400 });
  }

  const agentName = name.trim();

  // Try exact case-insensitive match first
  const { data: reviews, error } = await supabaseAdmin
    .from("qa_manual_reviews")
    .select("*")
    .ilike("agent_name", agentName)
    .order("review_date", { ascending: false });

  if (error) {
    console.error("qa-manual-stats query error:", error);
    return NextResponse.json({ error: "Database query failed" }, { status: 500 });
  }

  // If no exact match, try partial (first name + last initial)
  let matchedReviews = reviews || [];
  let matchType = "exact";

  if (matchedReviews.length === 0) {
    const parts = agentName.split(/\s+/);
    if (parts.length >= 2) {
      const firstName = parts[0];
      const lastName = parts[parts.length - 1];
      // Try "FirstName LastName%" or "%FirstName%LastName%"
      const { data: partialReviews } = await supabaseAdmin
        .from("qa_manual_reviews")
        .select("*")
        .or(`agent_name.ilike.${firstName} ${lastName}%,agent_name.ilike.${firstName}% ${lastName}`)
        .order("review_date", { ascending: false });

      if (partialReviews && partialReviews.length > 0) {
        matchedReviews = partialReviews;
        matchType = "partial";
      }
    }
  }

  if (matchedReviews.length === 0) {
    return NextResponse.json({ total: 0, violations: [], recent: [], matchType: "none" });
  }

  // Aggregate violation counts
  const violationCounts: Record<string, number> = {};
  for (const r of matchedReviews) {
    const v = normalizeViolation(r.violation);
    violationCounts[v] = (violationCounts[v] || 0) + 1;
  }

  // Sort by count descending
  const violations = Object.entries(violationCounts)
    .map(([violation, count]) => ({ violation, count }))
    .sort((a, b) => b.count - a.count);

  // Recent 10 reviews
  const recent = matchedReviews.slice(0, 10).map((r) => ({
    date: r.review_date,
    time: r.review_time,
    phone: r.phone_number,
    violation: r.violation,
    reviewer: r.reviewer,
    campaign: r.campaign,
  }));

  // Monthly trend (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const monthCounts: Record<string, number> = {};
  for (const r of matchedReviews) {
    const d = new Date(r.review_date);
    if (d >= sixMonthsAgo) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthCounts[key] = (monthCounts[key] || 0) + 1;
    }
  }

  const trend = Object.entries(monthCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  return NextResponse.json({
    total: matchedReviews.length,
    matchType,
    matchedName: matchedReviews[0]?.agent_name || agentName,
    violations,
    recent,
    trend,
    earliest: matchedReviews[matchedReviews.length - 1]?.review_date,
    latest: matchedReviews[0]?.review_date,
  });
}

/** Normalize common violation variants to a canonical form */
function normalizeViolation(v: string): string {
  const s = v.trim().toLowerCase();

  // HUT variants
  if (/^hut\b/.test(s) && !s.includes("as")) return "HUT";
  if (/hut\s*(as\s*)?(tr|transfer)/.test(s)) return "HUT (Transfer)";
  if (s === "huta" || s.startsWith("huta,") || s.startsWith("huta ")) return "HUTA";
  if (/hang\s*up\s*transfer/.test(s)) return "HUT (Transfer)";

  // WN variants
  if (/^wn\b/.test(s) && !s.includes("as")) return "Wrong Number";
  if (/wn\s*(as\s*)?(tr|transfer)/.test(s)) return "Wrong Number (Transfer)";

  // NI variants
  if (/^ni\b/.test(s) && !s.includes("as")) return "Not Interested";
  if (/ni\s*(as\s*)?(tr|transfer)/.test(s)) return "Not Interested (Transfer)";

  // Common violations
  if (s.includes("no verbal consent")) return "No Verbal Consent";
  if (s.includes("no aca")) return "No ACA Pitch";
  if (s.includes("no handoff")) return "No Handoff";
  if (s.includes("no double confirm")) return "No Double Confirmation";
  if (s.includes("callback") || s === "cb") return "Callback";
  if (s.includes("poor volp") || s.includes("cutting out")) return "Audio Quality Issues";

  // Return original with first letter capitalized
  return v.trim().charAt(0).toUpperCase() + v.trim().slice(1);
}

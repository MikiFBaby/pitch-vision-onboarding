import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * GET /api/hr/qa-manual-stats?name=Agent+Name&from=2025-01-01&to=2025-12-31
 * Returns manual QA review stats for a specific agent.
 * Optional from/to params filter by review_date range.
 * Fuzzy matches: exact → case-insensitive → partial.
 */
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: "name parameter required" }, { status: 400 });
  }

  const agentName = name.trim();
  const from = req.nextUrl.searchParams.get("from"); // YYYY-MM-DD
  const to = req.nextUrl.searchParams.get("to");     // YYYY-MM-DD

  // Build base query with optional date filters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyDateFilters(query: any) {
    if (from) query = query.gte("review_date", from);
    if (to) query = query.lte("review_date", to);
    return query;
  }

  // Try exact case-insensitive match first
  let query = supabaseAdmin
    .from("qa_manual_reviews")
    .select("*")
    .ilike("agent_name", agentName)
    .order("review_date", { ascending: false });
  query = applyDateFilters(query);

  const { data: reviews, error } = await query;

  if (error) {
    console.error("qa-manual-stats query error:", error);
    return NextResponse.json({ error: "Database query failed" }, { status: 500 });
  }

  // Filter out future-dated reviews (data entry errors like 2029 instead of 2025)
  const today = new Date().toISOString().slice(0, 10);
  let matchedReviews = (reviews || []).filter((r) => r.review_date <= today);
  let matchType = "exact";

  if (matchedReviews.length === 0) {
    const parts = agentName.split(/\s+/);
    if (parts.length >= 2) {
      const firstName = parts[0];
      const lastName = parts[parts.length - 1];
      let partialQuery = supabaseAdmin
        .from("qa_manual_reviews")
        .select("*")
        .or(`agent_name.ilike.${firstName} ${lastName}%,agent_name.ilike.${firstName}% ${lastName}`)
        .order("review_date", { ascending: false });
      partialQuery = applyDateFilters(partialQuery);

      const { data: partialReviews } = await partialQuery;

      if (partialReviews && partialReviews.length > 0) {
        matchedReviews = partialReviews;
        matchType = "partial";
      }
    }
  }

  if (matchedReviews.length === 0) {
    return NextResponse.json({ total: 0, violations: [], recent: [], trend: [], matchType: "none" });
  }

  // Aggregate violation counts with campaign breakdown
  const violationData: Record<string, { count: number; campaigns: Set<string> }> = {};
  for (const r of matchedReviews) {
    const v = normalizeViolation(r.violation);
    if (!violationData[v]) violationData[v] = { count: 0, campaigns: new Set() };
    violationData[v].count++;
    if (r.campaign) violationData[v].campaigns.add(normalizeCampaign(r.campaign));
  }

  // Sort by count descending
  const violations = Object.entries(violationData)
    .map(([violation, { count, campaigns }]) => ({ violation, count, campaigns: [...campaigns].sort() }))
    .sort((a, b) => b.count - a.count);

  // All reviews (frontend handles display limits)
  const recent = matchedReviews.map((r) => ({
    date: r.review_date,
    time: r.review_time,
    phone: r.phone_number,
    violation: normalizeViolation(r.violation),
    reviewer: r.reviewer,
    campaign: r.campaign ? normalizeCampaign(r.campaign) : r.campaign,
  }));

  // Monthly trend across the filtered range
  const monthCounts: Record<string, number> = {};
  for (const r of matchedReviews) {
    const d = new Date(r.review_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthCounts[key] = (monthCounts[key] || 0) + 1;
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
    filtered: { from: from || null, to: to || null },
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

/** Normalize campaign names from tab-name parsing artifacts */
function normalizeCampaign(c: string): string {
  const s = c.trim().toUpperCase();
  if (s.includes("ARAGON")) return "ARAGON";
  if (s.includes("WHATIF") || s.includes("WHAT IF")) return "WHATIF";
  if (s.includes("PITCH HEALTH")) return "Pitch Health";
  if (s.includes("ELITE") || s.includes("FYM")) return "Elite FYM";
  return c.trim();
}

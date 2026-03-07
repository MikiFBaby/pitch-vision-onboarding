import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * GET /api/agent/resolve-name?email=abbas@example.com
 *
 * Resolves the effective DialedIn name for an agent from employee_directory.
 * Returns dialedin_name if set, otherwise falls back to first_name + last_name.
 * Used by the agent portal to ensure name matches DialedIn records.
 */
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email || email.trim().length < 3) {
    return NextResponse.json({ name: null });
  }

  const { data, error } = await supabaseAdmin
    .from("employee_directory")
    .select("dialedin_name, first_name, last_name")
    .ilike("email", email.trim())
    .eq("employee_status", "Active")
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ name: null });
  }

  const name =
    data.dialedin_name ||
    `${data.first_name || ""} ${data.last_name || ""}`.trim() ||
    null;

  return NextResponse.json({ name });
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * GET /api/hr/employee-notes?employee_id=xxx
 * Returns all notes for an employee, newest first.
 */
export async function GET(req: NextRequest) {
  const employeeId = req.nextUrl.searchParams.get("employee_id");
  if (!employeeId) {
    return NextResponse.json({ error: "employee_id required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("employee_notes")
    .select("id, note, added_by, created_at")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notes: data || [] });
}

/**
 * POST /api/hr/employee-notes
 * Body: { employee_id, note, added_by, added_by_email? }
 * If added_by_email is provided, resolves display name from employee_directory.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { employee_id, note, added_by, added_by_email } = body;

  if (!employee_id || !note?.trim()) {
    return NextResponse.json({ error: "employee_id and note are required" }, { status: 400 });
  }

  // Resolve display name server-side from email
  let resolvedName = added_by?.trim() || "Unknown";

  if (added_by_email) {
    const { data: dirMatch } = await supabaseAdmin
      .from("employee_directory")
      .select("first_name, last_name")
      .ilike("email", added_by_email.trim())
      .maybeSingle();

    if (dirMatch?.first_name && dirMatch?.last_name) {
      resolvedName = `${dirMatch.first_name} ${dirMatch.last_name}`;
    } else if (dirMatch?.first_name) {
      resolvedName = dirMatch.first_name;
    } else {
      const { data: userMatch } = await supabaseAdmin
        .from("users")
        .select("first_name, last_name")
        .eq("email", added_by_email.trim())
        .maybeSingle();

      if (userMatch?.first_name && userMatch?.last_name) {
        resolvedName = `${userMatch.first_name} ${userMatch.last_name}`;
      } else if (userMatch?.first_name) {
        resolvedName = userMatch.first_name;
      }
    }
  }

  const { data, error } = await supabaseAdmin
    .from("employee_notes")
    .insert({ employee_id, note: note.trim(), added_by: resolvedName })
    .select("id, note, added_by, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ note: data });
}

/**
 * DELETE /api/hr/employee-notes
 * Body: { id }
 */
export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("employee_notes")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

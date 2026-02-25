import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// GET — list active cost configs
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("executive_cost_config")
    .select("*")
    .eq("is_active", true)
    .order("category")
    .order("subcategory");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST — create new cost config
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { category, subcategory, rate_type, rate_amount, campaign, description, effective_start } = body;

  if (!category || !rate_type || rate_amount == null || !description) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("executive_cost_config")
    .insert({
      category,
      subcategory: subcategory || null,
      rate_type,
      rate_amount,
      campaign: campaign || null,
      description,
      effective_start: effective_start || new Date().toISOString().split("T")[0],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

// PUT — update cost config
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("executive_cost_config")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE — soft-delete (deactivate)
export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("executive_cost_config")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

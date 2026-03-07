import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    const agent = req.nextUrl.searchParams.get("agent");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "10", 10);

    if (!agent || agent.trim().length < 2) {
        return NextResponse.json({ calls: [] });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split("T")[0];

    const { data, error } = await supabaseAdmin
        .from("QA Results")
        .select("id, call_date, phone_number, compliance_score, auto_fail_triggered, risk_level, call_duration, product_type")
        .ilike("agent_name", `${agent.trim()}%`)
        .gte("call_date", startDate)
        .order("call_date", { ascending: false })
        .limit(Math.min(limit, 20));

    if (error) {
        console.error("[agent/recent-calls] query error:", error);
        return NextResponse.json({ calls: [] });
    }

    return NextResponse.json({ calls: data || [] });
}

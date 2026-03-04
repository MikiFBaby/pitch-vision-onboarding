import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { firstName, lastName, monday, tuesday, wednesday, thursday, friday, saturday, notes, firstBreak, lunchBreak, secondBreak } = body;

        if (!firstName || !lastName) {
            return NextResponse.json({ error: "firstName and lastName are required" }, { status: 400 });
        }

        const fName = firstName.trim();
        const lName = lastName.trim();

        // --- Agent Schedule (shift times) ---
        const { data: existing } = await supabase
            .from("Agent Schedule")
            .select("id")
            .ilike("First Name", fName)
            .ilike("Last Name", lName)
            .maybeSingle();

        let scheduleId: string;

        if (existing) {
            const { error } = await supabase
                .from("Agent Schedule")
                .update({
                    Monday: monday || "",
                    Tuesday: tuesday || "",
                    Wednesday: wednesday || "",
                    Thursday: thursday || "",
                    Friday: friday || "",
                    Saturday: saturday || "",
                    Notes: notes || "",
                    source: "onboarding",
                })
                .eq("id", existing.id);

            if (error) {
                console.error("[Schedule] Update failed:", error.message);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
            scheduleId = existing.id;
        } else {
            const { data: inserted, error } = await supabase
                .from("Agent Schedule")
                .insert({
                    "First Name": fName,
                    "Last Name": lName,
                    Monday: monday || "",
                    Tuesday: tuesday || "",
                    Wednesday: wednesday || "",
                    Thursday: thursday || "",
                    Friday: friday || "",
                    Saturday: saturday || "",
                    Notes: notes || "",
                    is_active: true,
                    source: "onboarding",
                })
                .select("id")
                .single();

            if (error) {
                console.error("[Schedule] Insert failed:", error.message);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
            scheduleId = inserted.id;
        }

        // --- Agent Break Schedule (break times) ---
        const hasBreaks = firstBreak?.trim() || lunchBreak?.trim() || secondBreak?.trim();
        if (hasBreaks) {
            const { data: existingBreak } = await supabase
                .from("Agent Break Schedule")
                .select("id")
                .ilike("First Name", fName)
                .ilike("Last Name", lName)
                .maybeSingle();

            const breakData = {
                "First Break": firstBreak?.trim() || "",
                "Lunch Break": lunchBreak?.trim() || "",
                "Second Break": secondBreak?.trim() || "",
                Notes: notes || "",
            };

            if (existingBreak) {
                const { error } = await supabase
                    .from("Agent Break Schedule")
                    .update(breakData)
                    .eq("id", existingBreak.id);

                if (error) {
                    console.error("[Break Schedule] Update failed:", error.message);
                }
            } else {
                const { error } = await supabase
                    .from("Agent Break Schedule")
                    .insert({
                        "First Name": fName,
                        "Last Name": lName,
                        ...breakData,
                    });

                if (error) {
                    console.error("[Break Schedule] Insert failed:", error.message);
                }
            }
        }

        return NextResponse.json({ ok: true, action: existing ? "updated" : "created", id: scheduleId });
    } catch (err: any) {
        console.error("[Schedule] Error:", err);
        return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
    }
}

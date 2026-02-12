import { SupabaseClient } from "@supabase/supabase-js";

const CONTRACT_CHECKLIST_ITEM_ID = "c0a80121-0001-4000-8000-000000000001";

/**
 * When a contract is signed, mark the Employment Contract checklist item as completed
 * and recalculate the overall hire status.
 */
export async function markContractCompleted(
    supabase: SupabaseClient,
    employeeId: string,
    signedDocUrl: string | null
) {
    // Find the onboarding_new_hires record linked to this employee
    const { data: hire } = await supabase
        .from("onboarding_new_hires")
        .select("id")
        .eq("employee_id", employeeId)
        .maybeSingle();

    if (!hire) return;

    // Update the contract checklist item progress to completed
    const { data: existing } = await supabase
        .from("onboarding_progress")
        .select("id")
        .eq("new_hire_id", hire.id)
        .eq("checklist_item_id", CONTRACT_CHECKLIST_ITEM_ID)
        .maybeSingle();

    if (existing) {
        await supabase
            .from("onboarding_progress")
            .update({
                status: "completed",
                completed_at: new Date().toISOString(),
                document_url: signedDocUrl,
                updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
    } else {
        // Create progress record if it doesn't exist yet
        await supabase
            .from("onboarding_progress")
            .insert({
                new_hire_id: hire.id,
                checklist_item_id: CONTRACT_CHECKLIST_ITEM_ID,
                status: "completed",
                completed_at: new Date().toISOString(),
                document_url: signedDocUrl,
            });
    }

    // Recalculate and update the hire's overall status
    await recalculateHireStatus(supabase, hire.id);
}

/**
 * When a contract is sent or viewed, mark the contract checklist item as in_progress.
 */
export async function markContractInProgress(
    supabase: SupabaseClient,
    employeeId: string
) {
    const { data: hire } = await supabase
        .from("onboarding_new_hires")
        .select("id")
        .eq("employee_id", employeeId)
        .maybeSingle();

    if (!hire) return;

    const { data: existing } = await supabase
        .from("onboarding_progress")
        .select("id, status")
        .eq("new_hire_id", hire.id)
        .eq("checklist_item_id", CONTRACT_CHECKLIST_ITEM_ID)
        .maybeSingle();

    // Only update if not already completed
    if (existing && existing.status !== "completed") {
        await supabase
            .from("onboarding_progress")
            .update({
                status: "in_progress",
                updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);

        await recalculateHireStatus(supabase, hire.id);
    }
}

/**
 * Recalculate the overall onboarding status for a hire based on their checklist progress.
 */
export async function recalculateHireStatus(
    supabase: SupabaseClient,
    newHireId: string
) {
    const { data: progressItems } = await supabase
        .from("onboarding_progress")
        .select("status")
        .eq("new_hire_id", newHireId);

    if (!progressItems || progressItems.length === 0) return;

    const completed = progressItems.filter(p => p.status === "completed").length;
    const total = progressItems.length;

    let newStatus: "not_started" | "in_progress" | "completed";
    if (completed === total) {
        newStatus = "completed";
    } else if (completed > 0 || progressItems.some(p => p.status === "in_progress")) {
        newStatus = "in_progress";
    } else {
        newStatus = "not_started";
    }

    await supabase
        .from("onboarding_new_hires")
        .update({
            status: newStatus,
            completed_at: newStatus === "completed" ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", newHireId);
}

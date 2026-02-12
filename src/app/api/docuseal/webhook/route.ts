import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { markContractCompleted, markContractInProgress } from "@/utils/onboarding-helpers";

export async function POST(req: Request) {
    try {
        const data = await req.json();

        const eventType = data.event_type || data.type;
        // DocuSeal webhook payload: submission ID is at data.submission.id (nested object)
        // data.id is the SUBMITTER id (different number) — do NOT use as primary lookup
        const submissionId = data.data?.submission?.id || data.data?.submission_id;
        const submitterId = data.data?.id;

        console.log(`DocuSeal webhook: event=${eventType}, submissionId=${submissionId}, submitterId=${submitterId}`);

        if (!eventType || (!submissionId && !submitterId)) {
            return NextResponse.json(
                { error: "Invalid webhook payload" },
                { status: 400 }
            );
        }

        // Find the employee by their DocuSeal submission ID in employee_directory
        // Try submission_id first (correct), fall back to submitter_id if needed
        let employee: any = null;
        let findError: any = null;

        if (submissionId) {
            const result = await supabaseAdmin
                .from("employee_directory")
                .select("id, first_name, last_name, email")
                .eq("docuseal_submission_id", String(submissionId))
                .maybeSingle();
            employee = result.data;
            findError = result.error;
        }

        // If no match by submission_id, try submitter_id as fallback
        if (!employee && submitterId) {
            const result = await supabaseAdmin
                .from("employee_directory")
                .select("id, first_name, last_name, email")
                .eq("docuseal_submission_id", String(submitterId))
                .maybeSingle();
            employee = result.data;
            findError = result.error;
        }

        if (findError || !employee) {
            console.error("No matching employee for submission:", submissionId);
            return NextResponse.json(
                { error: "No matching employee found" },
                { status: 404 }
            );
        }

        if (eventType === "form.completed") {
            // Extract signed document URLs from webhook payload
            const documents = data.data?.documents || [];
            const signedDocUrl = documents[0]?.url || null;
            const auditLogUrl = data.data?.audit_log_url
                || data.data?.submission?.audit_log_url || null;

            // Contract has been signed - update employee_directory
            const { error: updateError } = await supabaseAdmin
                .from("employee_directory")
                .update({
                    contract_status: "signed",
                    signed_contract_url: signedDocUrl,
                    signed_contract_audit_url: auditLogUrl,
                    contract_signed_at: new Date().toISOString(),
                })
                .eq("id", employee.id);

            if (updateError) {
                console.error("Error updating employee status:", updateError);
                return NextResponse.json(
                    { error: "Failed to update status" },
                    { status: 500 }
                );
            }

            // Update onboarding checklist progress + hire status
            await markContractCompleted(supabaseAdmin, employee.id, signedDocUrl);

            console.log(`Contract signed by ${employee.first_name} ${employee.last_name}${signedDocUrl ? ` - doc: ${signedDocUrl}` : ""}`);

            return NextResponse.json({
                success: true,
                message: `Contract signed by ${employee.first_name} ${employee.last_name}`
            });
        }

        if (eventType === "form.declined") {
            await supabaseAdmin
                .from("employee_directory")
                .update({ contract_status: "declined" })
                .eq("id", employee.id);

            console.log(`Contract declined by ${employee.first_name} ${employee.last_name}`);

            return NextResponse.json({
                success: true,
                message: `Contract declined by ${employee.first_name} ${employee.last_name}`
            });
        }

        if (eventType === "form.started" || eventType === "form.viewed") {
            // Employee opened the contract
            await supabaseAdmin
                .from("employee_directory")
                .update({ contract_status: "opened" })
                .eq("id", employee.id);

            // Mark contract checklist item as in_progress
            await markContractInProgress(supabaseAdmin, employee.id);

            return NextResponse.json({
                success: true,
                message: `Contract ${eventType} by ${employee.first_name} ${employee.last_name}`
            });
        }

        return NextResponse.json({ received: true, event: eventType });
    } catch (error) {
        console.error("DocuSeal webhook error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

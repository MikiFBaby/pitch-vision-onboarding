import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { markContractCompleted, markContractInProgress } from "@/utils/onboarding-helpers";

/**
 * GET handler — health check to verify the webhook endpoint is reachable.
 * Test with: curl https://pitchvision.io/api/docuseal/webhook
 */
export async function GET() {
    return NextResponse.json({
        status: "ok",
        service: "docuseal-webhook",
        timestamp: new Date().toISOString(),
    });
}

/**
 * POST handler for DocuSeal webhook events.
 * Events: form.viewed, form.started, form.completed, form.declined
 *
 * Payload structure (form events):
 *   event_type: "form.completed"
 *   data.id: submitter ID (number)
 *   data.email: submitter email
 *   data.submission.id: submission ID (number) — stored as docuseal_submission_id
 *   data.documents: [{ name, url }]
 *   data.audit_log_url: string
 */
export async function POST(req: Request) {
    try {
        const payload = await req.json();

        const eventType = payload.event_type || payload.type;
        const submitterData = payload.data || {};
        const submissionId = submitterData.submission?.id || submitterData.submission_id;
        const submitterId = submitterData.id;
        const submitterEmail = submitterData.email;

        console.log(`[DocuSeal Webhook] event=${eventType}, submissionId=${submissionId}, submitterId=${submitterId}, email=${submitterEmail}`);

        if (!eventType) {
            console.error("[DocuSeal Webhook] Missing event_type in payload");
            return NextResponse.json({ error: "Missing event_type" }, { status: 400 });
        }

        // ── Find the employee ──────────────────────────────────────────────
        // Strategy: try submission_id first, then submitter_id, then email fallback
        let employee: any = null;

        // 1) Match by submission ID (primary — most reliable)
        if (!employee && submissionId) {
            const { data } = await supabaseAdmin
                .from("employee_directory")
                .select("id, first_name, last_name, email, docuseal_submission_id")
                .eq("docuseal_submission_id", String(submissionId))
                .maybeSingle();
            employee = data;
            if (employee) console.log(`[DocuSeal Webhook] Matched by submission_id=${submissionId} -> ${employee.first_name} ${employee.last_name}`);
        }

        // 2) Match by submitter ID as fallback
        if (!employee && submitterId) {
            const { data } = await supabaseAdmin
                .from("employee_directory")
                .select("id, first_name, last_name, email, docuseal_submission_id")
                .eq("docuseal_submission_id", String(submitterId))
                .maybeSingle();
            employee = data;
            if (employee) console.log(`[DocuSeal Webhook] Matched by submitter_id=${submitterId} -> ${employee.first_name} ${employee.last_name}`);
        }

        // 3) Email-based fallback — catches empty/missing submission_id cases
        if (!employee && submitterEmail) {
            const { data } = await supabaseAdmin
                .from("employee_directory")
                .select("id, first_name, last_name, email, docuseal_submission_id")
                .eq("email", submitterEmail.toLowerCase())
                .maybeSingle();
            employee = data;
            if (employee) {
                console.log(`[DocuSeal Webhook] Matched by email=${submitterEmail} -> ${employee.first_name} ${employee.last_name}`);
                // Backfill the submission ID if it was missing/empty
                if (submissionId && (!employee.docuseal_submission_id || employee.docuseal_submission_id === "")) {
                    await supabaseAdmin
                        .from("employee_directory")
                        .update({ docuseal_submission_id: String(submissionId) })
                        .eq("id", employee.id);
                    console.log(`[DocuSeal Webhook] Backfilled submission_id=${submissionId} for ${employee.email}`);
                }
            }
        }

        if (!employee) {
            console.error(`[DocuSeal Webhook] No matching employee. submissionId=${submissionId}, submitterId=${submitterId}, email=${submitterEmail}`);
            // Return 200 to prevent DocuSeal from retrying endlessly (it retries 4xx/5xx for 48 hours)
            return NextResponse.json({
                received: true,
                matched: false,
                message: "No matching employee found",
            });
        }

        // ── Handle events ──────────────────────────────────────────────────

        if (eventType === "form.completed") {
            const documents = submitterData.documents || [];
            const signedDocUrl = documents[0]?.url || null;
            const auditLogUrl = submitterData.audit_log_url
                || submitterData.submission?.audit_log_url || null;

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
                console.error("[DocuSeal Webhook] DB update error:", updateError);
                return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
            }

            await markContractCompleted(supabaseAdmin, employee.id, signedDocUrl);

            console.log(`[DocuSeal Webhook] Contract SIGNED by ${employee.first_name} ${employee.last_name}${signedDocUrl ? ` — doc: ${signedDocUrl}` : ""}`);

            return NextResponse.json({
                success: true,
                message: `Contract signed by ${employee.first_name} ${employee.last_name}`,
            });
        }

        if (eventType === "form.declined") {
            await supabaseAdmin
                .from("employee_directory")
                .update({ contract_status: "declined" })
                .eq("id", employee.id);

            console.log(`[DocuSeal Webhook] Contract DECLINED by ${employee.first_name} ${employee.last_name}`);

            return NextResponse.json({
                success: true,
                message: `Contract declined by ${employee.first_name} ${employee.last_name}`,
            });
        }

        if (eventType === "form.started" || eventType === "form.viewed") {
            await supabaseAdmin
                .from("employee_directory")
                .update({ contract_status: "opened" })
                .eq("id", employee.id);

            await markContractInProgress(supabaseAdmin, employee.id);

            console.log(`[DocuSeal Webhook] Contract ${eventType.replace("form.", "").toUpperCase()} by ${employee.first_name} ${employee.last_name}`);

            return NextResponse.json({
                success: true,
                message: `Contract ${eventType} by ${employee.first_name} ${employee.last_name}`,
            });
        }

        // Unknown event type — acknowledge to prevent retries
        console.log(`[DocuSeal Webhook] Unhandled event type: ${eventType}`);
        return NextResponse.json({ received: true, event: eventType });
    } catch (error) {
        console.error("[DocuSeal Webhook] Unhandled error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

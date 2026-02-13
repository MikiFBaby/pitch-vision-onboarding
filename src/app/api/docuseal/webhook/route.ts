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
 * Handles two document types:
 *   1. Employment contracts — matched via employee_directory.docuseal_submission_id
 *   2. ID attestations — matched via onboarding_new_hires.attestation_submission_id
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

        // ── Check for attestation first ──────────────────────────────────────
        // Attestation signer is the Payroll Specialist (not the employee),
        // so we must check onboarding_new_hires BEFORE the employee_directory
        // to avoid matching the wrong person via email fallback.
        if (submissionId) {
            const { data: attestationHire } = await supabaseAdmin
                .from("onboarding_new_hires")
                .select("id, first_name, last_name")
                .eq("attestation_submission_id", String(submissionId))
                .maybeSingle();

            if (attestationHire) {
                console.log(`[DocuSeal Webhook] Matched ATTESTATION for ${attestationHire.first_name} ${attestationHire.last_name} (hire=${attestationHire.id})`);
                return handleAttestationEvent(eventType, submitterData, attestationHire);
            }
        }

        // ── Find the employee (contract flow) ───────────────────────────────
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

        // ── Handle contract events ───────────────────────────────────────────

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

// ── Attestation event handler ────────────────────────────────────────────────

async function handleAttestationEvent(
    eventType: string,
    submitterData: any,
    hire: { id: string; first_name: string; last_name: string }
) {
    const hireName = `${hire.first_name} ${hire.last_name}`;

    if (eventType === "form.completed") {
        const documents = submitterData.documents || [];
        const signedDocUrl = documents[0]?.url || null;
        const auditLogUrl = submitterData.audit_log_url
            || submitterData.submission?.audit_log_url || null;

        await supabaseAdmin
            .from("onboarding_new_hires")
            .update({
                attestation_status: "signed",
                attestation_signed_url: signedDocUrl,
                attestation_audit_url: auditLogUrl,
                attestation_signed_at: new Date().toISOString(),
            })
            .eq("id", hire.id);

        console.log(`[DocuSeal Webhook] Attestation SIGNED for ${hireName}${signedDocUrl ? ` — doc: ${signedDocUrl}` : ""}`);

        return NextResponse.json({
            success: true,
            type: "attestation",
            message: `Attestation signed for ${hireName}`,
        });
    }

    if (eventType === "form.declined") {
        await supabaseAdmin
            .from("onboarding_new_hires")
            .update({ attestation_status: "declined" })
            .eq("id", hire.id);

        console.log(`[DocuSeal Webhook] Attestation DECLINED for ${hireName}`);

        return NextResponse.json({
            success: true,
            type: "attestation",
            message: `Attestation declined for ${hireName}`,
        });
    }

    if (eventType === "form.started" || eventType === "form.viewed") {
        await supabaseAdmin
            .from("onboarding_new_hires")
            .update({ attestation_status: "opened" })
            .eq("id", hire.id);

        console.log(`[DocuSeal Webhook] Attestation ${eventType.replace("form.", "").toUpperCase()} for ${hireName}`);

        return NextResponse.json({
            success: true,
            type: "attestation",
            message: `Attestation ${eventType} for ${hireName}`,
        });
    }

    console.log(`[DocuSeal Webhook] Unhandled attestation event: ${eventType}`);
    return NextResponse.json({ received: true, type: "attestation", event: eventType });
}

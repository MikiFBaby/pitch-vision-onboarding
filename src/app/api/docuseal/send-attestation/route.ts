import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateAttestationHtml } from "@/utils/attestation-templates";

const DOCUSEAL_API_URL = process.env.DOCUSEAL_API_URL || "https://api.docuseal.com";
const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY || "";

export async function POST(req: Request) {
    try {
        const { newHireId, employeeName, country } = await req.json();

        if (!newHireId || !employeeName || !country) {
            return NextResponse.json(
                { error: "Missing required fields: newHireId, employeeName, country" },
                { status: 400 }
            );
        }

        if (!DOCUSEAL_API_KEY) {
            console.error("DOCUSEAL_API_KEY is not configured");
            return NextResponse.json(
                { error: "DocuSeal is not configured. Set DOCUSEAL_API_KEY environment variable." },
                { status: 500 }
            );
        }

        // Look up active Payroll Specialist by role
        const { data: payrollSpecialist, error: lookupError } = await supabaseAdmin
            .from("employee_directory")
            .select("first_name, last_name, email, role")
            .ilike("role", "%payroll%")
            .eq("employee_status", "Active")
            .limit(1)
            .maybeSingle();

        if (lookupError) {
            console.error("[send-attestation] Payroll Specialist lookup error:", lookupError);
            return NextResponse.json(
                { error: "Failed to look up Payroll Specialist" },
                { status: 500 }
            );
        }

        if (!payrollSpecialist || !payrollSpecialist.email) {
            return NextResponse.json(
                { error: "No active Payroll Specialist found. Assign the 'Payroll Specialist' role in Employee Directory." },
                { status: 404 }
            );
        }

        // Generate attestation HTML
        const attestationHtml = generateAttestationHtml({ employeeName, country });
        const verifierName = `${payrollSpecialist.first_name} ${payrollSpecialist.last_name}`;
        const verifierTitle = payrollSpecialist.role || "Payroll Specialist";

        const headers = {
            "X-Auth-Token": DOCUSEAL_API_KEY,
            "Content-Type": "application/json"
        };

        // Step 1: Create template from attestation HTML
        const templateLabel = country === "Canada"
            ? "Identification Attestation"
            : "ID Verification Attestation";

        const templateResponse = await fetch(`${DOCUSEAL_API_URL}/templates/html`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                html: attestationHtml,
                name: `${templateLabel} - ${employeeName}`
            })
        });

        if (!templateResponse.ok) {
            const errorText = await templateResponse.text();
            console.error("[send-attestation] Template creation error:", errorText);
            return NextResponse.json(
                { error: "Failed to create attestation template", details: errorText },
                { status: 500 }
            );
        }

        const templateData = await templateResponse.json();
        const templateId = templateData.id;

        // Step 2: Create submission — Payroll Specialist is the signer
        // send_email: false — signing happens inline via embedded form
        const submissionResponse = await fetch(`${DOCUSEAL_API_URL}/submissions`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                template_id: templateId,
                send_email: false,
                submitters: [
                    {
                        role: "Verifier",
                        email: payrollSpecialist.email,
                        fields: [
                            {
                                name: "Verifier Name",
                                default_value: verifierName,
                                readonly: true
                            },
                            {
                                name: "Title",
                                default_value: verifierTitle,
                                readonly: true
                            }
                        ]
                    }
                ]
            })
        });

        if (!submissionResponse.ok) {
            const errorText = await submissionResponse.text();
            console.error("[send-attestation] Submission error:", errorText);
            return NextResponse.json(
                { error: "Failed to send attestation for signing", details: errorText },
                { status: 500 }
            );
        }

        const submissionData = await submissionResponse.json();

        // DocuSeal returns an array of submitters, each with slug + submission_id
        const submitters = Array.isArray(submissionData) ? submissionData : [submissionData];
        const firstSubmitter = submitters[0];
        const submissionId = firstSubmitter?.submission_id || firstSubmitter?.id;
        const signerSlug = firstSubmitter?.slug;

        // Update onboarding_new_hires with attestation tracking
        const { error: updateError } = await supabaseAdmin
            .from("onboarding_new_hires")
            .update({
                attestation_status: "sent",
                attestation_submission_id: String(submissionId),
            })
            .eq("id", newHireId);

        if (updateError) {
            console.error("[send-attestation] DB update error:", updateError);
        }

        console.log(`[send-attestation] Attestation created for ${employeeName} (hire=${newHireId}, submission=${submissionId}, slug=${signerSlug})`);

        return NextResponse.json({
            success: true,
            submissionId,
            slug: signerSlug,
            verifier: verifierName,
            message: `${templateLabel} ready for signing`
        });
    } catch (error) {
        console.error("[send-attestation] Unhandled error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

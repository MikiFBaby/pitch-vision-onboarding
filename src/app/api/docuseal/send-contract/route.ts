import { NextResponse } from "next/server";
import { generateContractHtml } from "@/utils/contract-templates";

const DOCUSEAL_API_URL = process.env.DOCUSEAL_API_URL || "https://api.docuseal.com";
const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY || "";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            firstName,
            lastName,
            email,
            country,
            contractEffectiveDate,
            hourlyWage
        } = body;

        if (!firstName || !lastName || !email || !country || !contractEffectiveDate || !hourlyWage) {
            return NextResponse.json(
                { error: "Missing required fields" },
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

        // Generate the contract HTML based on country
        const contractHtml = generateContractHtml({
            firstName,
            lastName,
            effectiveDate: contractEffectiveDate,
            hourlyWage,
            country
        });

        const headers = {
            "X-Auth-Token": DOCUSEAL_API_KEY,
            "Content-Type": "application/json"
        };

        // Step 1: Create a template from the contract HTML
        const templateResponse = await fetch(`${DOCUSEAL_API_URL}/templates/html`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                html: contractHtml,
                name: `${country} Employment Contract - ${firstName} ${lastName}`
            })
        });

        if (!templateResponse.ok) {
            const errorText = await templateResponse.text();
            console.error("DocuSeal template creation error:", errorText);
            return NextResponse.json(
                { error: "Failed to create contract template", details: errorText },
                { status: 500 }
            );
        }

        const templateData = await templateResponse.json();
        const templateId = templateData.id;

        // Step 2: Create a submission — send_email: false, we send via our own SMTP
        const submissionResponse = await fetch(`${DOCUSEAL_API_URL}/submissions`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                template_id: templateId,
                send_email: false,
                submitters: [
                    {
                        role: "First Party",
                        email: email,
                        fields: [
                            {
                                name: "Employee Name (Printed)",
                                default_value: `${firstName} ${lastName}`,
                                readonly: true
                            }
                        ]
                    }
                ]
            })
        });

        if (!submissionResponse.ok) {
            const errorText = await submissionResponse.text();
            console.error("DocuSeal submission error:", errorText);
            return NextResponse.json(
                { error: "Failed to send contract for signing", details: errorText },
                { status: 500 }
            );
        }

        const submissionData = await submissionResponse.json();

        // Extract submission ID and signing slug
        const submitters = Array.isArray(submissionData) ? submissionData : [submissionData];
        const firstSubmitter = submitters[0];
        const submissionId = firstSubmitter?.submission_id || firstSubmitter?.id;
        const signingSlug = firstSubmitter?.slug;

        console.log(`[send-contract] Contract created for ${firstName} ${lastName} (submission=${submissionId}, slug=${signingSlug})`);

        return NextResponse.json({
            success: true,
            submissionId,
            slug: signingSlug,
            signingUrl: signingSlug ? `https://docuseal.com/s/${signingSlug}` : null,
            message: `${country} contract created for ${email}`
        });
    } catch (error) {
        console.error("Error sending contract:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

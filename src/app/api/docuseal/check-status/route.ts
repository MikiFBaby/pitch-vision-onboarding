import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { markContractCompleted, markContractInProgress } from "@/utils/onboarding-helpers";

const DOCUSEAL_API_URL = process.env.DOCUSEAL_API_URL || "https://api.docuseal.com";
const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY || "";

export async function POST(req: Request) {
    try {
        const { employeeId } = await req.json();

        if (!employeeId) {
            return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
        }

        if (!DOCUSEAL_API_KEY) {
            return NextResponse.json({ error: "DocuSeal not configured" }, { status: 500 });
        }

        // Get the employee's submission ID
        const { data: employee, error: empError } = await supabaseAdmin
            .from("employee_directory")
            .select("id, docuseal_submission_id, contract_status")
            .eq("id", employeeId)
            .single();

        if (empError || !employee) {
            return NextResponse.json({ error: "Employee not found" }, { status: 404 });
        }

        if (!employee.docuseal_submission_id) {
            return NextResponse.json({ error: "No contract submission found" }, { status: 404 });
        }

        // Already signed - no need to check
        if (employee.contract_status === "signed") {
            return NextResponse.json({ status: "signed", alreadyKnown: true });
        }

        // Query DocuSeal API for submission status
        const response = await fetch(
            `${DOCUSEAL_API_URL}/submissions/${employee.docuseal_submission_id}`,
            {
                headers: {
                    "X-Auth-Token": DOCUSEAL_API_KEY,
                    "Content-Type": "application/json"
                }
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error("DocuSeal status check error:", response.status, errorText);
            return NextResponse.json({ error: "Failed to check status", details: errorText }, { status: 500 });
        }

        const submission = await response.json();

        console.log("DocuSeal submission response:", JSON.stringify({
            id: submission.id,
            status: submission.status,
            submitters: (submission.submitters || []).map((s: any) => ({
                id: s.id, status: s.status, email: s.email
            }))
        }));

        // Extract submitter status and documents
        const submitters = submission.submitters || [];
        const firstSubmitter = submitters[0];
        const submitterStatus = firstSubmitter?.status || submission.status;
        const documents = firstSubmitter?.documents || submission.documents || [];
        const signedDocUrl = documents[0]?.url || null;
        const auditLogUrl = submission.audit_log_url
            || firstSubmitter?.audit_log_url || null;

        // Map DocuSeal status to our contract status
        let contractStatus = employee.contract_status;
        if (submitterStatus === "completed") {
            contractStatus = "signed";
        } else if (submitterStatus === "opened" || submitterStatus === "sent") {
            contractStatus = submitterStatus === "opened" ? "opened" : "sent";
        }

        // Update if status changed
        if (contractStatus !== employee.contract_status) {
            const updateData: Record<string, any> = {
                contract_status: contractStatus,
            };

            if (contractStatus === "signed") {
                updateData.signed_contract_url = signedDocUrl;
                updateData.signed_contract_audit_url = auditLogUrl;
                updateData.contract_signed_at = new Date().toISOString();
            }

            await supabaseAdmin
                .from("employee_directory")
                .update(updateData)
                .eq("id", employee.id);

            // Update onboarding checklist progress
            if (contractStatus === "signed") {
                await markContractCompleted(supabaseAdmin, employee.id, signedDocUrl);
            } else if (contractStatus === "opened") {
                await markContractInProgress(supabaseAdmin, employee.id);
            }
        }

        return NextResponse.json({
            status: contractStatus,
            updated: contractStatus !== employee.contract_status,
            signedDocumentUrl: contractStatus === "signed" ? signedDocUrl : null,
        });
    } catch (error) {
        console.error("Contract status check error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

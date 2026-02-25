import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import jsPDF from "jspdf";

const COLORS = {
    primary: [79, 70, 229] as [number, number, number],
    dark: [15, 15, 25] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    muted: [160, 160, 180] as [number, number, number],
    accent: [139, 92, 246] as [number, number, number],
    divider: [50, 50, 70] as [number, number, number],
    sectionBg: [25, 25, 45] as [number, number, number],
    red: [239, 68, 68] as [number, number, number],
    amber: [245, 158, 11] as [number, number, number],
    green: [34, 197, 94] as [number, number, number],
};

interface HWSection {
    title: string;
    priority: string;
    priorityColor: [number, number, number];
    items: { label: string; detail: string; status?: string }[];
    action: string;
}

export async function GET() {
    try {
        // ---------- Gather all data ----------

        // 1. Junk / non-employee records
        const { data: junkRecords } = await supabaseAdmin
            .from("employee_directory")
            .select("id, first_name, last_name, email, slack_display_name")
            .eq("role", "Agent")
            .eq("employee_status", "Active")
            .or(
                `last_name.eq.,last_name.eq. ,first_name.ilike.%pitch%,last_name.ilike.%pitch%,` +
                `first_name.eq.THE,first_name.ilike.missdi%,last_name.eq.Z,last_name.eq.M.`
            );

        // 2. Name corrections needed (decorated names)
        const { data: nameIssues } = await supabaseAdmin
            .from("employee_directory")
            .select("id, first_name, last_name, email, slack_display_name")
            .eq("role", "Agent")
            .eq("employee_status", "Active")
            .or(
                `last_name.ilike.%TransfeR%,last_name.ilike.%Pitch Perfect%,` +
                `last_name.ilike.%(Demi)%,last_name.ilike.%CBFW%`
            );

        // 3. Missing country
        const { data: missingCountry } = await supabaseAdmin
            .from("employee_directory")
            .select("id, first_name, last_name, email")
            .eq("role", "Agent")
            .eq("employee_status", "Active")
            .is("country", null);

        // Also count empty string country
        const { data: emptyCountry } = await supabaseAdmin
            .from("employee_directory")
            .select("id, first_name, last_name, email")
            .eq("role", "Agent")
            .eq("employee_status", "Active")
            .eq("country", "");

        const allMissingCountry = [...(missingCountry || []), ...(emptyCountry || [])];

        // 4. Duplicate names
        const { data: allActive } = await supabaseAdmin
            .from("employee_directory")
            .select("first_name, last_name")
            .eq("role", "Agent")
            .eq("employee_status", "Active");

        const nameCounts: Record<string, number> = {};
        (allActive || []).forEach((e) => {
            const key = `${e.first_name?.trim()}|${e.last_name?.trim()}`;
            nameCounts[key] = (nameCounts[key] || 0) + 1;
        });
        const duplicates = Object.entries(nameCounts)
            .filter(([, c]) => c > 1)
            .map(([name, count]) => {
                const [first, last] = name.split("|");
                return { name: `${first} ${last}`, count };
            });

        // 5. Terminated without date
        const { data: termNoDate } = await supabaseAdmin
            .from("employee_directory")
            .select("id, first_name, last_name, email")
            .eq("employee_status", "Terminated")
            .is("terminated_at", null);

        // 6. Terminated duplicates (Temisahtenten Tc)
        const { data: termDupes } = await supabaseAdmin
            .from("employee_directory")
            .select("id, first_name, last_name, email")
            .eq("employee_status", "Terminated")
            .or("first_name.ilike.temisah%,last_name.eq.Tc");

        // 7. Missing data summary
        const { count: missingEmail } = await supabaseAdmin
            .from("employee_directory")
            .select("id", { count: "exact", head: true })
            .eq("role", "Agent")
            .eq("employee_status", "Active")
            .is("email", null);

        const { count: missingSlack } = await supabaseAdmin
            .from("employee_directory")
            .select("id", { count: "exact", head: true })
            .eq("role", "Agent")
            .eq("employee_status", "Active")
            .is("slack_user_id", null);

        const { count: missingImage } = await supabaseAdmin
            .from("employee_directory")
            .select("id", { count: "exact", head: true })
            .eq("role", "Agent")
            .eq("employee_status", "Active")
            .is("user_image", null);

        const { count: totalActive } = await supabaseAdmin
            .from("employee_directory")
            .select("id", { count: "exact", head: true })
            .eq("role", "Agent")
            .eq("employee_status", "Active");

        const { count: totalTerminated } = await supabaseAdmin
            .from("employee_directory")
            .select("id", { count: "exact", head: true })
            .eq("role", "Agent")
            .eq("employee_status", "Terminated");

        // ---------- Build PDF ----------
        const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 18;
        const contentWidth = pageWidth - margin * 2;

        const newPage = () => {
            doc.addPage();
            doc.setFillColor(...COLORS.dark);
            doc.rect(0, 0, pageWidth, pageHeight, "F");
            return 20;
        };

        const checkPage = (y: number, needed: number) => {
            if (y + needed > pageHeight - 25) return newPage();
            return y;
        };

        // --- Page 1 Background ---
        doc.setFillColor(...COLORS.dark);
        doc.rect(0, 0, pageWidth, pageHeight, "F");

        // --- Header ---
        doc.setFillColor(...COLORS.primary);
        doc.rect(0, 0, pageWidth, 3, "F");

        let y = 22;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.muted);
        doc.text("PITCH PERFECT SOLUTIONS", margin, y);

        y += 12;
        doc.setFontSize(22);
        doc.setTextColor(...COLORS.white);
        doc.text("HR Data Cleanup Homework", margin, y);

        y += 8;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.muted);
        doc.text("Outstanding items to perfect the employee directory", margin, y);

        y += 10;
        doc.setFontSize(9);
        doc.setTextColor(...COLORS.accent);
        const dateStr = new Date().toLocaleDateString("en-US", {
            weekday: "long", month: "long", day: "numeric", year: "numeric",
        });
        doc.text(`Generated: ${dateStr}  |  Active: ${totalActive}  |  Terminated: ${totalTerminated}`, margin, y);

        y += 6;
        doc.setDrawColor(...COLORS.divider);
        doc.setLineWidth(0.3);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;

        // --- Sections ---
        const junkFiltered = (junkRecords || []).filter(
            (r) =>
                !r.last_name?.trim() ||
                r.first_name === "THE" ||
                r.first_name?.toLowerCase().startsWith("missdi") ||
                r.last_name?.includes("Pitch") ||
                r.last_name === "Z" ||
                r.last_name === "M."
        );

        const sections: HWSection[] = [
            {
                title: "JUNK / NON-EMPLOYEE RECORDS",
                priority: "P1 - HIGH",
                priorityColor: COLORS.red,
                action: "Confirm deletion or reclassify role",
                items: junkFiltered.map((r) => ({
                    label: `${r.first_name} ${r.last_name || ""}`.trim(),
                    detail: r.email || "No email",
                    status: !r.last_name?.trim() ? "No last name" :
                        r.first_name === "THE" ? "Fake name" :
                        r.last_name?.includes("Pitch") ? "Company name in field" :
                        r.last_name === "Z" ? "Staff, not agent" :
                        r.last_name === "M." ? "Abbreviated name" :
                        "Username",
                })),
            },
            {
                title: "NAME CORRECTIONS",
                priority: "P2 - MEDIUM",
                priorityColor: COLORS.amber,
                action: "Provide correct legal first + last names",
                items: [
                    ...(nameIssues || []).map((r) => ({
                        label: `${r.first_name} ${r.last_name}`,
                        detail: `Slack: ${r.slack_display_name || "N/A"}`,
                        status: "Decorated name",
                    })),
                    { label: "D Dresha", detail: "d.dresha@yahoo.com", status: "Unknown real name" },
                    { label: "Diamond M.", detail: "missbeautiful2009@gmail.com", status: "Abbreviated last name" },
                    { label: "Mike Lowry", detail: "mrdomond22@yahoo.com", status: "Verify real name" },
                ],
            },
            {
                title: "MISSING COUNTRY (USA/CANADA)",
                priority: "P3 - MEDIUM",
                priorityColor: COLORS.amber,
                action: `Assign country to ${allMissingCountry.length} employees`,
                items: allMissingCountry.slice(0, 25).map((r) => ({
                    label: `${r.first_name} ${r.last_name || ""}`.trim(),
                    detail: r.email || "No email",
                })),
            },
            {
                title: "DUPLICATE NAMES",
                priority: "P4 - LOW",
                priorityColor: COLORS.green,
                action: "Verify if same person or two different people",
                items: duplicates.map((d) => ({
                    label: d.name,
                    detail: `${d.count} records`,
                })),
            },
            {
                title: "TERMINATED WITHOUT DATE",
                priority: "P5 - LOW",
                priorityColor: COLORS.green,
                action: "Add termination date or delete if staff",
                items: (termNoDate || []).map((r) => ({
                    label: `${r.first_name} ${r.last_name}`,
                    detail: r.email || "No email",
                    status: r.email?.includes("pitchperfectsolutions") ? "Company email - staff?" : "",
                })),
            },
            {
                title: "TERMINATED DUPLICATES",
                priority: "P6 - LOW",
                priorityColor: COLORS.green,
                action: "Delete the junk duplicate record",
                items: (termDupes || [])
                    .filter((r) => r.last_name === "Tc")
                    .map((r) => ({
                        label: `${r.first_name} ${r.last_name}`,
                        detail: `${r.email} — duplicate of Tenisah Chambers`,
                    })),
            },
            {
                title: "MISSING DATA SUMMARY",
                priority: "INFO",
                priorityColor: COLORS.muted,
                action: "Track for future onboarding improvements",
                items: [
                    { label: "Missing Email", detail: `${missingEmail || 0} agent(s)` },
                    { label: "Missing Slack ID", detail: `${missingSlack || 0} agent(s)` },
                    { label: "Missing Profile Photo", detail: `${missingImage || 0} agent(s)` },
                    { label: "Missing Phone", detail: `${totalActive || 0} agent(s) (not collected yet)` },
                ],
            },
        ];

        for (const section of sections) {
            // Skip empty sections
            if (section.items.length === 0) continue;

            const sectionHeight = 22 + section.items.length * 7;
            y = checkPage(y, Math.min(sectionHeight, 60));

            // Priority badge
            doc.setFillColor(...section.priorityColor);
            const badgeWidth = doc.setFont("helvetica", "bold").setFontSize(7).getTextWidth(section.priority) + 6;
            doc.roundedRect(margin, y - 3, badgeWidth, 5, 1.5, 1.5, "F");
            doc.setTextColor(...COLORS.dark);
            doc.text(section.priority, margin + 3, y);
            y += 5;

            // Section title
            doc.setFillColor(...COLORS.sectionBg);
            doc.roundedRect(margin, y - 3, contentWidth, 9, 2, 2, "F");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(...COLORS.accent);
            doc.text(section.title, margin + 4, y + 3);

            // Item count
            const countText = `${section.items.length} item(s)`;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(...COLORS.muted);
            doc.text(countText, pageWidth - margin - 4 - doc.getTextWidth(countText), y + 3);
            y += 12;

            // Action line
            doc.setFont("helvetica", "italic");
            doc.setFontSize(8);
            doc.setTextColor(...COLORS.accent);
            doc.text(`Action: ${section.action}`, margin + 4, y);
            y += 6;

            // Items
            for (let i = 0; i < section.items.length; i++) {
                y = checkPage(y, 8);
                const item = section.items[i];

                if (i % 2 === 0) {
                    doc.setFillColor(30, 30, 50);
                    doc.rect(margin, y - 4, contentWidth, 7, "F");
                }

                // Label
                doc.setFont("helvetica", "normal");
                doc.setFontSize(8);
                doc.setTextColor(...COLORS.white);
                const labelText = item.label.length > 35 ? item.label.substring(0, 35) + "..." : item.label;
                doc.text(labelText, margin + 4, y);

                // Detail
                doc.setTextColor(...COLORS.muted);
                doc.setFontSize(7);
                const detailText = item.detail.length > 35 ? item.detail.substring(0, 35) + "..." : item.detail;
                doc.text(detailText, margin + 70, y);

                // Status badge
                if (item.status) {
                    doc.setFontSize(6);
                    doc.setTextColor(...COLORS.amber);
                    doc.text(item.status, pageWidth - margin - 4 - doc.getTextWidth(item.status), y);
                }

                y += 7;
            }

            // Show "... and X more" if truncated
            if (section.title === "MISSING COUNTRY (USA/CANADA)" && allMissingCountry.length > 25) {
                y = checkPage(y, 8);
                doc.setFont("helvetica", "italic");
                doc.setFontSize(8);
                doc.setTextColor(...COLORS.muted);
                doc.text(`... and ${allMissingCountry.length - 25} more employees`, margin + 4, y);
                y += 7;
            }

            y += 6;
        }

        // --- Already Fixed Section ---
        y = checkPage(y, 50);
        doc.setFillColor(20, 60, 30);
        doc.roundedRect(margin, y - 3, contentWidth, 9, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.green);
        doc.text("ALREADY FIXED TODAY", margin + 4, y + 3);
        y += 12;

        const fixed = [
            "Deleted 'octobersown1889' junk record",
            "Fixed Brian Shin -> Brian Chiun Shin",
            "Fixed Ester Cridlin -> Ester Rebecca Cridlin",
            "Fixed Anthony Roberts Jenkins -> Anthony DeVaughn Roberts Jenkins",
            "Created Megan Morales entry (was missing from directory)",
            "Auto-populated country for 12 employees from HR Hired data",
            "Confirmed Ahmed Mohammad termination (Quit per HR Fired)",
            "Confirmed 7 Slack-terminated agents (removed from channel)",
        ];

        for (let i = 0; i < fixed.length; i++) {
            y = checkPage(y, 8);
            if (i % 2 === 0) {
                doc.setFillColor(30, 30, 50);
                doc.rect(margin, y - 4, contentWidth, 7, "F");
            }
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(...COLORS.green);
            doc.text("  [done]", margin + 4, y);
            doc.setTextColor(...COLORS.white);
            doc.text(fixed[i], margin + 20, y);
            y += 7;
        }

        // --- Footer on last page ---
        const footerY = pageHeight - 12;
        doc.setDrawColor(...COLORS.divider);
        doc.setLineWidth(0.2);
        doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...COLORS.muted);
        doc.text("Pitch Perfect Solutions - Confidential", margin, footerY);
        doc.text("HR Data Audit Report", pageWidth - margin - doc.getTextWidth("HR Data Audit Report"), footerY);

        // --- Output ---
        const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
        const filename = `hr_homework_report_${new Date().toISOString().split("T")[0]}.pdf`;

        return new NextResponse(pdfBuffer, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
        });
    } catch (error) {
        console.error("Homework PDF generation error:", error);
        return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
    }
}

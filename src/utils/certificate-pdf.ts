import jsPDF from 'jspdf';
import { GREAT_VIBES_BASE64 } from './greatvibes-font';

interface CertificateConfig {
    agentName: string;
    completionDate: string;
}

/**
 * Generates a certificate PDF using the Canva-designed template as background
 * with dynamic agent name (cursive font), description, and date overlaid.
 * Must be called with the template image data (fetched client-side).
 */
export function generateCertificatePDF(config: CertificateConfig, templateImageData?: string): jsPDF {
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();  // 297mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
    const centerX = pageWidth / 2;

    // Register Great Vibes cursive font
    doc.addFileToVFS('GreatVibes-Regular.ttf', GREAT_VIBES_BASE64);
    doc.addFont('GreatVibes-Regular.ttf', 'GreatVibes', 'normal');

    // --- Background template ---
    if (templateImageData) {
        doc.addImage(templateImageData, 'PNG', 0, 0, pageWidth, pageHeight);
    } else {
        // Fallback: solid dark background if template not loaded
        doc.setFillColor(12, 12, 20);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
    }

    // --- Agent Name (cursive, light purple) ---
    // Positioned in the blank area below "THIS CERTIFICATE IS PROUDLY PRESENTED TO"
    const nameY = 95;
    doc.setFont('GreatVibes', 'normal');
    doc.setFontSize(48);
    doc.setTextColor(180, 160, 255); // Light purple to match Canva style
    doc.text(config.agentName, centerX, nameY, { align: 'center' });

    // --- Underline below name ---
    const nameWidth = doc.getTextWidth(config.agentName);
    const lineHalfWidth = Math.min(nameWidth / 2 + 10, 90);
    doc.setDrawColor(180, 160, 255);
    doc.setLineWidth(0.4);
    doc.line(centerX - lineHalfWidth, nameY + 4, centerX + lineHalfWidth, nameY + 4);

    // --- Description text ---
    const descY = 112;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(220, 220, 230);
    doc.text(
        `This certificate is awarded to ${config.agentName} for successfully completing`,
        centerX, descY, { align: 'center' }
    );
    doc.text(
        'all chapters of the Pitch Perfect Solutions Agent Training Academy,',
        centerX, descY + 6, { align: 'center' }
    );
    doc.text(
        'demonstrating proficiency with a passing score of 80% or higher on all assessments.',
        centerX, descY + 12, { align: 'center' }
    );

    // --- Completion Date (on the line baked into template, above "date of completion") ---
    const dateY = 140;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(180, 160, 255);
    doc.text(config.completionDate, centerX, dateY, { align: 'center' });

    return doc;
}

function generateCertId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = 'PPS-';
    for (let i = 0; i < 8; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

/**
 * Fetches the certificate template image and generates + downloads the PDF.
 * Used client-side from the education page.
 */
export async function downloadCertificate(agentName: string, completionDate: string): Promise<void> {
    // Fetch the Canva template image
    let templateData: string | undefined;
    try {
        const resp = await fetch('/certificate-template.png');
        const blob = await resp.blob();
        templateData = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        console.warn('[Certificate] Could not load template image, using fallback:', err);
    }

    const doc = generateCertificatePDF({ agentName, completionDate }, templateData);
    const filename = `training_certificate_${agentName.replace(/\s+/g, '_').toLowerCase()}.pdf`;
    doc.save(filename);
}

export function getCertificateBase64(agentName: string, completionDate: string): string {
    const doc = generateCertificatePDF({ agentName, completionDate });
    return doc.output('datauristring').split(',')[1];
}


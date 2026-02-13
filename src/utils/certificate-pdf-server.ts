import 'server-only';
import { readFileSync } from 'fs';
import { join } from 'path';
import { generateCertificatePDF } from './certificate-pdf';

/**
 * Server-side: generates certificate PDF as a Buffer.
 * Loads template from filesystem (public/certificate-template.png).
 */
export async function generateCertificateBuffer(agentName: string, completionDate: string): Promise<Buffer> {
    let templateData: string | undefined;
    try {
        const templatePath = join(process.cwd(), 'public', 'certificate-template.png');
        const buffer = readFileSync(templatePath);
        templateData = `data:image/png;base64,${buffer.toString('base64')}`;
    } catch (err) {
        console.warn('[Certificate] Could not load template image on server:', err);
    }

    const doc = generateCertificatePDF({ agentName, completionDate }, templateData);
    return Buffer.from(doc.output('arraybuffer'));
}

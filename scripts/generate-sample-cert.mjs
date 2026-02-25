import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { jsPDF } from 'jspdf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

// Load the template image as base64 data URL
const templateBuffer = readFileSync(join(root, 'public/certificate-template.png'));
const templateBase64 = `data:image/png;base64,${templateBuffer.toString('base64')}`;

// Load the Great Vibes font as base64
const fontBuffer = readFileSync(join(root, 'public/fonts/GreatVibes-Regular.ttf'));
const fontBase64 = fontBuffer.toString('base64');

// Create the PDF
const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
});

const pageWidth = doc.internal.pageSize.getWidth();  // 297mm
const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
const centerX = pageWidth / 2;

// Register Great Vibes cursive font
doc.addFileToVFS('GreatVibes-Regular.ttf', fontBase64);
doc.addFont('GreatVibes-Regular.ttf', 'GreatVibes', 'normal');

// Add template as background
doc.addImage(templateBase64, 'PNG', 0, 0, pageWidth, pageHeight);

// --- Agent Name (cursive, light purple) ---
const nameY = 95;
doc.setFont('GreatVibes', 'normal');
doc.setFontSize(48);
doc.setTextColor(180, 160, 255);
doc.text('John Smith', centerX, nameY, { align: 'center' });

// --- Underline below name ---
const nameWidth = doc.getTextWidth('John Smith');
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
    'This certificate is awarded to John Smith for successfully completing',
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

// --- Completion Date (on the line, above "date of completion" baked into template) ---
const dateY = 140;
doc.setFont('helvetica', 'bold');
doc.setFontSize(12);
doc.setTextColor(180, 160, 255);
doc.text('February 9, 2026', centerX, dateY, { align: 'center' });

// Save
const outputPath = join(root, 'public/sample_certificate.pdf');
const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
writeFileSync(outputPath, pdfBuffer);

console.log(`Sample certificate generated at: ${outputPath}`);
console.log(`File size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

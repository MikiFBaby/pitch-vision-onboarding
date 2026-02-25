import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { jsPDF } from 'jspdf';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

// Load env
dotenv.config({ path: join(root, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Miki Furman (Agent) employee_directory ID
const EMPLOYEE_ID = '1fa3dd17-1ae0-42f6-b38e-c883d268c04a';
const AGENT_NAME = 'Miki Furman';
const COMPLETION_DATE = 'February 9, 2026';

// Load template and font
const templateBuffer = readFileSync(join(root, 'public/certificate-template.png'));
const templateBase64 = `data:image/png;base64,${templateBuffer.toString('base64')}`;
const fontBuffer = readFileSync(join(root, 'public/fonts/GreatVibes-Regular.ttf'));
const fontBase64 = fontBuffer.toString('base64');

// Generate PDF
const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
const pageWidth = doc.internal.pageSize.getWidth();
const pageHeight = doc.internal.pageSize.getHeight();
const centerX = pageWidth / 2;

doc.addFileToVFS('GreatVibes-Regular.ttf', fontBase64);
doc.addFont('GreatVibes-Regular.ttf', 'GreatVibes', 'normal');
doc.addImage(templateBase64, 'PNG', 0, 0, pageWidth, pageHeight);

// Agent Name
const nameY = 95;
doc.setFont('GreatVibes', 'normal');
doc.setFontSize(48);
doc.setTextColor(180, 160, 255);
doc.text(AGENT_NAME, centerX, nameY, { align: 'center' });

// Underline
const nameWidth = doc.getTextWidth(AGENT_NAME);
const lineHalfWidth = Math.min(nameWidth / 2 + 10, 90);
doc.setDrawColor(180, 160, 255);
doc.setLineWidth(0.4);
doc.line(centerX - lineHalfWidth, nameY + 4, centerX + lineHalfWidth, nameY + 4);

// Description
const descY = 112;
doc.setFont('helvetica', 'normal');
doc.setFontSize(11);
doc.setTextColor(220, 220, 230);
doc.text(`This certificate is awarded to ${AGENT_NAME} for successfully completing`, centerX, descY, { align: 'center' });
doc.text('all chapters of the Pitch Perfect Solutions Agent Training Academy,', centerX, descY + 6, { align: 'center' });
doc.text('demonstrating proficiency with a passing score of 80% or higher on all assessments.', centerX, descY + 12, { align: 'center' });

// Date
const dateY = 140;
doc.setFont('helvetica', 'bold');
doc.setFontSize(12);
doc.setTextColor(180, 160, 255);
doc.text(COMPLETION_DATE, centerX, dateY, { align: 'center' });

// Convert to buffer
const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
const fileName = `Training_Certificate_${AGENT_NAME.replace(/\s+/g, '_')}.pdf`;
const storagePath = `${EMPLOYEE_ID}/${fileName}`;

console.log(`PDF generated: ${fileName} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);

// Upload to Supabase Storage
console.log('Uploading to Supabase Storage...');
const { data: uploadData, error: uploadError } = await supabase.storage
    .from('employee_documents')
    .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
    });

if (uploadError) {
    console.error('Upload error:', uploadError);
    process.exit(1);
}
console.log('Uploaded successfully:', storagePath);

// Get current documents
const { data: emp } = await supabase
    .from('employee_directory')
    .select('documents')
    .eq('id', EMPLOYEE_ID)
    .maybeSingle();

const existingDocs = Array.isArray(emp?.documents) ? emp.documents : [];

// Add certificate document
const completionISO = new Date().toISOString();
const certDoc = {
    name: fileName,
    path: storagePath,
    type: 'application/pdf',
    size: pdfBuffer.length,
    uploaded_at: completionISO,
};

const { error: updateError } = await supabase
    .from('employee_directory')
    .update({
        training_completed_at: completionISO,
        documents: [...existingDocs, certDoc],
    })
    .eq('id', EMPLOYEE_ID);

if (updateError) {
    console.error('Update error:', updateError);
    process.exit(1);
}

console.log('Employee directory updated!');
console.log(`  training_completed_at: ${completionISO}`);
console.log(`  Document added: ${fileName}`);
console.log(`  Storage path: ${storagePath}`);
console.log('\nDone! Check Miki Furman (Agent) profile in the HR directory.');

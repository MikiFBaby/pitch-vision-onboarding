import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const fileRequestUrl = process.env.DECISIONHR_FILE_REQUEST_URL;

/**
 * POST /api/hr/decisionhr/retry-upload
 *
 * Retry a failed OneDrive upload for a previously generated DecisionHR submission.
 *
 * Body: { submissionId: string }
 */
export async function POST(req: NextRequest) {
  try {
    if (!fileRequestUrl) {
      return NextResponse.json(
        { error: 'DECISIONHR_FILE_REQUEST_URL not configured' },
        { status: 400 }
      );
    }

    const { submissionId } = await req.json();
    if (!submissionId) {
      return NextResponse.json({ error: 'submissionId required' }, { status: 400 });
    }

    // Fetch submission
    const { data: submission, error: fetchError } = await supabaseAdmin
      .from('decisionhr_submissions')
      .select('id, file_storage_path, employee_id')
      .eq('id', submissionId)
      .maybeSingle();

    if (fetchError || !submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // Download file from Supabase Storage
    const { data: fileData, error: dlError } = await supabaseAdmin.storage
      .from('employee_documents')
      .download(submission.file_storage_path);

    if (dlError || !fileData) {
      return NextResponse.json({ error: 'File not found in storage' }, { status: 404 });
    }

    // Re-attempt OneDrive upload
    const fileName = submission.file_storage_path.split('/').pop() || 'DecisionHR.xlsx';
    const formData = new FormData();
    formData.append('file', fileData, fileName);

    const uploadResponse = await fetch(fileRequestUrl, {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text().catch(() => 'Unknown error');
      await supabaseAdmin
        .from('decisionhr_submissions')
        .update({
          sharepoint_status: 'failed',
          sharepoint_error: `Retry failed: HTTP ${uploadResponse.status}: ${errText}`,
        })
        .eq('id', submissionId);

      return NextResponse.json(
        { error: 'Upload failed', detail: errText },
        { status: 502 }
      );
    }

    // Update submission record
    await supabaseAdmin
      .from('decisionhr_submissions')
      .update({
        sharepoint_status: 'uploaded',
        sharepoint_error: null,
      })
      .eq('id', submissionId);

    return NextResponse.json({ success: true, sharepointStatus: 'uploaded' });
  } catch (err) {
    console.error('[DecisionHR] Retry upload error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

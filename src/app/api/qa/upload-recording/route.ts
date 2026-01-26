import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Supabase admin client for storage operations
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const N8N_WEBHOOK_URL = 'https://n8n.pitchvision.io/webhook/qa-upload';

// Allow longer execution for large audio files
export const maxDuration = 120;
export const dynamic = 'force-dynamic';
// Disable static optimization to ensure request is available
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    try {
        console.log('=== QA Upload Recording API ===');
        const contentType = request.headers.get('content-type') || '';
        const contentLength = request.headers.get('content-length');
        console.log('Content-Type:', contentType);
        console.log('Content-Length:', contentLength);

        // Verify we have multipart form data
        if (!contentType.includes('multipart/form-data')) {
            console.error('Invalid Content-Type:', contentType);
            return NextResponse.json(
                {
                    success: false,
                    error: 'Invalid Content-Type. Expected multipart/form-data',
                    received: contentType
                },
                { status: 400 }
            );
        }

        // Parse the form data with error handling
        let formData: FormData;
        try {
            formData = await request.formData();
        } catch (formError: any) {
            console.error('FormData parsing error:', formError.message);

            return NextResponse.json(
                {
                    success: false,
                    error: `Failed to parse body as FormData.`,
                    details: formError.message,
                    contentType: contentType,
                    contentLength: contentLength
                },
                { status: 400 }
            );
        }

        const file = formData.get('data') as File;  // 'data' matches frontend field name
        const uploadSource = formData.get('upload_source') as string || 'manual';
        const agentName = formData.get('agent_name') as string || '';

        console.log('Received file:', file?.name, 'Size:', file?.size, 'Type:', file?.type);
        console.log('Upload source:', uploadSource);

        if (!file) {
            console.error('No file received in form data');
            return NextResponse.json(
                { success: false, error: "No file provided" },
                { status: 400 }
            );
        }

        if (file.size < 1000) {
            console.error('File too small - likely empty:', file.size);
            return NextResponse.json(
                { success: false, error: "File appears to be empty" },
                { status: 400 }
            );
        }

        // Generate batch ID and file path
        const batchId = `batch_${Date.now()}`;
        const ext = file.name.split('.').pop() || 'wav';
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `qa-recordings/${batchId}/${sanitizedName}`;

        console.log('Batch ID:', batchId);
        console.log('Storage path:', storagePath);

        // Convert file to buffer for Supabase upload
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log('Buffer size:', buffer.length, 'bytes');

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('recordings')
            .upload(storagePath, buffer, {
                contentType: file.type || 'audio/wav',
                upsert: false
            });

        if (uploadError) {
            console.error('Supabase Storage upload error:', uploadError);
            return NextResponse.json(
                { success: false, error: `Storage upload failed: ${uploadError.message}` },
                { status: 500 }
            );
        }

        console.log('Upload successful:', uploadData);

        // Get public URL for the uploaded file
        const { data: urlData } = supabaseAdmin.storage
            .from('recordings')
            .getPublicUrl(storagePath);

        const fileUrl = urlData.publicUrl;
        console.log('Public URL:', fileUrl);

        // Now trigger n8n with the URL (not binary data)
        const n8nPayload = {
            file_url: fileUrl,
            file_name: file.name,
            batch_id: batchId,
            upload_source: uploadSource,
            agent_name: agentName,
            file_size: file.size,
            mime_type: file.type
        };

        console.log('Calling n8n webhook with payload:', n8nPayload);

        const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(n8nPayload),
        });

        const n8nData = await n8nResponse.json();
        console.log('n8n response:', n8nData);

        if (!n8nResponse.ok) {
            console.error('n8n webhook failed:', n8nData);
            return NextResponse.json(
                {
                    success: false,
                    error: 'Workflow trigger failed',
                    file_url: fileUrl,  // Still return URL so file isn't lost
                    batch_id: batchId
                },
                { status: 500 }
            );
        }

        // Return success with batch_id for progress tracking
        return NextResponse.json({
            success: true,
            batch_id: n8nData.batch_id || batchId,
            job_id: n8nData.job_id,
            file_url: fileUrl,
            status: 'processing'
        });

    } catch (error: any) {
        console.error("Upload recording error:", error);
        return NextResponse.json(
            { success: false, error: error.message || "Failed to upload recording" },
            { status: 500 }
        );
    }
}

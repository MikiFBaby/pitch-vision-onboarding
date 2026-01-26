import { NextRequest, NextResponse } from 'next/server';

const WEBHOOK_URL = 'https://n8n.pitchvision.io/webhook/qa-upload';

// App Router config for large audio files
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        console.log('=== N8N PROXY API (Streaming) ===');
        console.log('Forwarding request to:', WEBHOOK_URL);

        // Get the content-type header (includes boundary for multipart)
        const contentType = req.headers.get('content-type');
        console.log('Content-Type:', contentType);

        // Get the raw body as ArrayBuffer and convert to Buffer
        const bodyArrayBuffer = await req.arrayBuffer();
        const bodyBuffer = Buffer.from(bodyArrayBuffer);
        console.log('Body size:', bodyBuffer.length, 'bytes');

        if (bodyBuffer.length < 1000) {
            console.error('WARNING: Body seems too small for an audio file!');
        }

        // Forward the raw body to n8n, preserving the exact multipart format
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': contentType || 'application/octet-stream',
                'Content-Length': bodyBuffer.length.toString(),
            },
            body: bodyBuffer,
        });

        console.log('N8N Response Status:', response.status);

        // Read response
        let responseData;
        const responseContentType = response.headers.get('content-type') || '';

        if (responseContentType.includes('application/json')) {
            responseData = await response.json();
            console.log('N8N Response (JSON):', responseData);
        } else {
            responseData = await response.text();
            console.log('N8N Response (Text):', responseData.substring(0, 500));
        }

        // Return response to client
        return NextResponse.json({
            success: true,
            status: response.status,
            data: responseData
        });

    } catch (error: any) {
        console.error('N8N Proxy Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

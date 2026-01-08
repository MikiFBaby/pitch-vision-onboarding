import { NextRequest, NextResponse } from 'next/server';

const WEBHOOK_URL = 'https://sailient.app.n8n.cloud/webhook/UIDrop';

export async function POST(req: NextRequest) {
    try {
        // Get the form data from the client
        const formData = await req.formData();

        console.log('=== N8N PROXY API ===');
        console.log('Forwarding request to:', WEBHOOK_URL);

        // Forward to n8n webhook
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            body: formData,
            // No mode: 'no-cors' on server side - we can read the response
        });

        console.log('N8N Response Status:', response.status);
        console.log('N8N Response Headers:', Object.fromEntries(response.headers.entries()));

        // Try to read response body
        let responseData;
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            responseData = await response.json();
            console.log('N8N Response (JSON):', responseData);
        } else {
            responseData = await response.text();
            console.log('N8N Response (Text):', responseData.substring(0, 500));
        }

        // Return success with any data n8n provided
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

// Increase body size limit for large audio files
// export const config = {
//     api: {
//         bodyParser: false,
//         responseLimit: false,
//     },
// };

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: NextRequest) {
    try {
        const { prompt, context } = await request.json();

        if (!prompt) {
            return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('GEMINI_API_KEY not configured');
            return NextResponse.json(
                { error: 'AI service not configured' },
                { status: 500 }
            );
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const systemPrompt = `
You are an expert QA and Compliance Coach for a call center using the "Pitch Vision" system.

${context ? `CALL DETAILS:
Call ID: ${context.callId || 'N/A'}
Date: ${context.callDate || 'N/A'}
Duration: ${context.duration || 'N/A'}
Phone: ${context.phoneNumber ? context.phoneNumber.replace(/(\d{3})(\d{3})(\d{4})/, '$1-***-$3') : 'N/A'}

Agent: ${context.agentName || 'Unknown'}
Campaign: ${context.campaignType || 'Unknown'}
Compliance Score: ${context.complianceScore || 'N/A'}%
Risk Level: ${context.riskLevel || 'Unknown'}
QA Reviewer: ${context.reviewerName || 'QA Reviewer'}

TRANSCRIPT:
${context.transcript || 'No transcript available'}` : ''}

USER QUESTION: "${prompt}"

INSTRUCTIONS FOR FORMATTING:
1. Use "###" for Section Headers (e.g. ### Analysis).
2. Use "-" for bullet points.
3. Use "**text**" for bold emphasis.
4. Keep responses concise but actionable.
5. If drafting an email, use proper email format with subject line.
6. Focus on compliance improvement and coaching opportunities.
7. IMPORTANT: When signing off emails, format the signature as:
   "${context?.reviewerName || 'QA Reviewer'}"
   "${context?.reviewerRole || 'QA Compliance Coach'}"
   Do NOT use "[Your Name]" or generic placeholders.
8. Reference the SPECIFIC call by including the date (${context?.callDate || 'the call'}) in your response when applicable.
`;

        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        const text = response.text();

        return NextResponse.json({ response: text });
    } catch (error: any) {
        console.error('AI Coach Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to generate response' },
            { status: 500 }
        );
    }
}

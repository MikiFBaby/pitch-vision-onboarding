import { NextRequest, NextResponse } from "next/server";

// This endpoint generates a signed URL for secure ElevenLabs agent connection
// It also handles the custom LLM proxy setup pointing to our Gemini backend

export async function GET(request: NextRequest) {
    try {
        const apiKey = process.env.ELEVENLABS_API_KEY;

        if (!apiKey) {
            return NextResponse.json(
                { success: false, error: "ElevenLabs API key not configured" },
                { status: 500 }
            );
        }

        // Get the agent ID from the ElevenLabs dashboard
        // For now, we'll create an agent dynamically or use a pre-configured one
        const agentId = process.env.ELEVENLABS_AGENT_ID;

        // Generate a signed URL for the conversation
        // This is the recommended secure approach rather than exposing the API key client-side
        const response = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
            {
                method: "GET",
                headers: {
                    "xi-api-key": apiKey,
                },
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error("ElevenLabs API error:", error);
            return NextResponse.json(
                { success: false, error: "Failed to generate signed URL" },
                { status: response.status }
            );
        }

        const data = await response.json();

        return NextResponse.json({
            success: true,
            signedUrl: data.signed_url,
        });
    } catch (error: any) {
        console.error("Aura voice error:", error);
        return NextResponse.json(
            { success: false, error: error.message || "Failed to initialize voice session" },
            { status: 500 }
        );
    }
}

// POST endpoint to handle audio transcription for the custom LLM integration
// ElevenLabs will send transcribed speech here, we process with Gemini, and return response
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { messages, model, stream = true } = body;

        // Forward to our existing Aura chat API for processing
        const baseUrl = process.env.APP_URL || "http://localhost:3000";

        // Extract the latest user message
        const userMessage = messages.find((m: any) => m.role === "user")?.content || "";

        // Get QA context for Aura
        const qaContext = body.extra_body?.qa_context || "";
        const userName = body.extra_body?.user_name || "there";
        const history = messages.slice(0, -1).map((m: any) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content
        }));

        // Call our existing Aura chat endpoint
        const auraResponse = await fetch(`${baseUrl}/api/qa/aura-chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: userMessage,
                qaContext,
                userName,
                history
            })
        });

        const auraData = await auraResponse.json();

        if (!auraData.success) {
            throw new Error(auraData.error || "Aura chat failed");
        }

        // Format response in OpenAI-compatible format for ElevenLabs
        if (stream) {
            // Stream the response back in SSE format
            const encoder = new TextEncoder();
            const responseStream = new ReadableStream({
                start(controller) {
                    // Send the response as a streamed chunk
                    const chunk = {
                        id: `chatcmpl-${Date.now()}`,
                        object: "chat.completion.chunk",
                        created: Math.floor(Date.now() / 1000),
                        model: "aura-gemini",
                        choices: [{
                            index: 0,
                            delta: { content: auraData.response },
                            finish_reason: null
                        }]
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));

                    // Send done marker
                    const doneChunk = {
                        id: `chatcmpl-${Date.now()}`,
                        object: "chat.completion.chunk",
                        created: Math.floor(Date.now() / 1000),
                        model: "aura-gemini",
                        choices: [{
                            index: 0,
                            delta: {},
                            finish_reason: "stop"
                        }]
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneChunk)}\n\n`));
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    controller.close();
                }
            });

            return new Response(responseStream, {
                headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                }
            });
        } else {
            // Non-streaming response
            return NextResponse.json({
                id: `chatcmpl-${Date.now()}`,
                object: "chat.completion",
                created: Math.floor(Date.now() / 1000),
                model: "aura-gemini",
                choices: [{
                    index: 0,
                    message: {
                        role: "assistant",
                        content: auraData.response
                    },
                    finish_reason: "stop"
                }],
                usage: {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0
                }
            });
        }
    } catch (error: any) {
        console.error("Custom LLM proxy error:", error);
        return NextResponse.json(
            { error: { message: error.message || "Internal error" } },
            { status: 500 }
        );
    }
}

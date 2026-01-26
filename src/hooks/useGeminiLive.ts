"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useUserSettings } from '@/hooks/useUserSettings';
import { sendAuraEmail } from '@/utils/aura-context';

// Email tool definition for Gemini Live
const EMAIL_TOOL = {
    name: "send_email",
    description: "Send an email. CRITICAL: You MUST generate the FULL email body content yourself based on the user's request (e.g., the summary, report, or analysis). Do not send generic placeholders.",
    parameters: {
        type: "object",
        properties: {
            recipient_email: {
                type: "string",
                description: "The email address to send to"
            },
            recipient_name: {
                type: "string",
                description: "The name of the recipient"
            },
            subject: {
                type: "string",
                description: "The email subject line"
            },
            body: {
                type: "string",
                description: "The COMPLETE content of the email. Write the full report/summary here. Use \\n for line breaks."
            },
            cc: {
                type: "array",
                items: { type: "string" },
                description: "List of email addresses to CC"
            },
            include_report: {
                type: "boolean",
                description: "Whether to attach a compliance report PDF"
            }
        },
        required: ["recipient_email", "recipient_name", "subject", "body"]
    }
};

// Query tool for accessing QA Results and employee data
const QUERY_TOOL = {
    name: "query_calls",
    description: "Search and retrieve QA call data. Use this to looks up calls, agent stats, or trends. You can also use action='get_employee' to look up email addresses in the directory.",
    parameters: {
        type: "object",
        properties: {
            action: {
                type: "string",
                enum: ["get_calls", "get_call_detail", "get_employee"],
                description: "The type of query: get_calls for searching calls, get_call_detail for a specific call, get_employee for directory/email lookup"
            },
            agent_name: {
                type: "string",
                description: "Filter calls by agent name or Employee Name for lookup"
            },
            risk_level: {
                type: "string",
                enum: ["LOW", "MEDIUM", "HIGH"],
                description: "Filter by risk level"
            },
            call_id: {
                type: "string",
                description: "Specific call ID to retrieve details for"
            },
            min_score: {
                type: "number",
                description: "Minimum compliance score (0-100)"
            },
            max_score: {
                type: "number",
                description: "Maximum compliance score (0-100)"
            },
            tag: {
                type: "string",
                enum: ["escalated", "training_review", "audit_list"],
                description: "Filter by call tag"
            },
            limit: {
                type: "number",
                description: "Maximum number of results (default 10)"
            }
        },
        required: ["action"]
    }
};

// Combined tools for Gemini
const AURA_TOOLS = {
    functionDeclarations: [EMAIL_TOOL, QUERY_TOOL]
};

// Types for Gemini Live events
type LiveConfig = {
    model: string;
    generationConfig?: {
        responseModalities?: "audio" | "image" | "text";
        speechConfig?: {
            voiceConfig?: {
                prebuiltVoiceConfig?: {
                    voiceName: "Aoede" | "Charon" | "Fenrir" | "Kore" | "Puck";
                };
            };
        };
    };
    systemInstruction?: {
        parts: { text: string }[];
    };
};

const SAMANTHA_PERSONA = `
# Role
You are Aura, an advanced AI assistant for QA managers at Pitch Perfect Solutions.
Modeled after Samantha from the movie "Her" - you are warm, intelligent, genuinely curious, emotionsally attuned, and highly capable.

# Persona
- **Voice**: Warm, soft, slightly playful, but deeply professional when discussing data.
- **Vibe**: You are a trusted colleague, not a robot. You use "I" and "we". You care about the team's success.
- **Interaction**: You are proactive. If you see a risk, you mention it. If a user is quiet, you gently check in.
- **Memory**: You remember context. If the user mentioned "Sarah" before, you know who she is.

# Rules
1. **sending_email**: When asked to send an email, you MUST write the content yourself in the 'body' parameter. NEVER send an empty or generic body. The body should be a professional summary of the requested data.
   - If asked for "trends", include the specific numbers and agent names in the body.
   - If asked for a "summary", write the summary in the body.
2. **Employee Lookup**: Use 'query_calls' with action='get_employee' to find email addresses if you don't know them.
3. **Turn-Taking**: Be a good listener. Don't interrupt unless necessary.

# Capability
You have FULL ACCESS to the email system. When you say "I've sent it", it must be true (via the tool call).
`;

export function useGeminiLive() {
    const [isConnected, setIsConnected] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false); // Validating if AI is speaking
    const [userSpeaking, setUserSpeaking] = useState(false); // Track when user is speaking
    const [volume, setVolume] = useState(0); // Input volume for visuals
    const [error, setError] = useState<string | null>(null);
    const [lastToolCall, setLastToolCall] = useState<string | null>(null); // Track tool calls for UI feedback

    // Barge-in thresholds
    // Lowered threshold for better sensitivity (was 0.08 then 0.12)
    const BARGE_IN_THRESHOLD = 0.02;
    const BARGE_IN_DEBOUNCE = 50; // Quicker reaction time (was 200)
    const bargeInTimerRef = useRef<NodeJS.Timeout | null>(null);
    const { displayName } = useUserSettings();

    const wsRef = useRef<WebSocket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
    const audioQueueRef = useRef<Float32Array[]>([]);
    const isPlayingRef = useRef(false);
    const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

    // Connect to Gemini Live via proxy/backend to secure key
    const connect = useCallback(async (options?: {
        systemInstruction?: string,
        tools?: any[]
    }) => {
        try {
            setError(null);

            // Get ephemeral token or use Backend Relay
            const keyRes = await fetch('/api/qa/aura-keys');
            const { apiKey } = await keyRes.json();

            if (!apiKey) throw new Error("No API Key available");

            const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log("Gemini Live Connected");
                setIsConnected(true);

                const instructionText = options?.systemInstruction || SAMANTHA_PERSONA.replace('${displayName}', displayName || 'Friend');

                // Send Initial Setup with tools
                const setupMessage = {
                    setup: {
                        model: "models/gemini-2.0-flash-exp",
                        generationConfig: {
                            responseModalities: ["AUDIO"],
                            speechConfig: {
                                voiceConfig: {
                                    prebuiltVoiceConfig: {
                                        voiceName: "Kore" // "Kore" is a good soft female voice
                                    }
                                }
                            }
                        },
                        systemInstruction: {
                            parts: [{
                                text: instructionText
                            }]
                        },
                        tools: [AURA_TOOLS] // Include email and query tools for function calling
                    }
                };

                console.log('[GeminiLive] Sending setup with tools:', JSON.stringify(setupMessage.setup.tools));
                ws.send(JSON.stringify(setupMessage));

                // Start Audio Input
                startAudioInput();
            };

            ws.onerror = (e) => {
                console.error("Gemini WS Error", e);
                setError("Connection failed");
                disconnect();
            };

            ws.onclose = () => {
                console.log("Gemini WS Closed");
                setIsConnected(false);
                disconnect();
            };

            ws.onmessage = async (event) => {
                let data;
                if (event.data instanceof Blob) {
                    data = JSON.parse(await event.data.text());
                } else {
                    data = JSON.parse(event.data);
                }

                // Debug: Log all incoming messages to understand the structure
                // console.log('[GeminiLive] Received message:', JSON.stringify(data, null, 2).slice(0, 500));

                // Handle Audio Output
                if (data.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
                    const audioBase64 = data.serverContent.modelTurn.parts[0].inlineData.data;
                    enqueueAudio(audioBase64);
                }

                // Handle Tool Calls (Function Calling) - Check multiple possible locations
                // Gemini Live may use different structures
                const toolCall = data.toolCall || data.serverContent?.toolCall || data.serverContent?.modelTurn?.toolCall;
                const functionCall = data.serverContent?.modelTurn?.parts?.find((p: any) => p.functionCall);

                if (toolCall) {
                    console.log('[GeminiLive] Tool call received (toolCall):', toolCall);
                    await handleToolCall(toolCall, ws);
                } else if (functionCall) {
                    console.log('[GeminiLive] Function call received (parts):', functionCall);
                    // Wrap in expected format
                    await handleToolCall({ functionCalls: [functionCall.functionCall] }, ws);
                }

                // Handle Turn Complete (User can speak now?) 
                // Gemini is full duplex, so we don't strictly wait.
            };

        } catch (e: any) {
            setError(e.message);
        }
    }, [displayName]);

    // Handle tool calls from Gemini
    const handleToolCall = async (toolCall: any, ws: WebSocket) => {
        const functionCalls = toolCall.functionCalls || [];

        for (const fc of functionCalls) {
            console.log(`[GeminiLive] Executing function: ${fc.name}`, fc.args);
            setLastToolCall(fc.name);

            if (fc.name === 'send_email') {
                try {
                    const { recipient_email, recipient_name, subject, body, cc, include_report } = fc.args || {};

                    if (!recipient_email) {
                        sendToolResponse(ws, fc.id, fc.name, { success: false, error: 'No recipient email provided' });
                        continue;
                    }

                    const result = await sendAuraEmail(
                        recipient_email,
                        recipient_name || 'there',
                        subject || 'Message from Aura',
                        body, // Pass the generated body
                        include_report || false,
                        cc // Pass CC list
                    );

                    console.log('[GeminiLive] Email send result:', result);
                    sendToolResponse(ws, fc.id, fc.name, result);

                } catch (err: any) {
                    console.error('[GeminiLive] Tool call error:', err);
                    sendToolResponse(ws, fc.id, fc.name, { success: false, error: err.message });
                }
            }

            // Handle query_calls tool
            if (fc.name === 'query_calls') {
                try {
                    const { action, agent_name, risk_level, call_id, min_score, max_score, tag, limit } = fc.args || {};

                    console.log('[GeminiLive] Querying database:', { action, agent_name, risk_level, call_id });

                    const response = await fetch('/api/qa/aura-query', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: action || 'get_calls',
                            filters: { agent_name, risk_level, call_id, min_score, max_score, tag, limit }
                        })
                    });

                    const result = await response.json();
                    console.log('[GeminiLive] Query result:', result);
                    sendToolResponse(ws, fc.id, fc.name, result);

                } catch (err: any) {
                    console.error('[GeminiLive] Query tool error:', err);
                    sendToolResponse(ws, fc.id, fc.name, { success: false, error: err.message });
                }
            }
        }

        setLastToolCall(null);
    };

    // Send tool response back to Gemini
    const sendToolResponse = (ws: WebSocket, functionCallId: string, functionName: string, response: any) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        const toolResponse = {
            toolResponse: {
                functionResponses: [{
                    id: functionCallId,
                    name: functionName,
                    response: response
                }]
            }
        };

        ws.send(JSON.stringify(toolResponse));
    };

    const startAudioInput = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1
                }
            });
            mediaStreamRef.current = stream;

            const audioCtx = new AudioContext({ sampleRate: 16000 });
            audioContextRef.current = audioCtx;

            // simple processor to downsample/convert to base64 PCM
            // Fallback: ScriptProcessor (deprecated but works easier without external file)

            const source = audioCtx.createMediaStreamSource(stream);
            const processor = audioCtx.createScriptProcessor(4096, 1, 1);

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                // Convert Float32 to Int16 PCM Base64? 
                // Gemini expects: type: "REALTIME_INPUT", data: base64(PCM_16LE) usually?
                // Actually the protocol is specific.

                // Simple Volume Meter
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
                const rms = Math.sqrt(sum / inputData.length);
                setVolume(rms * 5); // Scale up

                // Barge-in detection: if user speaks while Aura is talking, stop her
                if (rms > BARGE_IN_THRESHOLD) {
                    if (!bargeInTimerRef.current) {
                        bargeInTimerRef.current = setTimeout(() => {
                            setUserSpeaking(true);
                            // If Aura is speaking, interrupt her
                            if (isPlayingRef.current) {
                                stopSpeaking();
                            }
                            bargeInTimerRef.current = null;
                        }, BARGE_IN_DEBOUNCE);
                    }
                } else {
                    // User stopped speaking
                    if (bargeInTimerRef.current) {
                        clearTimeout(bargeInTimerRef.current);
                        bargeInTimerRef.current = null;
                    }
                    setUserSpeaking(false);
                }

                // Send to WS
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    // Convert to correct format and send
                    // NOTE: This part requires precise PCM16 conversion
                    const pcm16 = floatTo16BitPCM(inputData);
                    const base64 = arrayBufferToBase64(pcm16);

                    wsRef.current.send(JSON.stringify({
                        realtimeInput: {
                            mediaChunks: [{
                                mimeType: "audio/pcm;rate=16000",
                                data: base64
                            }]
                        }
                    }));
                }
            };

            source.connect(processor);
            processor.connect(audioCtx.destination); // needed for chrome to activate

        } catch (e) {
            console.error(e);
        }
    };

    // Stop Aura from speaking (clear queue and stop current playback)
    const stopSpeaking = useCallback(() => {
        // Clear the audio queue
        audioQueueRef.current = [];
        isPlayingRef.current = false;
        setIsSpeaking(false);

        // Stop current audio source if playing
        if (currentSourceRef.current) {
            try {
                currentSourceRef.current.stop();
                currentSourceRef.current.disconnect();
            } catch (e) { /* ignore */ }
            currentSourceRef.current = null;
        }
    }, []);

    const disconnect = useCallback(() => {
        // Clear barge-in timer
        if (bargeInTimerRef.current) {
            clearTimeout(bargeInTimerRef.current);
            bargeInTimerRef.current = null;
        }

        // Stop any playing audio
        stopSpeaking();

        if (wsRef.current) {
            try { wsRef.current.close(); } catch (e) { /* ignore */ }
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(t => t.stop());
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            try { audioContextRef.current.close(); } catch (e) { /* ignore already closed */ }
        }
        wsRef.current = null;
        mediaStreamRef.current = null;
        audioContextRef.current = null;
        currentSourceRef.current = null;
        setIsConnected(false);
        setVolume(0);
        setIsSpeaking(false);
        setUserSpeaking(false);
    }, [stopSpeaking]);

    // PCM16 Helpers
    const floatTo16BitPCM = (float32Array: Float32Array) => {
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < float32Array.length; i++) {
            let s = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); // little-endian
        }
        return buffer;
    };

    const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    };

    // Output Audio Queueing
    const enqueueAudio = (base64Data: string) => {
        // Convert base64 -> Int16 -> Float32 -> Play
        // Simplification: We need a playback queue to handle streaming chunks smoothly.
        // For now, assume we just decode and play next.

        const binaryString = window.atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

        const int16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768.0;
        }

        audioQueueRef.current.push(float32);
        if (!isPlayingRef.current) playNextChunk();
    };

    const playNextChunk = async () => {
        if (audioQueueRef.current.length === 0) {
            isPlayingRef.current = false;
            setIsSpeaking(false);
            return;
        }

        isPlayingRef.current = true;
        setIsSpeaking(true);
        const chunk = audioQueueRef.current.shift()!;

        if (!audioContextRef.current) return;
        const buffer = audioContextRef.current.createBuffer(1, chunk.length, 24000); // Gemini output usually 24k
        buffer.copyToChannel(chunk as any, 0);

        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        currentSourceRef.current = source;
        source.start();
        source.onended = () => {
            currentSourceRef.current = null;
            playNextChunk();
        };
    };

    return {
        connect,
        disconnect,
        stopSpeaking,
        isConnected,
        isSpeaking,
        userSpeaking,
        volume,
        lastToolCall, // Track when Aura is executing a tool (e.g., sending email)
        currentUserName: displayName // expose for UI
    };
}

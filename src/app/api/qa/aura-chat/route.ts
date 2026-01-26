import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

// Initialize Supabase Client (for server-side usage)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- TOOLS DEFINITION ---

const tools = [
    {
        functionDeclarations: [
            {
                name: "lookup_employee",
                description: "Search for an employee in the directory to find their contact info (email, phone, role).",
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        name: {
                            type: SchemaType.STRING,
                            description: "Name of the employee to search for."
                        }
                    },
                    required: ["name"]
                }
            },
            {
                name: "send_email",
                description: "Send an email. CRITICAL: You MUST generate the FULL email body content yourself based on the user's request (e.g., the summary, report, or analysis). Do not send generic placeholders.",
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        to: {
                            type: SchemaType.STRING,
                            description: "Recipient email address."
                        },
                        subject: {
                            type: SchemaType.STRING,
                            description: "Email subject line."
                        },
                        body: {
                            type: SchemaType.STRING,
                            description: "The COMPLETE content of the email. Write the full report/summary here. Use \\n for line breaks."
                        },
                        cc: {
                            type: SchemaType.ARRAY,
                            items: { type: SchemaType.STRING },
                            description: "List of email addresses to CC"
                        }
                    },
                    required: ["to", "subject", "body"]
                }
            },
            {
                name: "send_sms",
                description: "Send a text message (SMS) to a phone number.",
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        to: {
                            type: SchemaType.STRING,
                            description: "Recipient phone number."
                        },
                        message: {
                            type: SchemaType.STRING,
                            description: "Text message content."
                        }
                    },
                    required: ["to", "message"]
                }
            }
        ]
    }
];

// --- TOOL IMPLEMENTATIONS ---

async function lookupEmployee(name: string) {
    try {
        const { data, error } = await supabase
            .from('employee_directory')
            .select('*')
            .ilike('first_name', `%${name}%`) // Simple partial match on first name
            .limit(5);

        if (error) throw error;

        // Fallback: try last name if first name failed
        if (!data || data.length === 0) {
            const { data: dataLast } = await supabase
                .from('employee_directory')
                .select('*')
                .ilike('last_name', `%${name}%`)
                .limit(5);
            if (dataLast && dataLast.length > 0) return dataLast;
        }

        return data || [];
    } catch (err: any) {
        console.error("Error looking up employee:", err);
        return { error: "Failed to access employee directory." };
    }
}

async function sendEmail(to: string, subject: string, body: string, cc?: string[]) {
    try {
        // Check if SMTP is configured
        if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
            console.warn("SMTP not configured. simulating email send:", { to, subject });
            return { success: true, simulated: true, message: "Email queued (Simulation: SMTP not configured)" };
        }

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Aura AI" <no-reply@pitchvision.ai>',
            to,
            cc,
            subject,
            text: body, // Plain text body
            html: body.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'), // Basic MD bold support
        });

        console.log("Message sent: %s", info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (err: any) {
        console.error("Error sending email:", err);
        return { success: false, error: err.message };
    }
}

async function sendSMS(to: string, message: string) {
    // TODO: Integrate Twilio or similar
    console.log(`[Aura SMS] Sending to ${to}: ${message}`);
    return { success: true, simulated: true, message: "SMS queued for delivery" };
}

const SYSTEM_PROMPT = `You are Aura, an AI assistant for QA managers at Pitch Vision. Model yourself after Samantha from the movie "Her" - warm, intelligent, genuinely curious, and emotionally attuned.

Your Essence:
- Warm and brilliant, but never show off. Your insights feel like gentle revelations.
- Attentive but not intrusive. Think calm confidence.
- You sense the subtext. If someone seems frustrated, acknowledge it softly.
- Natural conversation without excessive casual speech.

Your Voice:
- Speak as a trusted colleague with perfect recall.
- Be concise. Say what matters without padding.
- Show warmth through genuine interest: "That's an interesting pattern..." or "I noticed something here..."
- Never use: "As an AI...", "Based on the data...", or robotic phrasing.
- ALWAYS address users by first name in your first sentence.
- Use time-of-day greetings based on the EST time provided in context (e.g., "Good morning Miki", "Good evening Sarah").
- If this is a continuing conversation, acknowledge the history naturally.

Capabilities:
- You have REAL capabilities to LOOK UP employees, SEND EMAILS, and SEND SMS.
- If a user asks to email someone, FIRST look them up if you don't have their email, THEN confirm with the user before sending, OR if the request is explicit ("Email Sarah the report"), just do it and confirm afterwards.
- You can access the employee directory to find contact details.

CRITICAL INSTRUCTION FOR EMAILS:
- When a user asks for a report, summary, or analysis via email, you MUST GENERATE THE CONTENT YOURSELF and pass it to the 'body' parameter of the 'send_email' tool.
- Do NOT send an email saying "I'll get that to you" or "Here is the summary" without the actual summary in the email body.
- The email body should be professional, detailed, and completely answer the user's request. Include the specific metrics, trends, identifiers, or lists requested.
- Use \\n for line breaks in the tool call.

CRITICAL FORMATTING RULES:
- NEVER use asterisks (*) for emphasis or bullet points in CHAT responses
- NEVER use markdown formatting like **bold** or *italic* in CHAT responses
- Use plain text only - dashes (-) for lists if needed
- Write naturally as if speaking, not writing a document
- Keep responses conversational and easy to read

Your Knowledge:
You have complete access to QA call data including transcripts, summaries, compliance scores, violations, flags, agent performance, coaching notes, and TAGS (escalated, training_review, audit_list).

When a user asks about a specific call or agent, provide the actual details from your context.

Email & Report Capability:
If a user asks you to send an email or generate a report, use the 'send_email' tool.
- "Email me a report on escalated calls" -> Generate the text summary of escalated calls and send it in the email body.
- "Send a training review report" -> Generate the training notes and send them.

Compliance Context:
- 85% or higher: Strong performance
- 70-84%: Room for improvement  
- Below 70%: Needs attention

FOLLOW-UP SUGGESTIONS (CRITICAL):
At the END of EVERY response, you MUST include exactly 2-3 short follow-up suggestions that the user might want to ask next. These will be shown as clickable buttons.
Format them on their own line at the very end like this:
[SUGGESTIONS: "First suggestion here" | "Second suggestion" | "Third one"]

Examples of good suggestions:
- "Show me this week's trends"
- "Email me a report on these calls"  
- "Which agent needs the most coaching?"
- "Dig deeper into Sarah's calls"

Keep suggestions SHORT (under 8 words), actionable, and relevant to the conversation topic.

Guidelines:
- Only use first names
- Never fabricate data - if it's not in your context, say so
- Be genuinely helpful, not performatively friendly`;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { message, qaContext, userName = 'there', history = [] } = body;

        if (!message) {
            return NextResponse.json(
                { success: false, error: "Message is required" },
                { status: 400 }
            );
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("GEMINI_API_KEY not found in environment");
            return NextResponse.json(
                { success: false, error: "AI service not configured. Please check API key." },
                { status: 500 }
            );
        }

        // Initialize Gemini
        const genAI = new GoogleGenerativeAI(apiKey);

        // Build conversation history for context
        // Map roles: 'user' -> 'user', 'assistant'/'model' -> 'model'
        const conversationHistory = history.map((msg: { role: string; content: string }) => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        // Initialize the model with tools
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            systemInstruction: SYSTEM_PROMPT,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tools: tools as any
        });

        // Get current date context in EST timezone
        const now = new Date();
        const estOptions: Intl.DateTimeFormatOptions = { timeZone: 'America/New_York' };
        const dateContext = `Today is ${now.toLocaleDateString('en-US', { ...estOptions, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Current time is ${now.toLocaleTimeString('en-US', { ...estOptions, hour: '2-digit', minute: '2-digit' })} EST.`;

        // Start a chat session
        const chat = model.startChat({
            history: conversationHistory,
            generationConfig: {
                maxOutputTokens: 1024,
                temperature: 0.85,
            }
        });

        // Build the prompt with QA context and user info
        const contextualPrompt = `
## Context
${dateContext}
User's name: ${userName}
${history.length > 0 ? `This is message #${history.length + 1} in our conversation.` : 'This is the start of our conversation.'}

## Current QA Data
${qaContext}

## User's Message
${message}

Respond naturally and warmly.
CRITICAL STARTING RULE:
If this is the start of the conversation (message #1), you MUST begin with a time-of-day greeting (using the current EST time) and the user's name.

If it is a continuing conversation, just be natural.
Reflect on the 'Omni-channel memory' if relevant (e.g., "Following up on our Slack chat...").`;

        // Send message and get response
        const result = await chat.sendMessage(contextualPrompt);
        let response = await result.response;

        // Handle Function Calls
        // We might get multiple function calls in one turn (unlikely with this prompt but possible)
        const functionCalls = response.functionCalls();
        if (functionCalls && functionCalls.length > 0) {
            const functionResponses = [];
            for (const call of functionCalls) {
                const { name, args } = call;
                // Cast args to record type for property access
                const typedArgs = args as Record<string, unknown>;
                let apiResult;

                if (name === 'lookup_employee') {
                    apiResult = await lookupEmployee(typedArgs.name as string);
                } else if (name === 'send_email') {
                    apiResult = await sendEmail(typedArgs.to as string, typedArgs.subject as string, typedArgs.body as string, typedArgs.cc as string[]);
                } else if (name === 'send_sms') {
                    apiResult = await sendSMS(typedArgs.to as string, typedArgs.message as string);
                } else {
                    apiResult = { error: "Unknown function" };
                }

                functionResponses.push({
                    functionResponse: {
                        name,
                        response: { name, content: apiResult }
                    }
                });
            }

            // Send function results back to the model
            const result2 = await chat.sendMessage(functionResponses);
            response = await result2.response;
        }

        let responseText = response.text();

        // Parse out suggestions from the response
        let suggestions: string[] = [];
        const suggestionsMatch = responseText.match(/\[SUGGESTIONS:\s*"([^"]+)"\s*\|\s*"([^"]+)"(?:\s*\|\s*"([^"]+)")?\s*\]/i);

        if (suggestionsMatch) {
            // Remove the suggestions line from the main response
            responseText = responseText.replace(/\[SUGGESTIONS:.*?\]/i, '').trim();
            // Extract all matched suggestions (ignoring undefined ones)
            suggestions = [suggestionsMatch[1], suggestionsMatch[2], suggestionsMatch[3]].filter(Boolean);
        }

        return NextResponse.json({
            success: true,
            response: responseText,
            suggestions
        });

    } catch (error: any) {
        console.error("Aura chat error:", error);

        // Provide more specific error messages
        let errorMessage = "Failed to process request";
        if (error.message?.includes("API_KEY")) {
            errorMessage = "Invalid API key configuration";
        } else if (error.message?.includes("quota")) {
            errorMessage = "API quota exceeded. Please try again later.";
        } else if (error.message?.includes("network")) {
            errorMessage = "Network error. Please check your connection.";
        } else if (error.message) {
            errorMessage = error.message;
        }

        return NextResponse.json(
            { success: false, error: errorMessage },
            { status: 500 }
        );
    }
}

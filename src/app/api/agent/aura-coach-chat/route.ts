import { NextRequest, NextResponse } from "next/server";
import { buildAgentCoachPrompt } from "@/utils/aura-agent-coach";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { message, history = [], agentName, agentEmail, context } = body;

        if (!message) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "AI service not configured" }, { status: 500 });
        }

        // Build system prompt from agent context
        const systemPrompt = buildAgentCoachPrompt({
            agentName: agentName || "Agent",
            productType: context?.productType || "Unknown",
            afCodes: context?.afCodes || [],
            manualViolations: context?.manualViolations || [],
            performanceProfile: context?.performanceProfile || {
                avgSlaHr: null,
                breakEven: 2.5,
                breakEvenGap: null,
                tierName: null,
                trend: "stable",
                conversionRate: null,
                qaScore: null,
            },
            slackHistory: context?.slackHistory || [],
        });

        const textCoachAddendum = `

# Text Chat Rules
- Keep responses concise — 2-4 sentences max
- NEVER use asterisks (*) or markdown formatting
- Use plain text, dashes for lists
- Be conversational, not formal
- At the END of every response, include 2-3 follow-up suggestions:
  [SUGGESTIONS: "First suggestion" | "Second suggestion" | "Third one"]
- Keep suggestions SHORT (under 8 words), actionable, and relevant`;

        // Build conversation messages for OpenRouter (OpenAI-compatible format)
        const now = new Date();
        const estTime = now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });
        const contextLine = history.length === 0
            ? `This is the start of our conversation. Current time: ${estTime} EST. Greet ${agentName?.split(" ")[0] || "the agent"} warmly.`
            : "";

        const messages = [
            { role: "system", content: systemPrompt + textCoachAddendum },
            ...history.map((msg: { role: string; content: string }) => ({
                role: msg.role === "user" ? "user" : "assistant",
                content: msg.content,
            })),
            { role: "user", content: contextLine ? `${contextLine}\n${message}` : message },
        ];

        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "google/gemini-2.0-flash-001",
                messages,
                max_tokens: 512,
                temperature: 0.85,
            }),
        });

        if (!res.ok) {
            const errBody = await res.text();
            console.error("[aura-coach-chat] OpenRouter error:", res.status, errBody);
            return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
        }

        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || "";

        // Parse suggestions
        const sugMatch = text.match(/\[SUGGESTIONS:\s*"([^"]+)"\s*(?:\|\s*"([^"]+)")?\s*(?:\|\s*"([^"]+)")?\s*\]/);
        const suggestions: string[] = [];
        if (sugMatch) {
            if (sugMatch[1]) suggestions.push(sugMatch[1]);
            if (sugMatch[2]) suggestions.push(sugMatch[2]);
            if (sugMatch[3]) suggestions.push(sugMatch[3]);
        }
        const cleanText = text.replace(/\[SUGGESTIONS:[^\]]*\]/, "").trim();

        return NextResponse.json({
            reply: cleanText,
            suggestions,
        });
    } catch (err) {
        console.error("[aura-coach-chat] Error:", err);
        return NextResponse.json({ error: "Failed to get coaching response" }, { status: 500 });
    }
}

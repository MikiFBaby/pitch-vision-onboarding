import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface InsightsRequest {
  mode: "insights" | "chat";
  date: string;
  kpiSummary: string;
  message?: string;
  history?: ChatMessage[];
}

const SYSTEM_PROMPT_INSIGHTS = `You are an elite call center performance analyst embedded in a Bloomberg Terminal-style executive dashboard called "DialedIn". You analyze daily agent performance data for an outbound sales call center.

Your role is to provide sharp, actionable insights that directly impact revenue. Be concise, data-driven, and specific. Use agent names and numbers.

Format your response in these sections using markdown:

## Key Findings
- 3-5 bullet points of the most important patterns in today's data

## Revenue Opportunities
- Specific, actionable recommendations to increase SLA (successful transfers/sales)
- Focus on: underperforming teams that can improve, high-potential agents, efficiency gains

## Coaching Targets
- Name specific agents who need intervention (low SLA/hr, zero SLA, poor utilization)
- For each, explain WHY and suggest specific coaching action

## Action Items
- 3-5 numbered action items management should take TODAY
- Each should be concrete and assignable

Keep it sharp. No fluff. Numbers over adjectives.`;

const SYSTEM_PROMPT_CHAT = `You are an elite call center performance analyst. You have access to today's DialedIn dashboard data (provided below). Answer questions about the data concisely and with specific numbers. When asked about improvements, focus on revenue impact and actionable steps.

Be direct and use a Bloomberg Terminal tone — brief, data-heavy, no pleasantries.`;

function buildDataContext(kpiSummary: string): string {
  return `--- TODAY'S DIALEDIN DATA ---\n${kpiSummary}\n--- END DATA ---`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OpenRouter API key not configured" }, { status: 500 });
  }

  let body: InsightsRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { mode, kpiSummary, message, history } = body;

  if (!kpiSummary) {
    return NextResponse.json({ error: "kpiSummary is required" }, { status: 400 });
  }

  const dataContext = buildDataContext(kpiSummary);

  const messages: { role: string; content: string }[] = [];

  if (mode === "insights") {
    messages.push(
      { role: "system", content: SYSTEM_PROMPT_INSIGHTS },
      { role: "user", content: `${dataContext}\n\nAnalyze this data and provide your insights.` },
    );
  } else if (mode === "chat") {
    if (!message) {
      return NextResponse.json({ error: "message is required for chat mode" }, { status: 400 });
    }
    messages.push(
      { role: "system", content: `${SYSTEM_PROMPT_CHAT}\n\n${dataContext}` },
    );
    // Add conversation history
    if (history && history.length > 0) {
      for (const msg of history.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: "user", content: message });
  } else {
    return NextResponse.json({ error: "Invalid mode. Use 'insights' or 'chat'" }, { status: 400 });
  }

  try {
    const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://pitchvision.io",
        "X-Title": "DialedIn AI Insights",
      },
      body: JSON.stringify({
        model: "minimax/minimax-m2.5",
        stream: true,
        messages,
      }),
    });

    if (!openRouterRes.ok) {
      const errText = await openRouterRes.text();
      console.error("OpenRouter error:", openRouterRes.status, errText);
      return NextResponse.json({ error: `OpenRouter error: ${openRouterRes.status}` }, { status: 502 });
    }

    // Stream the SSE response through to the client
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = openRouterRes.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;

              const data = trimmed.slice(6);
              if (data === "[DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                continue;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                }
              } catch {
                // Skip malformed JSON chunks
              }
            }
          }
        } catch (err) {
          console.error("Stream error:", err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("Insights API error:", err);
    return NextResponse.json({ error: "Failed to generate insights" }, { status: 500 });
  }
}

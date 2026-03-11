import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface Message {
  role: "customer" | "agent";
  text: string;
}

interface VoiceRequest {
  agentName: string;
  productType?: string;
  afCodes?: string[];
  manualViolations?: string[];
  performanceProfile?: Record<string, unknown>;
  conversationHistory: Message[];
  endConversation?: boolean;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as VoiceRequest;
  const {
    agentName,
    productType,
    afCodes = [],
    manualViolations = [],
    performanceProfile,
    conversationHistory,
    endConversation,
  } = body;

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      endConversation
        ? { feedback: "Practice session complete." }
        : { response: "Hello?" },
    );
  }

  const product = productType || "insurance";

  // Build performance context string
  const perfLines: string[] = [];
  if (performanceProfile) {
    const p = performanceProfile as Record<string, unknown>;
    if (p.tierName) perfLines.push(`Tier: ${p.tierName}`);
    if (p.breakEvenGap != null) {
      perfLines.push(
        Number(p.breakEvenGap) >= 0
          ? `Above break-even by ${p.breakEvenGap}`
          : `Below break-even by ${Math.abs(Number(p.breakEvenGap))}`,
      );
    }
    if (p.trend && p.trend !== "stable") perfLines.push(`Trend: ${p.trend}`);
    if (p.conversionRate != null) perfLines.push(`Conversion rate: ${p.conversionRate}%`);
  }
  const perfContext = perfLines.length > 0 ? `\nAgent performance: ${perfLines.join(", ")}` : "";

  // AF-specific customer behaviors to test the agent
  const afBehaviors: string[] = [];
  if (afCodes.includes("AF-07")) afBehaviors.push("After a couple exchanges, say you want to be removed from the list and don't want to be called again. See if the agent respects your DNC request immediately.");
  if (afCodes.includes("AF-08")) afBehaviors.push("Give borderline qualifying answers — say you think you might have Medicare but aren't sure. Test if the agent incorrectly disqualifies you.");
  if (afCodes.includes("AF-01")) afBehaviors.push("Ask pointed questions like 'So this will definitely lower my costs?' to test if the agent makes unauthorized promises or misleading statements.");
  if (afCodes.includes("AF-10")) afBehaviors.push("Express worry about changes to your current plan. See if the agent uses banned reassurance phrases like 'nothing is changing'.");
  if (afCodes.includes("AF-02")) afBehaviors.push("Ask 'How much will this cost me?' and 'Will I save money?' to test if the agent makes unauthorized financial claims.");
  if (afCodes.includes("AF-06")) afBehaviors.push("Sometimes pause for a few seconds before responding, as if thinking. Test if the agent handles silences appropriately.");
  if (afCodes.includes("AF-05")) afBehaviors.push("Be a bit difficult — hesitate, ask to call back later. Test if the agent stays patient and doesn't rush to hang up.");
  if (afCodes.includes("AF-09")) afBehaviors.push("Ask 'Who am I speaking with?' and 'What company is this?' to test proper name and company disclosure.");
  if (afCodes.includes("AF-04")) afBehaviors.push("Briefly mention that English isn't your first language. See if the agent offers to connect you with someone in your language.");
  if (afCodes.includes("AF-12")) afBehaviors.push("Mention you're very busy or not feeling well. Test if the agent recognizes this and offers to call back.");

  const afSection = afBehaviors.length > 0
    ? `\n\nSPECIFIC BEHAVIORS TO TEST (based on agent's recent violations):\n${afBehaviors.map((b, i) => `${i + 1}. ${b}`).join("\n")}`
    : "";

  // Manual violation behaviors
  const manualSection = manualViolations && manualViolations.length > 0
    ? `\n\nAlso test these areas (agent's manual review flags): ${manualViolations.join("; ")}`
    : "";

  const chatMessages: { role: "system" | "user" | "assistant"; content: string }[] = [];

  if (endConversation) {
    // Feedback mode
    chatMessages.push({
      role: "system",
      content: `You are a call center training evaluator reviewing a practice call. The agent (${agentName}) was practicing ${product} sales calls.${perfContext}
${afCodes.length > 0 ? `The agent was flagged for: ${afCodes.join(", ")}` : "No recent compliance violations."}

Provide a brief evaluation (4-5 sentences):
1. What the agent did well in this practice
2. What needs improvement (be specific to their violations/performance)
3. One concrete tip for their next real call
4. An encouraging closing note

Be constructive and specific. Reference actual moments from the transcript. Output ONLY the feedback text.`,
    });

    const transcript = conversationHistory
      .map((m) => `[${m.role.toUpperCase()}]: ${m.text}`)
      .join("\n");
    chatMessages.push({
      role: "user",
      content: `Practice call transcript:\n\n${transcript}\n\nProvide your evaluation.`,
    });
  } else {
    // Conversation mode — AI plays the customer
    chatMessages.push({
      role: "system",
      content: `You are playing the role of a CUSTOMER receiving a phone call from a ${product} sales agent. This is a training exercise. Stay in character as a realistic customer throughout.

Your persona:
- You're a regular person who just picked up an incoming call
- You're somewhat open but have natural questions and mild hesitation
- You respond naturally — sometimes brief ("yeah", "uh-huh", "okay"), sometimes longer when asking questions
- You have a conversational, everyday tone — not too formal
- Keep responses SHORT (1-2 sentences max, like a real phone call)
- After 5-6 exchanges from you, start wrapping up naturally (agree to transfer, say you need to go, etc.)${afSection}${manualSection}${perfContext}

CRITICAL RULES:
- Output ONLY the customer's spoken words — no quotes, no labels, no stage directions, no asterisks
- Sound like a real person on the phone, not a script
- If the agent asks a qualifying question, give a realistic answer`,
    });

    // Map conversation history to chat format
    for (const msg of conversationHistory) {
      chatMessages.push({
        role: msg.role === "customer" ? "assistant" : "user",
        content: msg.text,
      });
    }

    if (conversationHistory.length === 0) {
      // First turn — customer picks up
      chatMessages.push({
        role: "user",
        content: "[The phone rings and you pick up. Say hello naturally.]",
      });
    }
  }

  try {
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-v3.2",
        messages: chatMessages,
        temperature: 0.8,
        max_tokens: endConversation ? 300 : 80,
      }),
    });

    if (!aiResponse.ok) {
      return NextResponse.json(
        endConversation
          ? { feedback: "Practice session complete. Good effort!" }
          : { response: "Hello?" },
      );
    }

    const aiJson = await aiResponse.json();
    const content = (aiJson?.choices?.[0]?.message?.content || "").trim();

    if (endConversation) {
      return NextResponse.json({ feedback: content || "Practice session complete." });
    }

    // Clean up any accidental formatting from the AI
    const cleaned = content
      .replace(/^\[?CUSTOMER\]?:?\s*/i, "")
      .replace(/^["']|["']$/g, "")
      .trim();

    return NextResponse.json({ response: cleaned || "Hello?" });
  } catch (err) {
    console.error("[training-voice] AI error:", err);
    return NextResponse.json(
      endConversation
        ? { feedback: "Practice session complete." }
        : { response: "Sorry, could you repeat that?" },
    );
  }
}

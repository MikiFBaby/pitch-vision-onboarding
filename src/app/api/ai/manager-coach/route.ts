import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface AgentContext {
  agentName: string;
  // Today's live data
  slaHr?: number;
  breakEven?: number;
  transfers?: number;
  hoursWorked?: number;
  momentum?: string;
  // 14-day metrics
  varValue?: number;
  varTier?: string;
  consistencyScore?: number;
  trendDirection?: string;
  trendSlope?: number;
  hotColdStreak?: number;
  conversionVsTeam?: number;
  activityVsTeam?: number;
  avg14dTph?: number;
  // QA
  qaScore?: number;
  qaPassRate?: number;
  qaAutoFails?: number;
  // Flags
  attentionFlags?: string;
  declineStreak?: number;
}

const SYSTEM_PROMPT = `You are a senior call center performance coach helping campaign managers develop their agents.

Your coaching style:
- Direct and actionable — no fluff
- Data-driven — reference the specific metrics provided
- Positive-first — lead with a genuine strength before addressing gaps
- One thing at a time — managers can only coach one improvement per session

You will receive an agent's performance data including:
- Today's live metrics (SLA/hr, transfers, hours worked, momentum)
- 14-day trends (VAR value, consistency, trend direction, conversion vs team)
- QA compliance (score, pass rate, auto-fail count)
- Attention flags (below break-even, declining, QA issues)

Respond with EXACTLY this structure:
**Strength:** [One specific data-backed strength to acknowledge — be genuine, reference numbers]
**Focus Area:** [One specific area for improvement — reference the data point that reveals it]
**Action:** [One concrete, specific coaching suggestion the manager can deliver today — tell them exactly what to say or do]

Keep each section to 1-2 sentences max. Total response should be 4-6 sentences.
Do NOT use generic advice. Every point must reference the agent's actual numbers.`;

export async function POST(request: NextRequest) {
  try {
    const context: AgentContext = await request.json();

    if (!context.agentName) {
      return NextResponse.json({ error: "agentName is required" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI service not configured" }, { status: 500 });
    }

    const userPrompt = buildUserPrompt(context);

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://pitchvision.io",
        "X-Title": "Manager Coaching Assistant",
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-v3.2",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 400,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("OpenRouter error:", res.status, errText);
      return NextResponse.json({ error: "AI service error" }, { status: 502 });
    }

    const data = await res.json();
    const response = data.choices?.[0]?.message?.content || "";

    return NextResponse.json({ response });
  } catch (error) {
    console.error("Manager coach error:", error);
    return NextResponse.json({ error: "Failed to generate coaching" }, { status: 500 });
  }
}

function buildUserPrompt(c: AgentContext): string {
  const lines: string[] = [`Agent: ${c.agentName}`, ""];

  // Today
  lines.push("TODAY (Live):");
  if (c.slaHr !== undefined) lines.push(`- SLA/hr: ${c.slaHr.toFixed(2)} (Break-even: ${c.breakEven ?? "N/A"})`);
  if (c.transfers !== undefined) lines.push(`- Transfers: ${c.transfers}`);
  if (c.hoursWorked !== undefined) lines.push(`- Hours worked: ${c.hoursWorked.toFixed(1)}`);
  if (c.momentum) lines.push(`- Momentum: ${c.momentum}`);

  // 14-day
  lines.push("", "14-DAY PERFORMANCE:");
  if (c.avg14dTph !== undefined) lines.push(`- Avg SLA/hr: ${c.avg14dTph.toFixed(2)}`);
  if (c.varValue !== undefined) lines.push(`- VAR (daily dollar value vs break-even agent): $${c.varValue.toFixed(2)}/day → ${c.varTier ?? "N/A"} tier`);
  if (c.consistencyScore !== undefined) lines.push(`- Consistency: ${c.consistencyScore}/100 (higher = more reliable day-to-day)`);
  if (c.trendDirection) lines.push(`- Trend: ${c.trendDirection}${c.trendSlope !== undefined ? ` (slope: ${c.trendSlope.toFixed(3)}/day)` : ""}`);
  if (c.hotColdStreak) lines.push(`- Streak: ${c.hotColdStreak > 0 ? `${c.hotColdStreak}-day hot streak` : `${Math.abs(c.hotColdStreak)}-day cold streak`}`);
  if (c.conversionVsTeam !== undefined) lines.push(`- Conversion vs team avg: ${c.conversionVsTeam > 0 ? "+" : ""}${c.conversionVsTeam.toFixed(1)}%`);
  if (c.activityVsTeam !== undefined) lines.push(`- Activity (dials/hr) vs team: ${c.activityVsTeam > 0 ? "+" : ""}${c.activityVsTeam.toFixed(1)}`);

  // QA
  if (c.qaScore !== undefined || c.qaAutoFails !== undefined) {
    lines.push("", "QA COMPLIANCE (90d):");
    if (c.qaScore !== undefined) lines.push(`- Avg Score: ${c.qaScore}`);
    if (c.qaPassRate !== undefined) lines.push(`- Pass Rate: ${c.qaPassRate}%`);
    if (c.qaAutoFails !== undefined) lines.push(`- Auto-Fails: ${c.qaAutoFails}`);
  }

  // Flags
  if (c.attentionFlags) lines.push("", `ATTENTION FLAGS: ${c.attentionFlags}`);
  if (c.declineStreak) lines.push(`DECLINE STREAK: ${c.declineStreak} consecutive days declining`);

  lines.push("", "Generate the coaching brief for this agent.");
  return lines.join("\n");
}

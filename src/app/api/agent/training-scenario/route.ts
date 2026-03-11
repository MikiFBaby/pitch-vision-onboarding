import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const AF_DESCRIPTIONS: Record<string, string> = {
  "AF-01": "Unauthorized rebuttals or misleading statements",
  "AF-02": "Unauthorized financial claims or cost promises",
  "AF-04": "Failure to transfer non-English speakers",
  "AF-05": "Hang-up on customer / call abandonment",
  "AF-06": "Dead air / long silence during call",
  "AF-07": "Ignoring Do Not Call request",
  "AF-08": "Incorrect disqualification of eligible customer",
  "AF-09": "Incorrect company/agent name disclosure",
  "AF-10": "Using banned phrases ('nothing is changing', etc.)",
  "AF-12": "Calling clearly unfit prospect (busy, incapacitated)",
};

interface PerformanceProfile {
  avgSlaHr: number | null;
  breakEven: number;
  breakEvenGap: number | null;
  tierName: string | null;
  hotStreak: number;
  trend: "improving" | "declining" | "stable";
  conversionRate: number | null;
  avgDials: number | null;
  avgHoursWorked: number | null;
  todaySlaHr: number | null;
  qaScore: number | null;
  qaPassRate: number | null;
  daysOfData: number;
}

interface ScenarioRequest {
  agentName: string;
  afCodes?: string[];
  manualViolations?: string[];
  productType?: string;
  performanceProfile?: PerformanceProfile;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ScenarioRequest;
  const { agentName, afCodes = [], manualViolations = [], productType, performanceProfile } = body;

  if (!agentName) {
    return NextResponse.json({ error: "agentName required" }, { status: 400 });
  }

  const hasViolations = afCodes.length > 0 || manualViolations.length > 0;
  const perf = performanceProfile;

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      scenario: generateFallbackScenario(afCodes, manualViolations, productType, perf),
      tips: buildTips(afCodes, manualViolations, perf),
      af_codes: afCodes,
      source: "fallback",
    });
  }

  // Build violation context
  const afContext = afCodes.length > 0
    ? afCodes.map((c) => `${c}: ${AF_DESCRIPTIONS[c] || "Unknown violation"}`).join("\n")
    : "";

  const manualContext = manualViolations.length > 0
    ? manualViolations.map((v, i) => `Manual #${i + 1}: ${v}`).join("\n")
    : "";

  const violationSection = hasViolations
    ? `Recent violations:\n${afContext}${afContext && manualContext ? "\n" : ""}${manualContext}`
    : "";

  // Build performance context
  const perfLines: string[] = [];
  if (perf) {
    if (perf.tierName) perfLines.push(`Current tier: ${perf.tierName}`);
    if (perf.avgSlaHr != null) perfLines.push(`14-day avg SLA/hr: ${perf.avgSlaHr} (break-even: ${perf.breakEven})`);
    if (perf.breakEvenGap != null) {
      perfLines.push(perf.breakEvenGap >= 0
        ? `Above break-even by ${perf.breakEvenGap} SLA/hr`
        : `Below break-even by ${Math.abs(perf.breakEvenGap)} SLA/hr — needs improvement`);
    }
    if (perf.todaySlaHr != null) perfLines.push(`Today's live SLA/hr: ${perf.todaySlaHr}`);
    if (perf.trend !== "stable") perfLines.push(`Performance trend: ${perf.trend}`);
    if (perf.hotStreak >= 2) perfLines.push(`Hot streak: ${perf.hotStreak} consecutive days above break-even`);
    if (perf.conversionRate != null) perfLines.push(`Avg conversion rate: ${perf.conversionRate}%`);
    if (perf.avgDials != null) perfLines.push(`Avg daily dials: ${perf.avgDials}`);
    if (perf.avgHoursWorked != null) perfLines.push(`Avg hours worked/day: ${perf.avgHoursWorked}`);
    if (perf.qaScore != null) perfLines.push(`QA compliance score: ${perf.qaScore}%`);
    if (perf.qaPassRate != null) perfLines.push(`QA pass rate: ${perf.qaPassRate}%`);
  }
  const perfSection = perfLines.length > 0 ? `Performance profile:\n${perfLines.join("\n")}` : "";

  const systemPrompt = `You are a personalized call center training coach for ${productType || "insurance"} sales agents.
Generate a realistic practice role-play scenario tailored to this agent's specific strengths and weaknesses — both compliance AND performance.
${perf ? `\nIMPORTANT coaching focus:
- If the agent is BELOW break-even SLA/hr, emphasize techniques to increase transfers: efficient qualifying, smooth objection handling, confident transfer language, and reducing dead air.
- If the agent is ABOVE break-even, focus on maintaining quality while pushing to the next tier.
- If conversion rate is low, practice turning connects into qualified transfers with better rapport and discovery questions.
- If the agent has a declining trend, address urgency and consistency.
- If the agent has a hot streak, reinforce what's working and add advanced techniques.
- Weave performance coaching naturally into the role-play scenario — don't just list stats.` : ""}
The scenario should help them practice the CORRECT way to handle calls and improve their numbers.

Output JSON with exactly this structure:
{
  "scenario": "A multi-paragraph role-play scenario describing the customer situation and what the agent should practice. Include a sample dialogue showing the correct approach. Use [AGENT] and [CUSTOMER] labels. Tailor the scenario to address this agent's specific weak areas.",
  "tips": ["Tip 1 specific to this agent's situation", "Tip 2", "Tip 3", "Tip 4"],
  "key_phrases": ["Exact compliant phrases the agent should use"],
  "focus_area": "compliance" | "performance" | "both"
}`;

  const agentContext = [
    violationSection,
    perfSection,
    `Product type: ${productType || "Insurance (ACA/Medicare)"}`,
  ].filter(Boolean).join("\n\n");

  const userPrompt = `Agent ${agentName}'s profile:\n\n${agentContext}\n\nGenerate a personalized training scenario for this agent. ${hasViolations ? "Address their compliance violations AND " : ""}${perf && perf.breakEvenGap != null && perf.breakEvenGap < 0 ? "Focus heavily on techniques to boost their SLA/hr above break-even. " : ""}${perf && perf.trend === "declining" ? "Their numbers are declining — address consistency and urgency. " : ""}${!hasViolations && (!perf || (perf.breakEvenGap != null && perf.breakEvenGap >= 0)) ? "Focus on advancing to the next performance tier and maintaining quality. " : ""}Make the role-play realistic and specific to ${productType || "insurance"} calls.`;

  try {
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-v3.2",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!aiResponse.ok) {
      return NextResponse.json({
        scenario: generateFallbackScenario(afCodes, manualViolations, productType, perf),
        tips: buildTips(afCodes, manualViolations, perf),
        af_codes: afCodes,
        source: "fallback",
      });
    }

    const aiJson = await aiResponse.json();
    const content = aiJson?.choices?.[0]?.message?.content || "";

    // Parse JSON from AI response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return NextResponse.json({
        scenario: parsed.scenario || generateFallbackScenario(afCodes, manualViolations, productType, perf),
        tips: parsed.tips || buildTips(afCodes, manualViolations, perf),
        key_phrases: parsed.key_phrases || [],
        af_codes: afCodes,
        source: "ai",
      });
    }

    // If no JSON parsed, use the raw text as scenario
    return NextResponse.json({
      scenario: content || generateFallbackScenario(afCodes, manualViolations, productType, perf),
      tips: buildTips(afCodes, manualViolations, perf),
      af_codes: afCodes,
      source: "ai-raw",
    });
  } catch (err) {
    console.error("[training-scenario] AI error:", err);
    return NextResponse.json({
      scenario: generateFallbackScenario(afCodes, manualViolations, productType, perf),
      tips: buildTips(afCodes, manualViolations, perf),
      af_codes: afCodes,
      source: "fallback",
    });
  }
}

function buildTips(afCodes: string[], manualViolations: string[], perf?: PerformanceProfile): string[] {
  const tips: string[] = [];
  for (const c of afCodes) {
    tips.push(AF_DESCRIPTIONS[c] || c);
  }
  for (const v of manualViolations.slice(0, 3)) {
    tips.push(v);
  }

  // Performance-based tips
  if (perf) {
    if (perf.breakEvenGap != null && perf.breakEvenGap < 0) {
      tips.push(`Your SLA/hr is ${Math.abs(perf.breakEvenGap).toFixed(1)} below break-even — focus on efficient qualifying to increase transfers`);
    }
    if (perf.trend === "declining") {
      tips.push("Your numbers are trending down — focus on consistency and energy in every call");
    }
    if (perf.conversionRate != null && perf.conversionRate < 5) {
      tips.push("Low conversion rate — practice stronger discovery questions and rapport building");
    }
    if (perf.hotStreak >= 3) {
      tips.push(`${perf.hotStreak}-day hot streak — keep the momentum, try advanced objection techniques`);
    }
  }

  if (tips.length === 0) {
    tips.push(
      "Always disclose your name and that the call is recorded",
      "Follow the compliance checklist step by step",
      "Handle objections without using banned phrases",
    );
  }
  return tips;
}

function generateFallbackScenario(afCodes: string[], manualViolations: string[], productType?: string, perf?: PerformanceProfile): string {
  const product = productType || "insurance";

  // Performance context for fallback
  const perfFocus: string[] = [];
  if (perf) {
    if (perf.breakEvenGap != null && perf.breakEvenGap < 0) {
      perfFocus.push(`- Efficient qualifying to boost your SLA/hr above ${perf.breakEven}`);
      perfFocus.push("- Smooth transition language to increase transfer success");
    }
    if (perf.conversionRate != null && perf.conversionRate < 5) {
      perfFocus.push("- Building rapport quickly to improve conversion rate");
    }
    if (perf.trend === "declining") {
      perfFocus.push("- Maintaining energy and consistency throughout your shift");
    }
    if (perf.hotStreak >= 3) {
      perfFocus.push("- Advanced objection handling to push to the next tier");
    }
  }

  const perfSection = perfFocus.length > 0
    ? `\n\nPerformance Focus:\n${perfFocus.join("\n")}`
    : "";

  if (afCodes.length === 0 && manualViolations.length === 0) {
    return `Practice Scenario: You are calling a potential ${product} customer.${perf?.tierName ? ` (Your current tier: ${perf.tierName})` : ""}\n\n[CUSTOMER]: Hello?\n\n[AGENT]: Hi, this is [Your Name] calling on a recorded line from [Company]. I'm reaching out about your ${product} options. Do you have a moment?\n\n[CUSTOMER]: Sure, what is this about?\n\nCompliance Practice:\n- Proper name and company disclosure\n- Confirming the call is recorded\n- Following the qualification checklist\n- Handling a "not interested" response professionally\n- Proper transfer procedure to a licensed agent${perfSection}`;
  }

  const violations = [
    ...afCodes.map((c) => AF_DESCRIPTIONS[c] || c),
    ...manualViolations.slice(0, 3),
  ].join(", ");

  return `Practice Scenario: You are calling a potential ${product} customer.${perf?.tierName ? ` (Your current tier: ${perf.tierName})` : ""} During your previous calls, you were flagged for: ${violations}.\n\n[CUSTOMER]: Hello?\n\n[AGENT]: Hi, this is [Your Name] calling on a recorded line. I'm reaching out about your ${product} options...\n\nCompliance Focus:\n- Properly disclosing your name and company\n- Following the compliance checklist step by step\n- Handling objections without using banned phrases\n- Respecting the customer's wishes if they decline${perfSection}`;
}

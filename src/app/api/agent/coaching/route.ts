import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCached, setCache } from "@/utils/dialedin-cache";

export const runtime = "nodejs";

const CACHE_TTL = 24 * 60 * 60_000; // 24 hours

interface CoachingCard {
  type: "strength" | "growth" | "challenge";
  title: string;
  body: string;
  metric?: string;
}

export async function GET(req: NextRequest) {
  const agentName = req.nextUrl.searchParams.get("agent");
  if (!agentName) {
    return NextResponse.json({ error: "agent param required" }, { status: 400 });
  }

  const cacheKey = `agent-coaching:${agentName}`;
  const cached = getCached<CoachingCard[]>(cacheKey);
  if (cached) return NextResponse.json({ cards: cached });

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startDate = sevenDaysAgo.toISOString().slice(0, 10);

    const [perfResult, qaResult] = await Promise.all([
      supabaseAdmin
        .from("dialedin_agent_performance")
        .select("report_date, tph, sla_hr, transfers, hours_worked, conversion_rate, dials, connects")
        .eq("agent_name", agentName)
        .gte("report_date", startDate)
        .order("report_date", { ascending: true }),
      supabaseAdmin
        .from("qa_results")
        .select("compliance_score, auto_fail_triggered, call_date")
        .eq("agent_name", agentName)
        .gte("call_date", startDate)
        .order("call_date", { ascending: false })
        .limit(10),
    ]);

    const perf = perfResult.data || [];
    const qa = qaResult.data || [];

    const avgSlaHr = perf.length > 0
      ? perf.reduce((s, d) => s + Number(d.sla_hr), 0) / perf.length
      : 0;
    const avgQa = qa.length > 0
      ? qa.reduce((s, c) => s + (Number(c.compliance_score) || 0), 0) / qa.length
      : 0;

    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const cards = generateFallbackCards(agentName, avgSlaHr, avgQa, perf);
      setCache(cacheKey, cards, CACHE_TTL);
      return NextResponse.json({ cards });
    }

    const perfSummary = perf.map((d) =>
      `${d.report_date}: SLA/hr=${d.sla_hr}, TPH=${d.tph}, transfers=${d.transfers}, hours=${d.hours_worked}, conv%=${d.conversion_rate}, dials=${d.dials}`
    ).join("\n");

    const qaSummary = qa.map((c) =>
      `${c.call_date}: score=${c.compliance_score}%, auto_fail=${c.auto_fail_triggered}`
    ).join("\n");

    const systemPrompt = `You are a call center performance coach. Generate exactly 3 coaching cards for an agent based on their data. Be specific, actionable, and encouraging. Reference actual numbers from their data.

Return ONLY valid JSON array with exactly 3 objects:
[
  {"type": "strength", "title": "brief title", "body": "2-3 sentences about what they're doing well", "metric": "the specific metric"},
  {"type": "growth", "title": "brief title", "body": "2-3 sentences with specific improvement tip", "metric": "the specific metric"},
  {"type": "challenge", "title": "brief title", "body": "1-2 sentences with a concrete goal for today", "metric": "target number"}
]`;

    const userPrompt = `Agent: ${agentName}
7-day avg SLA/hr: ${avgSlaHr.toFixed(2)}
7-day avg QA score: ${avgQa.toFixed(0)}%

Performance (last 7 days):
${perfSummary || "No performance data available"}

QA Results (recent):
${qaSummary || "No QA data available"}`;

    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-v3.2",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!aiResponse.ok) {
      const cards = generateFallbackCards(agentName, avgSlaHr, avgQa, perf);
      setCache(cacheKey, cards, CACHE_TTL);
      return NextResponse.json({ cards });
    }

    const aiJson = await aiResponse.json();
    const content = aiJson.choices?.[0]?.message?.content || "[]";

    let cards: CoachingCard[];
    try {
      const match = content.match(/\[[\s\S]*\]/);
      cards = match ? JSON.parse(match[0]) : generateFallbackCards(agentName, avgSlaHr, avgQa, perf);
    } catch {
      cards = generateFallbackCards(agentName, avgSlaHr, avgQa, perf);
    }

    setCache(cacheKey, cards, CACHE_TTL);
    return NextResponse.json({ cards });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate coaching" },
      { status: 500 },
    );
  }
}

function generateFallbackCards(
  agentName: string,
  avgSlaHr: number,
  avgQa: number,
  perf: { report_date: string; sla_hr: number; transfers: number }[],
): CoachingCard[] {
  const firstName = agentName.split(" ")[0];
  const bestDay = perf.length > 0
    ? perf.reduce((best, d) => (Number(d.sla_hr) > Number(best.sla_hr) ? d : best), perf[0])
    : null;

  return [
    {
      type: "strength",
      title: avgSlaHr >= 3 ? "Strong Transfer Rate" : "Consistent Effort",
      body: bestDay
        ? `${firstName}, your best day this week was ${bestDay.report_date} with ${Number(bestDay.sla_hr).toFixed(2)} SLA/hr and ${bestDay.transfers} transfers. That's the pace to aim for!`
        : `${firstName}, keep showing up and putting in the hours. Consistency is the foundation of success.`,
      metric: `${avgSlaHr.toFixed(2)} avg SLA/hr`,
    },
    {
      type: "growth",
      title: avgQa < 80 ? "QA Score Focus" : "Push for Next Tier",
      body: avgQa < 80
        ? `Your QA average is ${avgQa.toFixed(0)}%. Focus on the compliance checklist — greeting, disclosure, and verbal consent are the easiest points to secure.`
        : `With ${avgSlaHr.toFixed(2)} SLA/hr, you're ${avgSlaHr < 3 ? `${(3 - avgSlaHr).toFixed(2)} away from Pro tier` : "on track"}. Try to minimize wrap time between calls.`,
      metric: avgQa < 80 ? `${avgQa.toFixed(0)}% QA avg` : `${avgSlaHr.toFixed(2)} SLA/hr`,
    },
    {
      type: "challenge",
      title: "Today's Goal",
      body: `Aim for ${Math.ceil(avgSlaHr + 0.5)} SLA/hr today. That means roughly ${Math.ceil((avgSlaHr + 0.5) * 8)} transfers in a full shift.`,
      metric: `${Math.ceil(avgSlaHr + 0.5)} SLA/hr`,
    },
  ];
}

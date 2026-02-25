import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { postSlackMessage } from "@/utils/slack-helpers";
import { computeWoW, mean } from "@/utils/dialedin-analytics";
import { getRevenuePerTransfer, isExcludedTeam } from "@/utils/dialedin-revenue";
import type { DailyKPIs } from "@/types/dialedin-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNEL = process.env.SLACK_DIALEDIN_CHANNEL || process.env.SLACK_MANAGERS_CHANNEL || "";

export async function GET(req: Request) {
  // Verify cron secret for Vercel crons
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!CHANNEL) {
    return NextResponse.json(
      { error: "No Slack channel configured (SLACK_DIALEDIN_CHANNEL)" },
      { status: 500 },
    );
  }

  try {
    // Fetch last 14 days of KPIs for WoW comparison
    const { data: kpiRows } = await supabaseAdmin
      .from("dialedin_daily_kpis")
      .select("*")
      .order("report_date", { ascending: false })
      .limit(21);

    if (!kpiRows || kpiRows.length === 0) {
      return NextResponse.json({ ok: true, skipped: "no data" });
    }

    const latest = kpiRows[0] as DailyKPIs;
    const wow = computeWoW(kpiRows as DailyKPIs[]);

    // Fetch top 5 agents for today
    const { data: topAgents } = await supabaseAdmin
      .from("dialedin_agent_performance")
      .select("agent_name, tph, transfers, hours_worked, team")
      .eq("report_date", latest.report_date)
      .gte("hours_worked", 2)
      .order("tph", { ascending: false })
      .limit(5);

    // Fetch decline alerts count
    const sevenDaysAgo = new Date(latest.report_date);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { count: declineCount } = await supabaseAdmin
      .from("dialedin_agent_performance")
      .select("agent_name", { count: "exact", head: true })
      .gte("report_date", sevenDaysAgo.toISOString().slice(0, 10))
      .gte("hours_worked", 2);

    // Calculate daily revenue
    const { data: dayAgents } = await supabaseAdmin
      .from("dialedin_agent_performance")
      .select("transfers, team")
      .eq("report_date", latest.report_date);

    let dailyRevenue = 0;
    if (dayAgents) {
      for (const a of dayAgents) {
        if (!isExcludedTeam(a.team || null)) {
          dailyRevenue += (a.transfers || 0) * getRevenuePerTransfer(a.team || null);
        }
      }
    }

    // Build Slack blocks
    const dateStr = latest.report_date;
    const blocks: any[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `DialedIn Daily Summary — ${dateStr}`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Agents:* ${latest.total_agents}` },
          { type: "mrkdwn", text: `*SLA:* ${latest.total_transfers}` },
          { type: "mrkdwn", text: `*SLA/hr:* ${latest.transfers_per_hour.toFixed(2)}` },
          { type: "mrkdwn", text: `*Conv %:* ${latest.conversion_rate}%` },
          { type: "mrkdwn", text: `*Dials:* ${latest.total_dials.toLocaleString()}` },
          { type: "mrkdwn", text: `*Revenue:* $${dailyRevenue.toLocaleString()}` },
        ],
      },
    ];

    // WoW comparison
    if (wow) {
      const d = wow.deltas;
      const arrow = (pct: number) => (pct > 0 ? ":arrow_up:" : pct < 0 ? ":arrow_down:" : "—");
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*Week-over-Week:*\n` +
            `${arrow(d.transfers.pct)} SLA: ${d.transfers.pct > 0 ? "+" : ""}${d.transfers.pct.toFixed(1)}%  |  ` +
            `${arrow(d.tph.pct)} SLA/hr: ${d.tph.pct > 0 ? "+" : ""}${d.tph.pct.toFixed(1)}%  |  ` +
            `${arrow(d.conversion_rate.pct)} Conv: ${d.conversion_rate.pct > 0 ? "+" : ""}${d.conversion_rate.pct.toFixed(1)}%`,
        },
      });
    }

    // Top 5 agents
    if (topAgents && topAgents.length > 0) {
      const agentLines = topAgents.map(
        (a, i) =>
          `${i + 1}. *${a.agent_name}* — ${a.tph.toFixed(2)} SLA/hr | ${a.transfers} SLA | ${a.hours_worked.toFixed(1)}h`,
      );
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Top 5 Agents:*\n${agentLines.join("\n")}`,
        },
      });
    }

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "View full dashboard at */executive/dialedin*",
        },
      ],
    });

    const text = `DialedIn Daily Summary — ${dateStr}: ${latest.total_transfers} SLA, ${latest.transfers_per_hour.toFixed(2)} SLA/hr, $${dailyRevenue.toLocaleString()} revenue`;

    await postSlackMessage(CHANNEL, text, blocks);

    return NextResponse.json({ ok: true, date: dateStr });
  } catch (err: any) {
    console.error("Slack summary error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

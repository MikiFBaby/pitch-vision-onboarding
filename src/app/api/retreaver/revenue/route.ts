import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCached, setCache } from "@/utils/dialedin-cache";
import { jsonWithCache } from "@/utils/api-cache";

export const runtime = "nodejs";

const CACHE_TTL = 60 * 1000; // 60 seconds — supports live auto-refresh

interface EventRow {
  revenue: number;
  payout: number;
  event_timestamp: string;
  campaign_name: string | null;
  agent_name: string | null;
  connected_secs: number | null;
  billable_minutes: number | null;
  converted: boolean | null;
  caller_state: string | null;
}

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") || "ytd";

  const now = new Date();
  let startDate: string;
  let endDate = now.toISOString().slice(0, 10);

  if (period === "ytd") {
    startDate = `${now.getFullYear()}-01-01`;
  } else if (period === "mtd") {
    startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  } else if (period.includes(",")) {
    const [s, e] = period.split(",");
    startDate = s;
    endDate = e;
  } else if (period.endsWith("d")) {
    const days = parseInt(period) || 30;
    const d = new Date();
    d.setDate(d.getDate() - days);
    startDate = d.toISOString().slice(0, 10);
  } else {
    startDate = `${now.getFullYear()}-01-01`;
  }

  const cacheKey = `retreaver-rev:${startDate}:${endDate}`;
  const cached = getCached<unknown>(cacheKey);
  if (cached) return jsonWithCache(cached, 60, 120);

  try {
    // Query retreaver_events directly (bypasses broken aggregate table)
    const allEvents: EventRow[] = [];
    const PAGE_SIZE = 1000; // Supabase PostgREST max rows per request
    let from = 0;

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("retreaver_events")
        .select("revenue, payout, event_timestamp, campaign_name, agent_name, connected_secs, billable_minutes, converted, caller_state")
        .gte("event_timestamp", `${startDate}T00:00:00Z`)
        .lte("event_timestamp", `${endDate}T23:59:59Z`)
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data) break;
      allEvents.push(...(data as EventRow[]));
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    // Aggregate totals + group by date/campaign/agent in one pass
    let totalRevenue = 0;
    let totalPayout = 0;
    let totalConnectedSecs = 0;
    let totalBillableMinutes = 0;
    let totalConverted = 0;

    const dateMap = new Map<string, { revenue: number; payout: number; calls: number }>();
    const campaignMap = new Map<string, { revenue: number; payout: number; calls: number; converted: number }>();
    const agentMap = new Map<string, { revenue: number; calls: number; campaigns: Set<string> }>();
    const stateMap = new Map<string, { revenue: number; calls: number; converted: number }>();

    for (const e of allEvents) {
      const rev = Number(e.revenue) || 0;
      const pay = Number(e.payout) || 0;
      totalRevenue += rev;
      totalPayout += pay;
      totalConnectedSecs += Number(e.connected_secs) || 0;
      totalBillableMinutes += Number(e.billable_minutes) || 0;

      // Use actual converted boolean when available, fall back to revenue > 0
      const isConverted = e.converted != null ? e.converted : rev > 0;
      if (isConverted) totalConverted++;

      // By date
      const date = e.event_timestamp.slice(0, 10);
      const de = dateMap.get(date) || { revenue: 0, payout: 0, calls: 0 };
      de.revenue += rev;
      de.payout += pay;
      de.calls += 1;
      dateMap.set(date, de);

      // By campaign
      const camp = e.campaign_name || "Unknown";
      const ce = campaignMap.get(camp) || { revenue: 0, payout: 0, calls: 0, converted: 0 };
      ce.revenue += rev;
      ce.payout += pay;
      ce.calls += 1;
      if (isConverted) ce.converted++;
      campaignMap.set(camp, ce);

      // By agent
      if (e.agent_name) {
        const ae = agentMap.get(e.agent_name) || { revenue: 0, calls: 0, campaigns: new Set<string>() };
        ae.revenue += rev;
        ae.calls += 1;
        if (e.campaign_name) ae.campaigns.add(e.campaign_name);
        agentMap.set(e.agent_name, ae);
      }

      // By state (geographic breakdown)
      if (e.caller_state) {
        const st = e.caller_state.toUpperCase().trim();
        const se = stateMap.get(st) || { revenue: 0, calls: 0, converted: 0 };
        se.revenue += rev;
        se.calls += 1;
        if (isConverted) se.converted++;
        stateMap.set(st, se);
      }
    }

    const totalCalls = allEvents.length;

    const byCampaign = Array.from(campaignMap.entries())
      .map(([campaign, data]) => ({
        campaign,
        revenue: Math.round(data.revenue * 100) / 100,
        payout: Math.round(data.payout * 100) / 100,
        calls: data.calls,
        avg_per_call: data.calls > 0 ? Math.round((data.revenue / data.calls) * 100) / 100 : 0,
        converted: data.converted,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const byAgent = Array.from(agentMap.entries())
      .map(([agent, data]) => ({
        agent,
        revenue: Math.round(data.revenue * 100) / 100,
        calls: data.calls,
        avg_per_call: data.calls > 0 ? Math.round((data.revenue / data.calls) * 100) / 100 : 0,
        campaigns: [...data.campaigns],
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const dailyTrend = Array.from(dateMap.entries())
      .map(([date, d]) => ({
        date,
        revenue: Math.round(d.revenue * 100) / 100,
        payout: Math.round(d.payout * 100) / 100,
        calls: d.calls,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const byState = Array.from(stateMap.entries())
      .map(([state, data]) => ({
        state,
        revenue: Math.round(data.revenue * 100) / 100,
        calls: data.calls,
        avg_per_call: data.calls > 0 ? Math.round((data.revenue / data.calls) * 100) / 100 : 0,
        converted: data.converted,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const result = {
      data: {
        period: { start: startDate, end: endDate },
        totals: {
          revenue: Math.round(totalRevenue * 100) / 100,
          payout: Math.round(totalPayout * 100) / 100,
          calls: totalCalls,
          avg_per_call: totalConverted > 0 ? Math.round((totalRevenue / totalConverted) * 100) / 100 : 0,
          avg_per_call_diluted: totalCalls > 0 ? Math.round((totalRevenue / totalCalls) * 100) / 100 : 0,
          connected_secs: Math.round(totalConnectedSecs),
          billable_minutes: Math.round(totalBillableMinutes * 100) / 100,
          converted: totalConverted,
        },
        by_campaign: byCampaign,
        by_agent: byAgent,
        by_state: byState,
        daily_trend: dailyTrend,
      },
    };
    setCache(cacheKey, result, CACHE_TTL);
    return jsonWithCache(result, 60, 120);
  } catch (err) {
    console.error("Retreaver revenue error:", err);
    const message = err instanceof Error ? err.message : "Failed to compute revenue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

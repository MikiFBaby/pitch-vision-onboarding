import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { jsonWithCache } from "@/utils/api-cache";

export const runtime = "nodejs";

interface LiveEvent {
  revenue: number;
  event_timestamp: string;
  converted: boolean | null;
  campaign_name: string | null;
  caller_state: string | null;
  connected_secs: number | null;
}

export async function GET() {
  try {
    // Use Eastern Time boundaries for "today" (business operates in ET)
    const nowUTC = new Date();
    const estOffset = getEasternOffset(nowUTC);
    const nowEST = new Date(nowUTC.getTime() + estOffset);
    const todayEST = nowEST.toISOString().slice(0, 10);

    // Convert ET midnight boundaries back to UTC for DB query
    const startUTC = new Date(`${todayEST}T00:00:00`);
    startUTC.setTime(startUTC.getTime() - estOffset);
    const endUTC = new Date(`${todayEST}T23:59:59`);
    endUTC.setTime(endUTC.getTime() - estOffset);

    // Paginate — PostgREST caps at 1000 rows per request
    const events: LiveEvent[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("retreaver_events")
        .select("revenue, event_timestamp, converted, campaign_name, caller_state, connected_secs")
        .gte("event_timestamp", startUTC.toISOString())
        .lt("event_timestamp", endUTC.toISOString())
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data || data.length === 0) break;
      events.push(...(data as LiveEvent[]));
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    let totalRevenue = 0;
    let convertedCount = 0;
    let totalConnectedSecs = 0;
    let connectedSecsCount = 0;
    const campaignMap = new Map<string, number>();

    for (const e of events) {
      const rev = Number(e.revenue) || 0;
      totalRevenue += rev;

      // Use actual converted boolean when available, fall back to revenue > 0
      const isConverted = e.converted != null ? e.converted : rev > 0;
      if (isConverted) convertedCount++;

      // Call duration
      if (e.connected_secs != null && e.connected_secs > 0) {
        totalConnectedSecs += e.connected_secs;
        connectedSecsCount++;
      }

      // Campaign aggregation
      if (e.campaign_name) {
        campaignMap.set(e.campaign_name, (campaignMap.get(e.campaign_name) || 0) + rev);
      }
    }

    const totalCalls = events.length;
    const avgPerCall = convertedCount > 0 ? totalRevenue / convertedCount : 0;
    const avgPerCallDiluted = totalCalls > 0 ? totalRevenue / totalCalls : 0;
    const avgCallDurationSecs = connectedSecsCount > 0 ? totalConnectedSecs / connectedSecsCount : null;

    // Top 3 campaigns by revenue
    const topCampaigns = Array.from(campaignMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([campaign, revenue]) => ({ campaign, revenue: Math.round(revenue * 100) / 100 }));

    // Compute calls per minute (based on time since first event today)
    let callsPerMinute = 0;
    if (events.length > 1) {
      const timestamps = events.map((e) => new Date(e.event_timestamp).getTime());
      const earliest = Math.min(...timestamps);
      const latest = Math.max(...timestamps);
      const spanMinutes = (latest - earliest) / 60000;
      if (spanMinutes > 0) {
        callsPerMinute = totalCalls / spanMinutes;
      }
    }

    return jsonWithCache({
      date: todayEST,
      today_revenue: Math.round(totalRevenue * 100) / 100,
      today_calls: totalCalls,
      converted: convertedCount,
      avg_per_call: Math.round(avgPerCall * 100) / 100,
      avg_per_call_diluted: Math.round(avgPerCallDiluted * 100) / 100,
      calls_per_minute: Math.round(callsPerMinute * 100) / 100,
      avg_call_duration_secs: avgCallDurationSecs != null ? Math.round(avgCallDurationSecs) : null,
      top_campaigns_today: topCampaigns,
    }, 15, 30);
  } catch (err) {
    console.error("Retreaver live error:", err);
    const message = err instanceof Error ? err.message : "Failed to fetch live data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Returns millisecond offset to convert UTC → Eastern (handles EST/EDT automatically) */
function getEasternOffset(date: Date): number {
  // Use Intl to detect if we're in EDT or EST
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
  const parts = fmt.formatToParts(date);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value;
  // EDT = UTC-4, EST = UTC-5
  return tzName === "EDT" ? -4 * 3600000 : -5 * 3600000;
}

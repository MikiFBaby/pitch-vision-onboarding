/**
 * Unified dialer adapter — queries both DialedIn and TLD performance tables.
 * Tagged by source so consumers can filter by dialer.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { DialerSource, UnifiedDialerPerformance } from "@/types/dialedin-types";

export async function getUnifiedPerformance(
  startDate: string,
  endDate: string,
  dialer: DialerSource = "all",
): Promise<UnifiedDialerPerformance[]> {
  const results: UnifiedDialerPerformance[] = [];

  if (dialer === "all" || dialer === "dialedin") {
    const { data } = await supabaseAdmin
      .from("dialedin_agent_performance")
      .select("report_date, agent_name, skill, dials, connects, transfers, hours_worked, tph")
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .order("report_date", { ascending: false });

    if (data) {
      results.push(
        ...data.map((d) => ({
          source: "dialedin" as const,
          report_date: d.report_date,
          agent_name: d.agent_name,
          team: d.skill || null,
          dials: d.dials || 0,
          connects: d.connects || 0,
          transfers: d.transfers || 0,
          hours_worked: d.hours_worked || 0,
          tph: d.tph || 0,
        })),
      );
    }
  }

  if (dialer === "all" || dialer === "tld") {
    const { data } = await supabaseAdmin
      .from("tld_agent_performance")
      .select("report_date, agent_name, team, dials, connects, transfers, hours_worked, tph")
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .order("report_date", { ascending: false });

    if (data) {
      results.push(
        ...data.map((d) => ({
          source: "tld" as const,
          report_date: d.report_date,
          agent_name: d.agent_name,
          team: d.team || null,
          dials: d.dials || 0,
          connects: d.connects || 0,
          transfers: d.transfers || 0,
          hours_worked: d.hours_worked || 0,
          tph: d.tph || 0,
        })),
      );
    }
  }

  return results;
}

export async function getUnifiedLiveStatuses(dialer: DialerSource = "all") {
  const statuses: Array<{ source: string; agent_name: string; current_status: string; current_campaign: string | null; status_since: string }> = [];

  if (dialer === "all" || dialer === "dialedin") {
    const { data } = await supabaseAdmin
      .from("dialedin_live_agent_status")
      .select("agent_name, current_status, current_campaign, status_since");
    if (data) {
      statuses.push(...data.map((d) => ({ source: "dialedin", ...d })));
    }
  }

  if (dialer === "all" || dialer === "tld") {
    const { data } = await supabaseAdmin
      .from("tld_live_agent_status")
      .select("agent_name, current_status, current_campaign, status_since");
    if (data) {
      statuses.push(...data.map((d) => ({ source: "tld", ...d })));
    }
  }

  return statuses;
}

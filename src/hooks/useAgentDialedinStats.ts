import useSWR from "swr";
import type { AgentPerformance, LiveAgentStatus } from "@/types/dialedin-types";

interface AgentAverages {
  tph: number;
  adjusted_tph: number | null;
  sla_hr: number;
  transfers: number;
  conversion_rate: number;
  connect_rate: number;
  hours_worked: number;
  dials: number;
  connects: number;
  utilization: number;
}

interface AgentTotals {
  transfers: number;
  dials: number;
  connects: number;
  hours_worked: number;
  days_worked: number;
}

interface UseAgentDialedinStatsReturn {
  latest: AgentPerformance | null;
  recentDays: AgentPerformance[];
  averages: AgentAverages | null;
  totals: AgentTotals | null;
  liveStatus: LiveAgentStatus | null;
  hasLiveData: boolean;
  loading: boolean;
  error: string | null;
}

interface StatsResponse {
  latest: AgentPerformance | null;
  recentDays: AgentPerformance[];
  averages: AgentAverages | null;
  totals: AgentTotals | null;
}

interface LiveResponse {
  live_status: LiveAgentStatus | null;
  has_live_data: boolean;
}

export function useAgentDialedinStats(
  agentName: string,
): UseAgentDialedinStatsReturn {
  const validName = agentName && agentName.trim().length >= 2;

  const statsKey = validName
    ? `/api/dialedin/agent-stats?name=${encodeURIComponent(agentName)}`
    : null;
  const liveKey = validName
    ? `/api/dialedin/agent-live?name=${encodeURIComponent(agentName)}`
    : null;

  const { data: statsData, isLoading, error: statsError } = useSWR<StatsResponse>(statsKey);

  const { data: liveData, error: liveError } = useSWR<LiveResponse>(liveKey, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });

  if (liveError) {
    console.warn("[useAgentDialedinStats] Live status fetch failed:", liveError);
  }

  return {
    latest: statsData?.latest ?? null,
    recentDays: statsData?.recentDays ?? [],
    averages: statsData?.averages ?? null,
    totals: statsData?.totals ?? null,
    liveStatus: liveData?.live_status ?? null,
    hasLiveData: liveData?.has_live_data ?? false,
    loading: isLoading,
    error: statsError ? (statsError instanceof Error ? statsError.message : "Unknown error") : null,
  };
}

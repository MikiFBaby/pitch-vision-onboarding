import { useRef } from "react";
import useSWR from "swr";
import type { LiveMetrics, LiveAgentStatus } from "@/types/dialedin-types";

interface LiveEvent {
  event_type: string;
  event_subtype: string | null;
  agent_name: string;
  campaign: string;
  event_timestamp: string;
}

interface UseLiveDataOptions {
  interval?: number;
  campaign?: string;
  enabled?: boolean;
}

interface UseLiveDataReturn {
  liveMetrics: LiveMetrics | null;
  agentStatuses: LiveAgentStatus[];
  recentEvents: LiveEvent[];
  hasLiveData: boolean;
  lastUpdated: Date | null;
}

interface LiveDataResponse {
  live_metrics: LiveMetrics | null;
  agent_statuses: LiveAgentStatus[];
  recent_events: LiveEvent[];
  has_live_data: boolean;
}

export function useLiveData({
  interval = 30000,
  campaign,
  enabled = true,
}: UseLiveDataOptions = {}): UseLiveDataReturn {
  const lastUpdatedRef = useRef<Date | null>(null);

  const params = new URLSearchParams();
  if (campaign) params.set("campaign", campaign);
  const qs = params.toString();
  const key = enabled ? `/api/dialedin/live${qs ? `?${qs}` : ""}` : null;

  const { data, error } = useSWR<LiveDataResponse>(key, {
    refreshInterval: interval,
    revalidateOnFocus: false,
    onSuccess: () => { lastUpdatedRef.current = new Date(); },
  });

  if (error) {
    console.warn("[useLiveData] Live data fetch failed:", error);
  }

  return {
    liveMetrics: data?.live_metrics ?? null,
    agentStatuses: data?.agent_statuses ?? [],
    recentEvents: data?.recent_events ?? [],
    hasLiveData: data?.has_live_data ?? false,
    lastUpdated: lastUpdatedRef.current,
  };
}

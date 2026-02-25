"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

export function useLiveData({
  interval = 30000,
  campaign,
  enabled = true,
}: UseLiveDataOptions = {}): UseLiveDataReturn {
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<LiveAgentStatus[]>([]);
  const [recentEvents, setRecentEvents] = useState<LiveEvent[]>([]);
  const [hasLiveData, setHasLiveData] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const initialFetchDone = useRef(false);

  const fetchLive = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;

    try {
      const params = new URLSearchParams();
      if (campaign) params.set("campaign", campaign);

      const res = await fetch(`/api/dialedin/live?${params.toString()}`);
      if (!res.ok) return;

      const data = await res.json();
      setLiveMetrics(data.live_metrics || null);
      setAgentStatuses(data.agent_statuses || []);
      setRecentEvents(data.recent_events || []);
      setHasLiveData(data.has_live_data || false);
      setLastUpdated(new Date());
    } catch {
      // Silently fail — live data is supplementary
    }
  }, [campaign]);

  useEffect(() => {
    if (!enabled) return;

    // Initial fetch
    if (!initialFetchDone.current) {
      initialFetchDone.current = true;
      fetchLive();
    }

    const id = setInterval(fetchLive, interval);
    return () => clearInterval(id);
  }, [enabled, interval, fetchLive]);

  return { liveMetrics, agentStatuses, recentEvents, hasLiveData, lastUpdated };
}

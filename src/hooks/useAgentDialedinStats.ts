"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { AgentPerformance, LiveAgentStatus } from "@/types/dialedin-types";

interface AgentAverages {
  tph: number;
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

export function useAgentDialedinStats(
  agentName: string,
): UseAgentDialedinStatsReturn {
  const [latest, setLatest] = useState<AgentPerformance | null>(null);
  const [recentDays, setRecentDays] = useState<AgentPerformance[]>([]);
  const [averages, setAverages] = useState<AgentAverages | null>(null);
  const [totals, setTotals] = useState<AgentTotals | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveAgentStatus | null>(null);
  const [hasLiveData, setHasLiveData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialFetchDone = useRef(false);

  // Fetch historical stats (one-time on mount)
  useEffect(() => {
    if (!agentName || agentName.trim().length < 2) {
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        const res = await fetch(
          `/api/dialedin/agent-stats?name=${encodeURIComponent(agentName)}`,
        );
        if (!res.ok) throw new Error("Failed to fetch agent stats");

        const data = await res.json();
        setLatest(data.latest || null);
        setRecentDays(data.recentDays || []);
        setAverages(data.averages || null);
        setTotals(data.totals || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [agentName]);

  // Poll live status (every 60s)
  const fetchLive = useCallback(async () => {
    if (!agentName || agentName.trim().length < 2) return;
    if (typeof document !== "undefined" && document.hidden) return;

    try {
      const res = await fetch(
        `/api/dialedin/agent-live?name=${encodeURIComponent(agentName)}`,
      );
      if (!res.ok) return;

      const data = await res.json();
      setLiveStatus(data.live_status || null);
      setHasLiveData(data.has_live_data || false);
    } catch {
      // Silently fail — live data is supplementary
    }
  }, [agentName]);

  useEffect(() => {
    if (!agentName || agentName.trim().length < 2) return;

    if (!initialFetchDone.current) {
      initialFetchDone.current = true;
      fetchLive();
    }

    const id = setInterval(fetchLive, 60000);
    return () => clearInterval(id);
  }, [agentName, fetchLive]);

  return {
    latest,
    recentDays,
    averages,
    totals,
    liveStatus,
    hasLiveData,
    loading,
    error,
  };
}

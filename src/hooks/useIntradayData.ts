"use client";

import { useEffect, useRef, useMemo } from "react";
import useSWR from "swr";
import { supabase } from "@/lib/supabase-client";
import type { IntradayData } from "@/types/dialedin-types";

interface UseIntradayDataOptions {
  agent?: string;
  team?: string;
  includeRank?: boolean;
  includeTrend?: boolean;
  includeEconomics?: boolean;
  interval?: number;
  enabled?: boolean;
}

interface UseIntradayDataReturn {
  data: IntradayData | null;
  loading: boolean;
  stale: boolean;
  error: string | null;
  lastFetched: Date | null;
  refetch: () => void;
}

let channelCounter = 0;

export function useIntradayData(options: UseIntradayDataOptions = {}): UseIntradayDataReturn {
  const {
    agent,
    team,
    includeRank = false,
    includeTrend = true,
    includeEconomics = false,
    interval = 300_000,
    enabled = true,
  } = options;

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelName = useRef(`intraday-rt-${++channelCounter}`);
  const lastFetchedRef = useRef<Date | null>(null);

  const key = useMemo(() => {
    if (!enabled) return null;
    const params = new URLSearchParams();
    if (agent) params.set("agent", agent);
    if (team) params.set("team", team);
    if (includeRank) params.set("include_rank", "true");
    if (!includeTrend) params.set("include_trend", "false");
    if (includeEconomics) params.set("include_economics", "true");
    const qs = params.toString();
    return `/api/dialedin/intraday${qs ? `?${qs}` : ""}`;
  }, [enabled, agent, team, includeRank, includeTrend, includeEconomics]);

  const { data, isLoading, error: swrError, mutate } = useSWR<IntradayData>(key, {
    refreshInterval: interval,
    revalidateOnFocus: true,
    onSuccess: () => { lastFetchedRef.current = new Date(); },
  });

  // Supabase Realtime subscription — triggers SWR revalidation when new snapshots land
  useEffect(() => {
    if (!enabled) return;

    const filterConfig: { event: "INSERT"; schema: "public"; table: string; filter?: string } = {
      event: "INSERT",
      schema: "public",
      table: "dialedin_intraday_snapshots",
    };

    if (agent) {
      filterConfig.filter = `agent_name=eq.${agent}`;
    }

    const channel = supabase
      .channel(channelName.current)
      .on("postgres_changes", filterConfig, () => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => mutate(), 3000);
      })
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(`[useIntradayData] Realtime subscription ${status}:`, err);
        }
      });

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      supabase.removeChannel(channel);
    };
  }, [enabled, agent, mutate]);

  return {
    data: data ?? null,
    loading: isLoading,
    stale: data?.stale ?? false,
    error: swrError ? (swrError instanceof Error ? swrError.message : "Unknown error") : null,
    lastFetched: lastFetchedRef.current,
    refetch: mutate,
  };
}

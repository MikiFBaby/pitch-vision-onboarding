"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase-client";
import type { IntradayData } from "@/types/dialedin-types";

interface UseIntradayDataOptions {
  agent?: string;
  team?: string;
  includeRank?: boolean;
  includeTrend?: boolean;
  interval?: number;   // fallback polling interval in ms (default 300_000 = 5 min)
  enabled?: boolean;   // whether to fetch/poll (default true)
}

interface UseIntradayDataReturn {
  data: IntradayData | null;
  loading: boolean;
  stale: boolean;
  lastFetched: Date | null;
  refetch: () => void;
}

export function useIntradayData(options: UseIntradayDataOptions = {}): UseIntradayDataReturn {
  const {
    agent,
    team,
    includeRank = false,
    includeTrend = true,
    interval = 300_000,    // 5 min fallback (realtime is primary)
    enabled = true,
  } = options;

  const [data, setData] = useState<IntradayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const initialFetchDone = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (agent) params.set("agent", agent);
    if (team) params.set("team", team);
    if (includeRank) params.set("include_rank", "true");
    if (!includeTrend) params.set("include_trend", "false");
    const qs = params.toString();
    return `/api/dialedin/intraday${qs ? `?${qs}` : ""}`;
  }, [agent, team, includeRank, includeTrend]);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    if (typeof document !== "undefined" && document.hidden) return;

    try {
      const res = await fetch(buildUrl());
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastFetched(new Date());
      }
    } catch (err) {
      console.error("[useIntradayData] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [buildUrl, enabled]);

  // Debounced refetch — scraper upserts 600+ rows per snapshot,
  // so we wait 3s after the first INSERT to batch them into one refetch.
  const debouncedRefetch = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchData();
    }, 3000);
  }, [fetchData]);

  // Initial fetch
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    if (!initialFetchDone.current) {
      initialFetchDone.current = true;
      fetchData();
    }
  }, [enabled, fetchData]);

  // Supabase Realtime subscription — triggers refetch when new snapshots land
  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel("intraday-snapshots-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dialedin_intraday_snapshots" },
        () => {
          debouncedRefetch();
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      supabase.removeChannel(channel);
    };
  }, [enabled, debouncedRefetch]);

  // Fallback polling (in case Realtime connection drops)
  useEffect(() => {
    if (!enabled || interval <= 0) return;

    const id = setInterval(fetchData, interval);
    return () => clearInterval(id);
  }, [enabled, interval, fetchData]);

  // Re-fetch when key params change
  useEffect(() => {
    if (initialFetchDone.current) {
      setLoading(true);
      fetchData();
    }
  }, [agent, team]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    data,
    loading,
    stale: data?.stale ?? false,
    lastFetched,
    refetch: fetchData,
  };
}

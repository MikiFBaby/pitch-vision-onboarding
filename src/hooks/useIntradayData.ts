"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase-client";
import type { IntradayData } from "@/types/dialedin-types";

interface UseIntradayDataOptions {
  agent?: string;
  team?: string;
  includeRank?: boolean;
  includeTrend?: boolean;
  includeEconomics?: boolean;
  interval?: number;   // fallback polling interval in ms (default 300_000 = 5 min)
  enabled?: boolean;   // whether to fetch/poll (default true)
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
    interval = 300_000,    // 5 min fallback (realtime is primary)
    enabled = true,
  } = options;

  const [data, setData] = useState<IntradayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const initialFetchDone = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const channelName = useRef(`intraday-rt-${++channelCounter}`);

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (agent) params.set("agent", agent);
    if (team) params.set("team", team);
    if (includeRank) params.set("include_rank", "true");
    if (!includeTrend) params.set("include_trend", "false");
    if (includeEconomics) params.set("include_economics", "true");
    const qs = params.toString();
    return `/api/dialedin/intraday${qs ? `?${qs}` : ""}`;
  }, [agent, team, includeRank, includeTrend, includeEconomics]);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    if (typeof document !== "undefined" && document.hidden) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(buildUrl(), { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastFetched(new Date());
        setError(null);
      } else {
        setError(`API returned ${res.status}`);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[useIntradayData] fetch error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
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

  // Initial fetch + reset when enabled transitions false→true
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      initialFetchDone.current = false;
      return;
    }

    if (!initialFetchDone.current) {
      initialFetchDone.current = true;
      setLoading(true);
      fetchData();
    }
  }, [enabled, fetchData]);

  // Supabase Realtime subscription — triggers refetch when new snapshots land
  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel(channelName.current)
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

  // Re-fetch when key params change — abort stale request
  useEffect(() => {
    if (initialFetchDone.current) {
      setLoading(true);
      fetchData();
    }
  }, [agent, team]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch when tab becomes visible (user returns from another tab)
  useEffect(() => {
    if (!enabled) return;

    const onVisibilityChange = () => {
      if (!document.hidden && initialFetchDone.current) {
        fetchData();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [enabled, fetchData]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  return {
    data,
    loading,
    stale: data?.stale ?? false,
    error,
    lastFetched,
    refetch: fetchData,
  };
}

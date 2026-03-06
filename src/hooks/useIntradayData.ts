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
  lastFetched: Date | null;
  refetch: () => void;
}

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
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const initialFetchDone = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTrendFetch = useRef<number>(0);
  const lastTrendData = useRef<IntradayData["hourly_trend"] | null>(null);
  const TREND_REUSE_MS = 3 * 60_000; // Reuse trend data for 3 min — trend only changes every 5 min (scraper interval)

  const buildUrl = useCallback((skipTrend?: boolean) => {
    const params = new URLSearchParams();
    if (agent) params.set("agent", agent);
    if (team) params.set("team", team);
    if (includeRank) params.set("include_rank", "true");
    if (skipTrend || !includeTrend) params.set("include_trend", "false");
    if (includeEconomics) params.set("include_economics", "true");
    const qs = params.toString();
    return `/api/dialedin/intraday${qs ? `?${qs}` : ""}`;
  }, [agent, team, includeRank, includeTrend, includeEconomics]);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    if (typeof document !== "undefined" && document.hidden) return;

    try {
      if (includeTrend) {
        const trendIsFresh = Date.now() - lastTrendFetch.current < TREND_REUSE_MS;

        // Phase 1: agents without trend (fast — server caches 1 min)
        const fastRes = await fetch(buildUrl(true));
        if (fastRes.ok) {
          const json = await fastRes.json();
          if (trendIsFresh && lastTrendData.current) {
            // Merge fresh agent data with existing trend to avoid refetching ~65K rows
            json.hourly_trend = lastTrendData.current;
          }
          setData(json);
          setLastFetched(new Date());
          setLoading(false);
        }

        // Phase 2: full data with trend — only if trend is stale
        if (!trendIsFresh) {
          const fullRes = await fetch(buildUrl());
          if (fullRes.ok) {
            const json = await fullRes.json();
            setData(json);
            setLastFetched(new Date());
            lastTrendFetch.current = Date.now();
            lastTrendData.current = json.hourly_trend || null;
          }
        }
      } else {
        const res = await fetch(buildUrl());
        if (res.ok) {
          const json = await res.json();
          setData(json);
          setLastFetched(new Date());
        }
      }
    } catch (err) {
      console.error("[useIntradayData] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [buildUrl, enabled, includeTrend]);

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

  // Re-fetch when key params change — reset trend cache since filters changed
  useEffect(() => {
    if (initialFetchDone.current) {
      lastTrendFetch.current = 0;
      lastTrendData.current = null;
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

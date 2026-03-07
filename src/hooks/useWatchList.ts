import useSWR from "swr";

interface WatchFlag {
  type: string;
  severity: "critical" | "warning" | "info" | "positive";
  label: string;
  detail: string;
}

export interface WatchAgent {
  name: string;
  sla_hr_14d_avg: number;
  sparkline: number[];
  flags: WatchFlag[];
  priority: number;
  sentiment: "positive" | "negative" | "mixed";
  last_coached_days_ago: number | null;
  qa_auto_fails_30d: number;
  consistency_score: number;
  trend_direction: "up" | "down" | "flat";
  decline_streak: number;
  hot_streak: number;
  team: string | null;
}

export interface WatchListData {
  agents: WatchAgent[];
  summary: { total: number; needs_attention: number; bright_spots: number };
}

interface UseWatchListOptions {
  team?: string;
  enabled?: boolean;
}

export function useWatchList(options: UseWatchListOptions = {}) {
  const { team, enabled = true } = options;

  const params = new URLSearchParams();
  if (team) params.set("team", team);
  const qs = params.toString();
  const key = enabled ? `/api/manager/watch-list${qs ? `?${qs}` : ""}` : null;

  const { data, isLoading, mutate } = useSWR<WatchListData>(key, {
    refreshInterval: 300_000,
  });

  return { data: data ?? null, loading: isLoading, refetch: mutate };
}

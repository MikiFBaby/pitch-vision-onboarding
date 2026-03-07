import useSWR from "swr";

interface YesterdayComparisonData {
    yesterday: {
        date: string;
        total_transfers: number;
        total_hours: number;
        avg_sla_hr: number;
        agent_count: number;
        qualified_count: number;
        top_agents: { name: string; sla_hr: number; transfers: number }[];
        bottom_agents: { name: string; sla_hr: number; transfers: number }[];
    };
    same_time_yesterday: {
        snapshot_hour: number;
        total_transfers: number;
        avg_sla_hr: number;
        agent_count: number;
    } | null;
    eod_projection: {
        hours_elapsed: number;
        hours_remaining: number;
        total_business_hours: number;
        confidence: "high" | "medium" | "low";
        historic_context?: {
            avg_daily_transfers_14d: number;
            dow_avg_transfers: number;
            dow_sample_count: number;
            yesterday_final_transfers: number;
            yesterday_same_time_transfers: number | null;
            avg_daily_agents_14d: number;
            hourly_completion_curve: { hour: number; pct_of_daily: number }[];
        };
    };
    agent_yesterday: Record<string, { sla_hr: number; transfers: number }>;
}

interface UseYesterdayComparisonOptions {
    team?: string;
    enabled?: boolean;
}

export function useYesterdayComparison(options: UseYesterdayComparisonOptions = {}) {
    const { team, enabled = true } = options;

    const params = new URLSearchParams();
    if (team) params.set("team", team);
    const qs = params.toString();
    const key = enabled ? `/api/manager/yesterday-comparison${qs ? `?${qs}` : ""}` : null;

    const { data, isLoading } = useSWR<YesterdayComparisonData>(key, {
        refreshInterval: 600_000,
    });

    return { data: data ?? null, loading: isLoading };
}

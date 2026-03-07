import useSWR from "swr";

interface RecentViolation {
    agent_name: string;
    type: string;
    date: string;
    severity: "critical" | "warning";
    source: "auto_fail" | "manual";
}

interface PerAgentQA {
    avg_score: number;
    auto_fail_count: number;
    pass_rate: number;
    total_calls: number;
    manual_violations: number;
}

export interface ManagerQAData {
    team_avg_score: number;
    team_pass_rate: number;
    total_auto_fails_7d: number;
    manual_violations_7d: number;
    total_calls: number;
    recent_violations: RecentViolation[];
    per_agent: Record<string, PerAgentQA>;
    trend: "up" | "down" | "stable";
}

interface UseManagerQAStatsOptions {
    team?: string;
    agentNames?: string[];
    days?: number;
    enabled?: boolean;
}

export function useManagerQAStats(options: UseManagerQAStatsOptions = {}) {
    const { team, agentNames, days = 30, enabled = true } = options;
    const agentNamesKey = agentNames?.join(",") || "";

    const params = new URLSearchParams();
    if (team) params.set("team", team);
    params.set("days", String(days));
    if (agentNamesKey) params.set("agents", agentNamesKey);
    const key = enabled ? `/api/manager/qa-summary?${params}` : null;

    const { data, isLoading, error } = useSWR<ManagerQAData>(key, {
        refreshInterval: 300_000,
    });

    if (error) {
        console.warn("[useManagerQAStats] fetch failed:", error);
    }

    return { data: data ?? null, loading: isLoading };
}

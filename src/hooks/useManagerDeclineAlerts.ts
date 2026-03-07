import useSWR from "swr";

export interface DeclineAlert {
    agent_name: string;
    team: string | null;
    consecutive_decline_days: number;
    tph_start: number;
    tph_end: number;
    drop_pct: number;
    sparkline: number[];
    severity: "critical" | "warning";
}

interface UseManagerDeclineAlertsOptions {
    team?: string;
    teamAgentNames?: string[];
    enabled?: boolean;
}

export function useManagerDeclineAlerts(options: UseManagerDeclineAlertsOptions = {}) {
    const { team, enabled = true } = options;

    const params = new URLSearchParams({ days: "7", min_consecutive: "3" });
    if (team) params.set("team", team);
    const key = enabled ? `/api/dialedin/decline-alerts?${params}` : null;

    const { data, isLoading, error } = useSWR<{ data: DeclineAlert[] }>(key, {
        refreshInterval: 600_000,
    });

    if (error) {
        console.warn("[useManagerDeclineAlerts] fetch failed:", error);
    }

    return { alerts: data?.data ?? [], loading: isLoading };
}

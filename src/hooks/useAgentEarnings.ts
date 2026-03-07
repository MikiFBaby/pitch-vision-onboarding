import useSWR from "swr";

export interface EarningsData {
  hourly_wage: number;
  currency: string;
  country: string | null;
  pay_period: { start: string; end: string };
  period_hours: number;
  period_paid_hours: number;
  period_earnings: number;
  period_transfers: number;
  period_days_worked: number;
  period_avg_sla_hr: number;
}

interface UseAgentEarningsReturn {
  data: EarningsData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAgentEarnings(agentName: string | undefined): UseAgentEarningsReturn {
  const key = agentName
    ? `/api/agent/earnings?agent=${encodeURIComponent(agentName)}`
    : null;

  const { data, isLoading, error, mutate } = useSWR<EarningsData>(key);

  return {
    data: data ?? null,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : "Unknown error") : null,
    refetch: mutate,
  };
}

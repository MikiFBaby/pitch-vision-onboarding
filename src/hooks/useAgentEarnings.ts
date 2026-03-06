"use client";

import { useState, useEffect, useCallback } from "react";

export interface EarningsData {
  hourly_wage_usd: number;
  country: string | null;
  pay_period: { start: string; end: string };
  period_hours: number;
  period_earnings_usd: number;
  period_days_worked: number;
}

interface UseAgentEarningsReturn {
  data: EarningsData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAgentEarnings(agentName: string | undefined): UseAgentEarningsReturn {
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!agentName) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/agent/earnings?agent=${encodeURIComponent(agentName)}`);
      if (res.ok) {
        setData(await res.json());
        setError(null);
      } else {
        setError(`API returned ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [agentName]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

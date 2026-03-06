"use client";

import { useState, useEffect, useCallback } from "react";

export interface CoachingCard {
  type: "strength" | "growth" | "challenge";
  title: string;
  body: string;
  metric?: string;
}

interface UseAgentCoachingReturn {
  cards: CoachingCard[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAgentCoaching(agentName: string | undefined): UseAgentCoachingReturn {
  const [cards, setCards] = useState<CoachingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!agentName) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/agent/coaching?agent=${encodeURIComponent(agentName)}`);
      if (res.ok) {
        const json = await res.json();
        setCards(json.cards || []);
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

  return { cards, loading, error, refetch: fetchData };
}

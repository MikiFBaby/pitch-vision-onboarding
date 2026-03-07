"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface CoachingEvent {
  id: string;
  agent_name: string;
  coach_name: string | null;
  event_date: string;
  event_type: string;
  notes: string | null;
  tags: string[];
  created_at: string;
}

export interface CoachingEventWithImpact extends CoachingEvent {
  impact?: {
    before_tph: number;
    after_tph: number;
    tph_delta: number;
    tph_pct_change: number;
  } | null;
}

interface UseCoachingLogOptions {
  team?: string;
  limit?: number;
  enabled?: boolean;
}

export function useCoachingLog(options: UseCoachingLogOptions = {}) {
  const { limit = 50, enabled = true } = options;
  const [events, setEvents] = useState<CoachingEventWithImpact[]>([]);
  const [loading, setLoading] = useState(true);
  const initialFetchDone = useRef(false);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch(`/api/dialedin/coaching?limit=${limit}`);
      if (!res.ok) return;
      const json = await res.json();
      const rawEvents: CoachingEvent[] = json.data || [];

      // Fetch impact for recent events (last 14 days)
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const recentEvents = rawEvents.filter(
        (e) => new Date(e.event_date) >= fourteenDaysAgo,
      );

      // Fetch impact in parallel for recent events (max 10)
      const impactPromises = recentEvents.slice(0, 10).map(async (e) => {
        try {
          const impactRes = await fetch(
            `/api/dialedin/coaching/impact?agent=${encodeURIComponent(e.agent_name)}&event_date=${e.event_date}`,
          );
          if (impactRes.ok) {
            const impactJson = await impactRes.json();
            return { id: e.id, impact: impactJson.impact || null };
          }
        } catch { /* skip */ }
        return { id: e.id, impact: null };
      });

      const impacts = await Promise.all(impactPromises);
      const impactMap = new Map(impacts.map((i) => [i.id, i.impact]));

      const enriched: CoachingEventWithImpact[] = rawEvents.map((e) => ({
        ...e,
        impact: impactMap.get(e.id) || null,
      }));

      setEvents(enriched);
    } catch (err) {
      console.error("[useCoachingLog] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [enabled, limit]);

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

  return { events, loading, refetch: fetchData };
}

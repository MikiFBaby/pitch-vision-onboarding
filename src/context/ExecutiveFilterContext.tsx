"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { DateRangePreset, DialerSource } from "@/types/dialedin-types";

interface ExecutiveFilterState {
  dateRange: DateRangePreset;
  startDate: string;
  endDate: string;
  campaign: string | null;
  agent: string | null;
  dialer: DialerSource;
}

interface ExecutiveFilterActions {
  setDateRange: (range: DateRangePreset) => void;
  setCustomDates: (start: string, end: string) => void;
  setCampaign: (campaign: string | null) => void;
  setAgent: (agent: string | null) => void;
  setDialer: (dialer: DialerSource) => void;
  resetFilters: () => void;
}

type ExecutiveFilterContextType = ExecutiveFilterState & ExecutiveFilterActions;

const ExecutiveFilterContext = createContext<ExecutiveFilterContextType | null>(null);

function getDateRangeFromPreset(preset: DateRangePreset): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().split("T")[0];

  switch (preset) {
    case "7d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { start: d.toISOString().split("T")[0], end };
    }
    case "14d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 13);
      return { start: d.toISOString().split("T")[0], end };
    }
    case "30d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return { start: d.toISOString().split("T")[0], end };
    }
    case "mtd": {
      return { start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, end };
    }
    case "ytd": {
      return { start: `${now.getFullYear()}-01-01`, end };
    }
    default:
      return { start: end, end };
  }
}

const DEFAULTS: ExecutiveFilterState = {
  dateRange: "mtd",
  ...getDateRangeFromPreset("mtd"),
  campaign: null,
  agent: null,
  dialer: "all",
};

export function ExecutiveFilterProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Initialize from URL params or defaults
  const initialRange = (searchParams.get("range") as DateRangePreset) || DEFAULTS.dateRange;
  const initialDates = searchParams.get("range") === "custom"
    ? { start: searchParams.get("start") || DEFAULTS.startDate, end: searchParams.get("end") || DEFAULTS.endDate }
    : getDateRangeFromPreset(initialRange);

  const [state, setState] = useState<ExecutiveFilterState>({
    dateRange: initialRange,
    startDate: initialDates.start,
    endDate: initialDates.end,
    campaign: searchParams.get("campaign") || null,
    agent: searchParams.get("agent") || null,
    dialer: (searchParams.get("dialer") as DialerSource) || "all",
  });

  const syncToURL = useCallback(
    (updates: Partial<ExecutiveFilterState>) => {
      const params = new URLSearchParams(searchParams.toString());
      const merged = { ...state, ...updates };

      if (merged.dateRange !== "mtd") params.set("range", merged.dateRange);
      else params.delete("range");

      if (merged.dateRange === "custom") {
        params.set("start", merged.startDate);
        params.set("end", merged.endDate);
      } else {
        params.delete("start");
        params.delete("end");
      }

      if (merged.campaign) params.set("campaign", merged.campaign);
      else params.delete("campaign");

      if (merged.agent) params.set("agent", merged.agent);
      else params.delete("agent");

      if (merged.dialer !== "all") params.set("dialer", merged.dialer);
      else params.delete("dialer");

      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, state, router, pathname],
  );

  const setDateRange = useCallback(
    (range: DateRangePreset) => {
      const dates = getDateRangeFromPreset(range);
      const updates = { dateRange: range, startDate: dates.start, endDate: dates.end };
      setState((s) => ({ ...s, ...updates }));
      syncToURL(updates);
    },
    [syncToURL],
  );

  const setCustomDates = useCallback(
    (start: string, end: string) => {
      const updates = { dateRange: "custom" as const, startDate: start, endDate: end };
      setState((s) => ({ ...s, ...updates }));
      syncToURL(updates);
    },
    [syncToURL],
  );

  const setCampaign = useCallback(
    (campaign: string | null) => {
      setState((s) => ({ ...s, campaign }));
      syncToURL({ campaign });
    },
    [syncToURL],
  );

  const setAgent = useCallback(
    (agent: string | null) => {
      setState((s) => ({ ...s, agent }));
      syncToURL({ agent });
    },
    [syncToURL],
  );

  const setDialer = useCallback(
    (dialer: DialerSource) => {
      setState((s) => ({ ...s, dialer }));
      syncToURL({ dialer });
    },
    [syncToURL],
  );

  const resetFilters = useCallback(() => {
    setState(DEFAULTS);
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  const value = useMemo(
    () => ({
      ...state,
      setDateRange,
      setCustomDates,
      setCampaign,
      setAgent,
      setDialer,
      resetFilters,
    }),
    [state, setDateRange, setCustomDates, setCampaign, setAgent, setDialer, resetFilters],
  );

  return (
    <ExecutiveFilterContext.Provider value={value}>{children}</ExecutiveFilterContext.Provider>
  );
}

export function useExecutiveFilters(): ExecutiveFilterContextType {
  const ctx = useContext(ExecutiveFilterContext);
  if (!ctx) throw new Error("useExecutiveFilters must be used within ExecutiveFilterProvider");
  return ctx;
}

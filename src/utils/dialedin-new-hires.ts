/**
 * DialedIn new hire detection utility.
 * A "new hire" is an agent with ≤5 lifetime shifts (distinct report_dates).
 * Uses Postgres RPC for efficient GROUP BY (PostgREST doesn't support GROUP BY).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCached, setCache } from "@/utils/dialedin-cache";

const CACHE_KEY = "new-hire-set";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch the set of new hire agent names (lowercase).
 * Cached for 5 minutes to avoid repeated RPC calls within the same request cycle.
 * Fails open (returns empty Set) if the RPC function doesn't exist yet.
 */
export async function fetchNewHireSet(
  supabase: SupabaseClient,
  maxShifts = 5,
): Promise<Set<string>> {
  const cacheKey = `${CACHE_KEY}:${maxShifts}`;
  const cached = getCached<string[]>(cacheKey);
  if (cached) return new Set(cached);

  const { data, error } = await supabase.rpc("get_new_hire_agents", {
    max_shifts: maxShifts,
  });

  if (error) {
    console.error("Failed to fetch new hire agents:", error.message);
    return new Set();
  }

  const names: string[] = (data || []).map(
    (row: { agent_name: string }) => row.agent_name.toLowerCase().trim(),
  );

  setCache(cacheKey, names, CACHE_TTL);
  return new Set(names);
}

/** Check if a given agent name is a new hire. */
export function isNewHireAgent(
  agentName: string,
  newHireSet: Set<string>,
): boolean {
  return newHireSet.has(agentName.toLowerCase().trim());
}

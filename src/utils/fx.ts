// CAD→USD exchange rate utility
// Fetches live rate from open.er-api.com, caches for 24 hours, falls back to hardcoded rate

const FALLBACK_CAD_TO_USD = 0.72;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let cachedRate: number | null = null;
let cachedAt = 0;

/**
 * Fetch the CAD→USD exchange rate.
 * Caches for 24 hours. Falls back to stale cache, then hardcoded 0.72.
 */
export async function getCadToUsdRate(): Promise<number> {
  if (cachedRate !== null && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedRate;
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/CAD", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`FX API returned ${res.status}`);
    const json = await res.json();
    const rate = json?.rates?.USD;
    if (typeof rate !== "number" || rate <= 0) throw new Error("Invalid rate");

    cachedRate = rate;
    cachedAt = Date.now();
    console.log(`FX: CAD→USD rate fetched: ${rate.toFixed(4)}`);
    return rate;
  } catch (err) {
    console.warn(
      `FX: API failed, using fallback:`,
      err instanceof Error ? err.message : err
    );
    // Prefer stale cached rate over hardcoded fallback
    if (cachedRate !== null) return cachedRate;
    return FALLBACK_CAD_TO_USD;
  }
}

/**
 * Convert a wage to USD based on employee country.
 * USA/null → pass through. Canada → multiply by CAD→USD rate.
 */
export function convertWageToUsd(
  wage: number,
  country: string | null | undefined,
  cadToUsdRate: number
): number {
  if (!country || country.toUpperCase() === "USA") return wage;
  if (country.toUpperCase() === "CANADA") return wage * cadToUsdRate;
  return wage; // Unknown country — assume USD
}

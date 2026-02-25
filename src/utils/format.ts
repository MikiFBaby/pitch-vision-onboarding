/** Format a dollar amount with K/M abbreviations */
export function fmt(n: number, decimals = 0): string {
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(decimals > 0 ? decimals : 1)}K`;
  return `$${n.toFixed(decimals)}`;
}

/** Format a number with locale separators */
export function num(n: number): string {
  return n.toLocaleString("en-US");
}

/** Format a number as a percentage */
export function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

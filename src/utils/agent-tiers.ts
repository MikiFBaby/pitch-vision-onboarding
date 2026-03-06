export interface TierDefinition {
  tier: number;
  name: string;
  minSlaHr: number;
  badge: string;
  color: string;
}

export const TIERS: TierDefinition[] = [
  { tier: 1, name: "Rookie",    minSlaHr: 0,   badge: "Bronze",   color: "amber"  },
  { tier: 2, name: "Performer", minSlaHr: 2.0, badge: "Silver",   color: "slate"  },
  { tier: 3, name: "Pro",       minSlaHr: 3.0, badge: "Gold",     color: "yellow" },
  { tier: 4, name: "Star",      minSlaHr: 4.0, badge: "Platinum", color: "cyan"   },
  { tier: 5, name: "Elite",     minSlaHr: 5.0, badge: "Diamond",  color: "violet" },
];

/** Get tier for a given 7-day avg SLA/hr */
export function getTier(avgSlaHr: number): TierDefinition {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (avgSlaHr >= TIERS[i].minSlaHr) return TIERS[i];
  }
  return TIERS[0];
}

/** Get next tier (or null if already Elite) */
export function getNextTier(currentTier: TierDefinition): TierDefinition | null {
  const idx = TIERS.findIndex((t) => t.tier === currentTier.tier);
  return idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
}

/** Progress to next tier as 0-1 fraction */
export function getTierProgress(avgSlaHr: number, currentTier: TierDefinition): number {
  const next = getNextTier(currentTier);
  if (!next) return 1;
  const range = next.minSlaHr - currentTier.minSlaHr;
  if (range <= 0) return 1;
  return Math.min(Math.max((avgSlaHr - currentTier.minSlaHr) / range, 0), 1);
}

/**
 * Compute hot streak: consecutive most-recent days where SLA/hr >= breakEven.
 * @param dailySlaHr - chronological order (most recent LAST)
 * @param breakEven - ACA: 2.5, Medicare: 3.5
 */
export function computeHotStreak(dailySlaHr: number[], breakEven: number): number {
  let streak = 0;
  for (let i = dailySlaHr.length - 1; i >= 0; i--) {
    if (dailySlaHr[i] >= breakEven) streak++;
    else break;
  }
  return streak;
}

/**
 * Compute QA streak: consecutive most-recent calls with score >= 80.
 * @param scores - chronological order (most recent LAST)
 */
export function computeQaStreak(scores: number[]): number {
  let streak = 0;
  for (let i = scores.length - 1; i >= 0; i--) {
    if (scores[i] >= 80) streak++;
    else break;
  }
  return streak;
}

/** Daily transfer target based on tier and expected shift hours */
export function getDailyTransferTarget(tier: TierDefinition, hoursExpected: number): number {
  const targetSlaHr = tier.tier <= 2 ? 2.5 : tier.tier <= 4 ? 3.5 : 5.0;
  return Math.ceil(targetSlaHr * hoursExpected);
}

/** Weekly earnings milestones (USD) */
export const WEEKLY_MILESTONES = [500, 750, 1000, 1250, 1500];

export function getNextMilestone(currentWeeklyEarnings: number): number | null {
  return WEEKLY_MILESTONES.find((m) => m > currentWeeklyEarnings) ?? null;
}

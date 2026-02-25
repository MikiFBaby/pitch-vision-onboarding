/**
 * Heatmap cell coloring for Bloomberg Terminal-style tables.
 * Returns Tailwind text color classes based on metric value.
 * TPH thresholds are campaign-specific (Medicare/WhatIF vs ACA).
 */

type HeatmapMetric = 'tph' | 'conversion' | 'connect' | 'utilization';

export type CampaignType = 'medicare' | 'whatif' | 'aca' | 'default';
export type PerformanceTier = 'red' | 'amber' | 'gray' | 'green';

// Campaign-specific TPH thresholds [red→amber, amber→gray, gray→green]
const TPH_THRESHOLDS: Record<CampaignType, [number, number, number]> = {
  medicare: [3.0, 3.5, 4.0],
  whatif:   [3.0, 3.5, 4.0],
  aca:     [2.5, 3.0, 3.5],
  default: [2.5, 3.0, 3.5],
};

// Non-TPH metric thresholds (unchanged)
const THRESHOLDS: Record<HeatmapMetric, [number, number, number]> = {
  tph:         [2.5, 3.0, 3.5], // default fallback, overridden by campaign-specific
  conversion:  [5,   10,  20],
  connect:     [3,   6,   10],
  utilization: [50,  70,  90],
};

function getThresholds(metric: HeatmapMetric, campaign?: CampaignType): [number, number, number] {
  if (metric === 'tph' && campaign) return TPH_THRESHOLDS[campaign];
  if (metric === 'tph') return TPH_THRESHOLDS.default;
  return THRESHOLDS[metric];
}

// Pilot verticals with no established performance metrics — skip tier coloring
const PILOT_CAMPAIGNS = ['hospital', 'meals', 'home care'];

/** Check if an agent is on a pilot campaign (no performance tiers).
 *  Checks both directory campaigns and DialedIn skill name. */
export function isPilotCampaign(campaigns: string[] | null | undefined, skill?: string | null): boolean {
  if (campaigns && campaigns.length > 0) {
    const joined = campaigns.join(' ').toLowerCase();
    if (PILOT_CAMPAIGNS.some(p => joined.includes(p))) return true;
  }
  if (skill) {
    const s = skill.toLowerCase();
    if (PILOT_CAMPAIGNS.some(p => s.includes(p))) return true;
  }
  return false;
}

/** Detect campaign type from employee_directory current_campaigns array */
export function detectCampaignType(campaigns: string[] | null | undefined): CampaignType {
  if (!campaigns || campaigns.length === 0) return 'default';
  const joined = campaigns.join(' ').toLowerCase();
  if (joined.includes('whatif') || joined.includes('what if')) return 'whatif';
  if (joined.includes('medicare')) return 'medicare';
  if (joined.includes('aca')) return 'aca';
  return 'default';
}

/** Get performance tier for a given TPH + campaign */
export function getPerformanceTier(tph: number, campaign?: CampaignType): PerformanceTier {
  const [low, mid, high] = campaign ? TPH_THRESHOLDS[campaign] : TPH_THRESHOLDS.default;
  if (tph < low) return 'red';
  if (tph < mid) return 'amber';
  if (tph < high) return 'gray';
  return 'green';
}

/** Dark theme (Bloomberg terminal) */
export function heatmapClass(value: number, metric: HeatmapMetric, campaign?: CampaignType): string {
  const [low, mid, high] = getThresholds(metric, campaign);
  if (value < low) return 'text-red-400';
  if (value < mid) return 'text-amber-400';
  if (value < high) return 'text-white/80';
  return 'text-emerald-400';
}

export function heatmapBg(value: number, metric: HeatmapMetric, campaign?: CampaignType): string {
  const [low, mid, high] = getThresholds(metric, campaign);
  if (value < low) return 'bg-red-500/10';
  if (value < mid) return 'bg-amber-500/10';
  if (value < high) return 'bg-transparent';
  return 'bg-emerald-500/10';
}

/** Light-theme variant for white-background UIs (e.g. HR profile drawer) */
export function heatmapClassLight(value: number, metric: HeatmapMetric, campaign?: CampaignType): string {
  const [low, mid, high] = getThresholds(metric, campaign);
  if (value < low) return 'text-red-600';
  if (value < mid) return 'text-amber-600';
  if (value < high) return 'text-gray-900';
  return 'text-emerald-600';
}

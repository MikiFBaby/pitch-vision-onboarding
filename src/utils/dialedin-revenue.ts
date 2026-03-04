/**
 * DialedIn revenue/campaign configuration.
 * Maps teams and subcampaigns (skills) to campaign types and revenue-per-transfer rates.
 *
 * Rates sourced from actual Retreaver billable data (Feb 2026):
 *   Jade ACA            → $10.50/transfer
 *   Medicare Aragon      → $7.00/transfer
 *   Elite FYM Medicare   → $7.00/transfer
 *   WhatIf Medicare      → $7.00/transfer
 *
 * Non-DialedIn Retreaver campaigns (routed separately, not in this table):
 *   ACA 1 / Moxxi / ACA 2         → $11.50/transfer
 *   Medicare Campaign A/B/C/D      → $11.00–$11.93/transfer
 *   TLD                            → $7.00/transfer
 *
 * Env overrides for quick changes without deploy:
 *   REVENUE_RATE_ACA      — ACA $/transfer (default 10.50)
 *   REVENUE_RATE_MEDICARE  — Medicare $/transfer (default 7.00)
 *   BREAK_EVEN_TPH_ACA     — ACA break-even transfers/hr (default 2.5)
 *   BREAK_EVEN_TPH_MEDICARE — Medicare break-even transfers/hr (default 3.5)
 */

export type CampaignType = "aca" | "medicare";

const TEAM_CAMPAIGN: Record<string, CampaignType> = {
  "Jade ACA Team": "aca",
  "Aragon Team A": "medicare",
  "Aragon Team B": "medicare",
  "Pitch Health - Medicare": "medicare",
  "WhatIf": "medicare",
  "TLD": "medicare",
  "Elite FYM": "medicare",
};

// Subcampaign (skill) → exact rate per transfer from Retreaver (Feb 2026)
// Key = lowercase DialedIn skill name, value = $/transfer
const SUBCAMPAIGN_RATE: Record<string, number> = {
  "jade aca": 10.50,
  "jade aca - singapore server": 10.50,
  "medicare aragon": 7.00,
  "whatif medicare": 7.00,
  "whatif": 7.00,
  "elite fym medicare": 7.00,
};

// Fallback campaign-type rates (used when skill isn't in SUBCAMPAIGN_RATE)
// Override via REVENUE_RATE_ACA / REVENUE_RATE_MEDICARE env vars
const REVENUE_PER_TRANSFER: Record<CampaignType, number> = {
  aca: Number(process.env.REVENUE_RATE_ACA) || 10.5,
  medicare: Number(process.env.REVENUE_RATE_MEDICARE) || 7.0,
};

// Break-even SLA/hr thresholds by campaign type
// Minimum transfers per paid hour to cover agent cost
// Override via BREAK_EVEN_TPH_ACA / BREAK_EVEN_TPH_MEDICARE env vars
export const BREAK_EVEN_TPH: Record<CampaignType, number> = {
  aca: Number(process.env.BREAK_EVEN_TPH_ACA) || 2.5,
  medicare: Number(process.env.BREAK_EVEN_TPH_MEDICARE) || 3.5,
};

/** Get the break-even TPH threshold for a team */
export function getBreakEvenTPH(team: string | null): number {
  const campaign = getCampaignType(team);
  return campaign ? BREAK_EVEN_TPH[campaign] : BREAK_EVEN_TPH.aca;
}

export function isExcludedTeam(team: string | null): boolean {
  if (!team) return false;
  return team.toLowerCase().includes('pitch health');
}

export function getCampaignType(team: string | null): CampaignType | null {
  if (!team) return null;
  // Check for partial match (e.g. "Pitch Health - ACA, Pitch Health - Medicare")
  for (const [key, campaign] of Object.entries(TEAM_CAMPAIGN)) {
    if (team.toLowerCase().includes(key.toLowerCase())) return campaign;
  }
  return null;
}

const PILOT_TEAMS = ['hospital', 'meals', 'home care', 'pitch meals'];

export function isPilotTeam(team: string | null): boolean {
  if (!team) return false;
  const lower = team.toLowerCase();
  return PILOT_TEAMS.some(p => lower.includes(p));
}

/**
 * Get revenue per transfer for a team/skill combination.
 * Checks subcampaign (skill) rate first for exact Retreaver-sourced rate,
 * then falls back to campaign-type rate from team name.
 */
export function getRevenuePerTransfer(team: string | null, skill?: string | null): number {
  if (isPilotTeam(team) || isPilotTeam(skill ?? null)) return 0;
  // Try exact subcampaign rate first
  if (skill) {
    const subcampaignRate = SUBCAMPAIGN_RATE[skill.toLowerCase()];
    if (subcampaignRate != null) return subcampaignRate;
  }
  // Fall back to campaign-type rate from team name
  const campaign = getCampaignType(team);
  if (!campaign) return 7.0; // Default to Medicare rate
  return REVENUE_PER_TRANSFER[campaign];
}

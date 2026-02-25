/**
 * DialedIn revenue/campaign configuration.
 * Maps teams to campaign types and revenue-per-transfer rates.
 */

export type CampaignType = "aca" | "medicare";

const EXCLUDED_TEAMS = ["Team A", "Team B", "Team Apollo"];

const TEAM_CAMPAIGN: Record<string, CampaignType> = {
  "Jade ACA Team": "aca",
  "Aragon Team A": "medicare",
  "Aragon Team B": "medicare",
  "Pitch Health - Medicare": "medicare",
  "WhatIf": "medicare",
  "TLD": "medicare",
  "Elite FYM": "medicare",
};

// Revenue per individual transfer — sourced from Retreaver billable rates (Feb 2026)
const REVENUE_PER_TRANSFER: Record<CampaignType, number> = {
  aca: 10.5,     // Jade ACA — $10.50/transfer
  medicare: 7.0, // Aragon, WhatIF, TLD, Elite FYM — $7.00/transfer
};

export function isExcludedTeam(team: string | null): boolean {
  if (!team) return false;
  const lower = team.toLowerCase();
  if (lower.includes('pitch health')) return true;
  return EXCLUDED_TEAMS.some((t) => t.toLowerCase() === lower);
}

export function getCampaignType(team: string | null): CampaignType | null {
  if (!team) return null;
  // Check for partial match (e.g. "Pitch Health - ACA, Pitch Health - Medicare")
  for (const [key, campaign] of Object.entries(TEAM_CAMPAIGN)) {
    if (team.toLowerCase().includes(key.toLowerCase())) return campaign;
  }
  return null;
}

export function getRevenuePerTransfer(team: string | null): number {
  const campaign = getCampaignType(team);
  if (!campaign) return 7.0; // Default to Medicare rate
  return REVENUE_PER_TRANSFER[campaign];
}

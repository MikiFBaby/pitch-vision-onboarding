// ---------------------------------------------------------------------------
// Shared campaign configuration
// Used by: EmployeeTable, EmployeeProfileDrawer, Send Message (Slack DM)
// ---------------------------------------------------------------------------

/**
 * Campaign → Manager(s) mapping.
 * Multiple managers are comma-separated.
 * Keep in sync with actual org chart — update when managers change.
 */
export const CAMPAIGN_MANAGERS: Record<string, string> = {
    'Medicare WhatIF': 'Aya Al-Edhari',
    'ACA': 'Melak Baban, Sonia Baldeo, Tabark L-Uwdi',
    'Medicare': 'Brad Sicat, David Nichols, Lucas Varela',
    'Home Care Michigan': 'Josh Prodan',
    'Home Care PA': 'Josh Prodan',
    'Home Care NY': 'Josh Prodan',
    'Hospital': 'Brad Sicat',
    'Pitch Meals': 'Brad Sicat',
};

/** Get comma-separated manager string for a set of campaigns */
export function getManagerForCampaigns(campaigns: string[] | null | undefined): string | null {
    if (!campaigns || campaigns.length === 0) return null;
    const managers = new Set<string>();
    for (const c of campaigns) {
        const m = CAMPAIGN_MANAGERS[c];
        if (m) managers.add(m);
    }
    return managers.size > 0 ? Array.from(managers).join(', ') : null;
}

/** Get flat array of unique individual manager names across all campaigns */
export function getAllManagerNames(): string[] {
    const managers = new Set<string>();
    for (const val of Object.values(CAMPAIGN_MANAGERS)) {
        for (const name of val.split(',')) {
            const trimmed = name.trim();
            if (trimmed) managers.add(trimmed);
        }
    }
    return Array.from(managers).sort();
}

/** Get individual manager names for a set of campaigns */
export function getManagerNamesForCampaigns(campaigns: string[] | null | undefined): string[] {
    if (!campaigns || campaigns.length === 0) return [];
    const managers = new Set<string>();
    for (const c of campaigns) {
        const m = CAMPAIGN_MANAGERS[c];
        if (m) {
            for (const name of m.split(',')) {
                const trimmed = name.trim();
                if (trimmed) managers.add(trimmed);
            }
        }
    }
    return Array.from(managers);
}

/** Reverse lookup: get campaigns managed by a given manager name */
export function getCampaignsForManager(managerName: string): string[] {
    const needle = managerName.toLowerCase().trim();
    const result: string[] = [];
    for (const [campaign, managers] of Object.entries(CAMPAIGN_MANAGERS)) {
        const names = managers.split(',').map(n => n.trim().toLowerCase());
        if (names.includes(needle)) result.push(campaign);
    }
    return result;
}

/**
 * Campaign name → DialedIn team substring mapping.
 * Used to filter the intraday API by team when showing manager-specific data.
 */
export const CAMPAIGN_TO_TEAM_SUBSTRING: Record<string, string> = {
    'ACA': 'jade aca',
    'Medicare': 'aragon',
    'Medicare WhatIF': 'whatif',
    'Home Care Michigan': 'home care michigan',
    'Home Care PA': 'home care pa',
    'Home Care NY': 'home care ny',
    'Hospital': 'hospital',
    'Pitch Meals': 'pitch meals',
};

/** Non-agent roles that appear in the Slack DM "HR & Leadership" dropdown groups */
export const LEADERSHIP_ROLES = ['HR', 'QA', 'C-Suite', 'Executive', 'Manager'] as const;

/** Check if a role is a leadership/staff role (non-Agent) */
export function isLeadershipRole(role: string | null | undefined): boolean {
    return !!role && (LEADERSHIP_ROLES as readonly string[]).includes(role);
}

/** Get DialedIn team filter string for a manager (comma-separated substrings) */
export function getTeamFilterForManager(managerName: string): string {
    const campaigns = getCampaignsForManager(managerName);
    const substrings = campaigns
        .map(c => CAMPAIGN_TO_TEAM_SUBSTRING[c])
        .filter(Boolean);
    return substrings.join(',');
}

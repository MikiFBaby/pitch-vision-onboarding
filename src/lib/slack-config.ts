// ---------------------------------------------------------------------------
// Shared Slack channel configuration
// Used by: events webhook, cron sync, terminate-employee route
// ---------------------------------------------------------------------------

export const CAMPAIGN_CHANNELS: Record<string, string> = {
    Medicare: 'C0A896J4JEM',
    ACA: 'C07A07ANCAG',
    'Medicare WhatIF': 'C06CDFV4ECR',
    'Home Care Michigan': 'C0A3AH1K56E',
    'Home Care PA': 'C09JRPT6HME',
    Hospital: 'C0AE4E14S8M',
    'Pitch Meals': 'C0AEWM51U90',
};

export const CAMPAIGN_CHANNEL_IDS = new Set(Object.values(CAMPAIGN_CHANNELS));

// Reverse lookup: channel ID → campaign name
export const CHANNEL_TO_CAMPAIGN: Record<string, string> = Object.fromEntries(
    Object.entries(CAMPAIGN_CHANNELS).map(([name, id]) => [id, name])
);

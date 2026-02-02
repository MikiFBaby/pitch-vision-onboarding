/**
 * HR Data Formatting Utilities
 * Ensures consistent output formatting across all HR dashboard components
 */

/**
 * Converts a string to Title Case
 * "JOHN DOE" → "John Doe"
 * "medicare aragon" → "Medicare Aragon"
 */
export function toTitleCase(str: string | null | undefined): string {
    if (!str) return '';
    return str
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
        .trim();
}

/**
 * Formats a date to consistent display format
 * Input can be: Date object, ISO string, or "D Mon YYYY" format
 * Output: "29 Jan 2026"
 */
export function formatDisplayDate(date: Date | string | null | undefined): string {
    if (!date) return '';

    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';

    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();

    return `${day} ${month} ${year}`;
}

/**
 * Parses DD/MM/YYYY format (common in HR sheets) to Date
 * "26/01/2026" → Date object
 */
export function parseDDMMYYYY(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;

    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
    const year = parseInt(parts[2], 10);

    const date = new Date(year, month, day);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Normalizes campaign names for consistent display
 */
export function normalizeCampaignName(name: string | null | undefined): string {
    if (!name) return 'Unknown';
    return toTitleCase(name.trim());
}

/**
 * Combines first and last name into full name with Title Case
 */
export function formatFullName(firstName: string | null | undefined, lastName: string | null | undefined): string {
    const first = toTitleCase(firstName);
    const last = toTitleCase(lastName);
    return `${first} ${last}`.trim();
}

// ============================================
// SHIFT PARSING & WEEKLY HOURS CALCULATION
// ============================================

// Days of the week for schedule parsing
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
export const ALL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

// Full-time threshold (30 hours/week for commission/bonus eligibility)
export const FULL_TIME_HOURS_THRESHOLD = 30;

/**
 * Parse a shift time string like "8:45 a.m - 6:00 p.m." and return duration in hours
 * Returns 0 for "OFF", empty, or invalid shifts
 */
export function parseShiftDuration(shift: string | null | undefined): number {
    if (!shift || typeof shift !== 'string') return 0;

    const trimmed = shift.trim().toLowerCase();
    if (trimmed === 'off' || trimmed === '' || trimmed === '-') return 0;

    // Match pattern: "8:45 a.m - 6:00 p.m." or similar variations
    const timePattern = /(\d{1,2}):?(\d{2})?\s*(a\.?m\.?|p\.?m\.?)\s*[-–]\s*(\d{1,2}):?(\d{2})?\s*(a\.?m\.?|p\.?m\.?)/i;
    const match = shift.match(timePattern);

    if (!match) return 0;

    const startHour = parseInt(match[1]);
    const startMinute = parseInt(match[2] || '0');
    const startPeriod = match[3].replace(/\./g, '').toLowerCase();
    const endHour = parseInt(match[4]);
    const endMinute = parseInt(match[5] || '0');
    const endPeriod = match[6].replace(/\./g, '').toLowerCase();

    // Convert to 24-hour format
    let start24 = startHour;
    if (startPeriod === 'pm' && startHour !== 12) start24 += 12;
    if (startPeriod === 'am' && startHour === 12) start24 = 0;

    let end24 = endHour;
    if (endPeriod === 'pm' && endHour !== 12) end24 += 12;
    if (endPeriod === 'am' && endHour === 12) end24 = 0;

    // Calculate duration in hours (decimal)
    const startDecimal = start24 + startMinute / 60;
    const endDecimal = end24 + endMinute / 60;

    let duration = endDecimal - startDecimal;
    if (duration < 0) duration += 24; // Handle overnight shifts

    return Math.round(duration * 100) / 100;
}

/**
 * Calculate total weekly hours for an agent from their schedule
 */
export function calculateWeeklyHours(agent: Record<string, any>, includeWeekends: boolean = false): number {
    const days = includeWeekends ? ALL_DAYS : WEEKDAYS;
    let totalHours = 0;
    for (const day of days) {
        totalHours += parseShiftDuration(agent[day]);
    }
    return Math.round(totalHours * 100) / 100;
}

/**
 * Determine if an agent qualifies as full-time (≥30 hours/week)
 */
export function isFullTime(agent: Record<string, any>): boolean {
    return calculateWeeklyHours(agent) >= FULL_TIME_HOURS_THRESHOLD;
}

/**
 * Categorize workforce by employment type (full-time vs part-time)
 */
export function categorizeWorkforce(agents: Record<string, any>[]): {
    fullTime: Record<string, any>[];
    partTime: Record<string, any>[];
    fullTimeCount: number;
    partTimeCount: number;
} {
    const fullTime: Record<string, any>[] = [];
    const partTime: Record<string, any>[] = [];

    for (const agent of agents) {
        const hours = calculateWeeklyHours(agent);
        const enriched = { ...agent, weeklyHours: hours };
        if (hours >= FULL_TIME_HOURS_THRESHOLD) {
            fullTime.push(enriched);
        } else {
            partTime.push(enriched);
        }
    }

    return { fullTime, partTime, fullTimeCount: fullTime.length, partTimeCount: partTime.length };
}

/**
 * Get the start and end dates for a given week
 */
export function getWeekDateRange(weekOffset: number = 0): {
    start: Date;
    end: Date;
    startStr: string;
    endStr: string;
    weekLabel: string;
} {
    const now = new Date();
    const currentDay = now.getDay();

    const monday = new Date(now);
    monday.setDate(now.getDate() - (currentDay === 0 ? 6 : currentDay - 1) + (weekOffset * 7));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    const formatLabel = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return {
        start: monday,
        end: sunday,
        startStr: formatDate(monday),
        endStr: formatDate(sunday),
        weekLabel: `${formatLabel(monday)} - ${formatLabel(sunday)}, ${monday.getFullYear()}`
    };
}

/**
 * Get today's date in ISO format (YYYY-MM-DD)
 */
export function getTodayISO(): string {
    return new Date().toISOString().split('T')[0];
}

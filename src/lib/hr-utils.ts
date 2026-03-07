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
 * Normalize schedule time strings for consistent display:
 * - Semicolons → colons ("3;45" → "3:45")
 * - Fix 12:xx AM → 12:xx PM (no shifts start at midnight)
 * - Normalize AM/PM format ("p.m." / "pm" → "PM")
 * - Ensure space before AM/PM ("3:45PM" → "3:45 PM")
 * - Consistent dash spacing ("3:45 PM-5:00 PM" → "3:45 PM - 5:00 PM")
 */
export function normalizeShiftTime(shift: string | null | undefined): string {
    if (!shift || typeof shift !== 'string') return shift || '';

    let s = shift;

    // Semicolons → colons (data entry typo)
    s = s.replace(/;/g, ':');

    // Fix 12:xx AM → 12:xx PM (no shifts start at midnight)
    s = s.replace(/\b(12:\d{2})\s*(a\.?\s*m\.?)/gi, '$1 PM');

    // Normalize AM/PM: strip dots, uppercase ("a.m." / "am" / "p.m." / "pm" → "AM" / "PM")
    s = s.replace(/\ba\.?\s*m\.?\b/gi, 'AM');
    s = s.replace(/\bp\.?\s*m\.?\b/gi, 'PM');

    // Ensure space before AM/PM ("3:45PM" → "3:45 PM")
    s = s.replace(/(\d)(AM|PM)/gi, '$1 $2');

    // Consistent dash spacing ("3:45 PM-5:00 PM" → "3:45 PM - 5:00 PM")
    s = s.replace(/\s*[-–]\s*/g, ' - ');

    return s;
}

/**
 * Parse a shift time string like "8:45 a.m - 6:00 p.m." and return duration in hours
 * Returns 0 for "OFF", empty, or invalid shifts
 */
export function parseShiftDuration(shift: string | null | undefined): number {
    if (!shift || typeof shift !== 'string') return 0;

    const trimmed = shift.trim().toLowerCase();
    if (trimmed === 'off' || trimmed === '' || trimmed === '-') return 0;

    // Normalize semicolons → colons before parsing (data entry typo: "3;45")
    const normalized = shift.replace(/;/g, ':');

    // Match pattern: "8:45 a.m - 6:00 p.m." or similar variations
    const timePattern = /(\d{1,2}):?(\d{2})?\s*(a\.?m\.?|p\.?m\.?)\s*[-–]\s*(\d{1,2}):?(\d{2})?\s*(a\.?m\.?|p\.?m\.?)/i;
    const match = normalized.match(timePattern);

    if (!match) return 0;

    const startHour = parseInt(match[1]);
    const startMinute = parseInt(match[2] || '0');
    const startPeriod = match[3].replace(/\./g, '').toLowerCase();
    const endHour = parseInt(match[4]);
    const endMinute = parseInt(match[5] || '0');
    const endPeriod = match[6].replace(/\./g, '').toLowerCase();

    // Convert to 24-hour format
    // Fix data entry error: 12:xx AM start is always a typo for 12:xx PM (no shifts start at midnight)
    const correctedStartPeriod = (startPeriod === 'am' && startHour === 12) ? 'pm' : startPeriod;
    let start24 = startHour;
    if (correctedStartPeriod === 'pm' && startHour !== 12) start24 += 12;
    if (correctedStartPeriod === 'am' && startHour === 12) start24 = 0;

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

// ============================================
// NAME MATCHING FOR SCHEDULE/BREAK CROSS-REFERENCE
// Google Sheets schedule data often uses shortened or variant names
// that don't exactly match employee_directory (e.g. middle names,
// hyphens, apostrophes, full-name-in-first-column).
// ============================================

/**
 * Strip common punctuation (apostrophes, periods, commas, backticks) from a name.
 */
function stripPunct(s: string): string {
    return s.replace(/['\u2019\u2018.,`]/g, '').trim();
}

/**
 * Collapse a string to lowercase letters only (no spaces, hyphens, punctuation).
 */
function collapseLetters(s: string): string {
    return s.replace(/[^a-z]/g, '');
}

/**
 * Strip common suffixes (Jr, Sr, II, III, etc.) from a name string.
 */
function stripSuffix(s: string): string {
    return s.replace(/\b(jr\.?|sr\.?|ii|iii|iv)\s*$/i, '').trim();
}

/**
 * Generate all plausible lookup keys for a person's name.
 * Used to cross-reference schedule/break data against employee directory.
 * Keys are pipe-separated "first|last" format, all lowercase.
 *
 * Handles:
 * - Multi-part first names / middle names ("Tanisha Elizabeth Ania"|"King" → "tanisha|king")
 * - Middle names stored in last_name ("Amanda"|"Rose Hoang" → "amanda|hoang")
 * - Hyphenated last names ("Brian"|"Johnson-Lennord" → "brian|lennord")
 * - Apostrophes/punctuation ("Jurnee'"|"Cason" → "jurnee|cason")
 * - Full name in first column ("Portia Washington"|"" → "portia|washington")
 * - Suffixes ("Luis"|"A Nieves Jr" → "luis|nieves")
 * - Name swap ("Davidson"|"Elie" → "elie|davidson")
 * - Short first name matching ("Alex"|"Rodney" also checks "alexander|rodney")
 */
export function scheduleNameKeys(firstName: string | null, lastName: string | null): string[] {
    const f = (firstName || '').trim().toLowerCase();
    const l = (lastName || '').trim().toLowerCase();
    if (!f && !l) return [];

    const keys = new Set<string>();

    // Exact normalized
    keys.add(`${f}|${l}`);

    // Stripped punctuation
    keys.add(`${stripPunct(f)}|${stripPunct(l)}`);

    // Collapsed (letters only)
    keys.add(`${collapseLetters(f)}|${collapseLetters(l)}`);

    const fParts = f.split(/\s+/).filter(Boolean);

    // First word of first name + last name (skips middle names in first_name)
    if (fParts.length > 1) {
        keys.add(`${fParts[0]}|${l}`);
        keys.add(`${stripPunct(fParts[0])}|${stripPunct(l)}`);
    }

    // Full name in first column, empty last name
    if (!l && fParts.length >= 2) {
        const lastWord = fParts[fParts.length - 1];
        keys.add(`${fParts[0]}|${lastWord}`);
        keys.add(`${stripPunct(fParts[0])}|${stripPunct(lastWord)}`);
    }

    // Hyphenated/compound last name → each part as separate key
    const lParts = l.split(/[\s-]+/).filter(p => p.length > 1);
    // Also keep ALL parts (including single-letter initials) for initial detection
    const lPartsAll = l.split(/[\s-]+/).filter(Boolean);
    if (lParts.length > 1) {
        const fKey = fParts[0] || f;
        for (const part of lParts) {
            keys.add(`${fKey}|${part}`);
            keys.add(`${stripPunct(fKey)}|${stripPunct(part)}`);
        }
    }

    // Middle names stored in last_name field ("Rose Hoang" → try just "Hoang")
    // Strip single-letter initials too ("A Nieves Jr" → "Nieves")
    if (lParts.length > 1) {
        const fKey = fParts[0] || f;
        const lastWord = lParts[lParts.length - 1];
        // Last word of last name (skip middle names and initials)
        const stripped = stripSuffix(lastWord);
        if (stripped.length > 1) {
            keys.add(`${fKey}|${stripped}`);
            keys.add(`${stripPunct(fKey)}|${stripPunct(stripped)}`);
        }
        // Also try second-to-last word if last word is a suffix
        if (lParts.length > 2) {
            const secondToLast = stripSuffix(lParts[lParts.length - 2]);
            if (secondToLast.length > 1) {
                keys.add(`${fKey}|${secondToLast}`);
            }
        }
    }

    // Suffix removal from last name ("Nieves Jr" → "Nieves")
    const lStripped = stripSuffix(l);
    if (lStripped !== l && lStripped.length > 1) {
        const fKey = fParts[0] || f;
        keys.add(`${fKey}|${lStripped}`);
        keys.add(`${stripPunct(fKey)}|${stripPunct(lStripped)}`);
        // Also strip middle initials from the suffix-stripped version
        const lStrippedParts = lStripped.split(/\s+/).filter(p => p.length > 1);
        if (lStrippedParts.length > 1) {
            const lastSignificant = lStrippedParts[lStrippedParts.length - 1];
            keys.add(`${fKey}|${lastSignificant}`);
        }
    }

    // Single-letter initial removal from last name ("C Whitney" → "Whitney", "A Nieves" → "Nieves")
    // Uses lPartsAll which preserves single-letter parts
    if (lPartsAll.length >= 2 && lPartsAll[0].length === 1) {
        const fKey = fParts[0] || f;
        const withoutInitial = lPartsAll.slice(1).join(' ');
        keys.add(`${fKey}|${withoutInitial}`);
        keys.add(`${fKey}|${stripSuffix(withoutInitial)}`);
    }

    // First name + first word of last name combined as compound first name
    // Handles: dir "Mir"|"Zariful Karim" matching sched "Mir-Zariful"|"Karim"
    if (lPartsAll.length >= 2) {
        const fKey = fParts[0] || f;
        const combinedFirst = `${fKey} ${lPartsAll[0]}`;
        const remainingLast = lPartsAll.slice(1).join(' ');
        const strippedLast = stripSuffix(remainingLast);
        // Space, hyphen, and collapsed variants
        keys.add(`${combinedFirst}|${strippedLast}`);
        keys.add(`${combinedFirst.replace(/\s+/g, '-')}|${strippedLast}`);
        keys.add(`${combinedFirst.replace(/\s+/g, '')}|${strippedLast}`);
    }

    // Name swap: first ↔ last (handles "Davidson Elie" in directory = "Elie Davidson" in schedule)
    if (f && l) {
        keys.add(`${l}|${f}`);
        keys.add(`${stripPunct(l)}|${stripPunct(f)}`);
        // Swap with first word only
        if (fParts.length > 1) {
            keys.add(`${l}|${fParts[0]}`);
        }
    }

    // Trailing-s tolerance (Barrow/Barrows, Williams/William)
    const fKey = fParts[0] || f;
    if (l.endsWith('s') && l.length > 3) {
        keys.add(`${fKey}|${l.slice(0, -1)}`);
    } else if (l.length > 2) {
        keys.add(`${fKey}|${l}s`);
    }

    // Short first name → try with common longer variants
    // Also: generate "first 3+ letters" prefix key for nickname tolerance
    if (f.length >= 3 && f.length <= 5) {
        // Add prefix-based key: match any schedule name starting with these letters
        // This is handled at lookup time, but we add the collapsed prefix key
        keys.add(`${collapseLetters(f)}|${collapseLetters(l)}`);
    }

    // Hyphen-space equivalence in first name ("Lisa-Ann" = "Lisa- ann" = "Lisa Ann")
    if (f.includes('-') || f.includes(' ')) {
        const normalized = f.replace(/[-\s]+/g, '-');
        const spaced = f.replace(/[-\s]+/g, ' ');
        const collapsed = f.replace(/[-\s]+/g, '');
        keys.add(`${normalized}|${l}`);
        keys.add(`${spaced}|${l}`);
        keys.add(`${collapsed}|${l}`);
        // Also try with stripped punctuation on both sides
        keys.add(`${stripPunct(normalized)}|${stripPunct(l)}`);
        keys.add(`${stripPunct(spaced)}|${stripPunct(l)}`);
    }

    // Period/dot in last name ("St.Louis" = "St Louis")
    if (l.includes('.')) {
        const dotless = l.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
        keys.add(`${fKey}|${dotless}`);
        keys.add(`${fKey}|${dotless.replace(/\s+/g, '')}`);
    }

    return [...keys].filter(k => k !== '|');
}

// ============================================
// DATA DEDUPLICATION
// Google Sheets → Supabase sync creates 2-3x
// duplicate rows. These helpers remove them.
// ============================================

/**
 * Generic row deduplication using a composite key function.
 * Keeps the first occurrence of each unique key.
 */
export function deduplicateRows<T = any>(rows: T[], keyFn: (row: T) => string): T[] {
    const seen = new Set<string>();
    return rows.filter(row => {
        const key = keyFn(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** Deduplicate HR Fired rows. Only counts complete rows (Name + Termination Date). */
export function deduplicateFired(rows: any[]): any[] {
    return deduplicateRows(
        rows.filter(r =>
            (r['Agent Name'] || '').trim() &&
            (r['Termination Date'] || '').trim()
        ),
        (r) => `${(r['Agent Name'] || '').trim().toLowerCase()}|${r['Termination Date'] || ''}`
    );
}

/** Deduplicate HR Hired rows. Only counts complete rows (Name + Hire Date). */
export function deduplicateHired(rows: any[]): any[] {
    return deduplicateRows(
        rows.filter(r =>
            (r['Agent Name'] || '').trim() &&
            (r['Hire Date'] || '').trim()
        ),
        (r) => `${(r['Agent Name'] || '').trim().toLowerCase()}|${r['Hire Date'] || ''}`
    );
}

/** Deduplicate Booked Days Off. Only counts complete rows (Name + Date). */
export function deduplicateBookedOff(rows: any[]): any[] {
    return deduplicateRows(
        rows.filter(r =>
            (r['Agent Name'] || '').trim() &&
            (r['Date'] || '').trim()
        ),
        (r) => `${(r['Agent Name'] || '').trim().toLowerCase()}|${r['Date'] || ''}`
    );
}

/** Deduplicate Non Booked Days Off. Only counts complete rows (Name + Reason + Date). */
export function deduplicateUnplannedOff(rows: any[]): any[] {
    return deduplicateRows(
        rows.filter(r =>
            (r['Agent Name'] || '').trim() &&
            (r['Reason'] || '').trim() &&
            (r['Date'] || '').trim()
        ),
        (r) => `${(r['Agent Name'] || '').trim().toLowerCase()}|${r['Date'] || ''}`
    );
}

/**
 * SSN (US) and SIN (Canada) validation, formatting, and masking utilities.
 *
 * - SSN: Format/range validation (no checksum exists)
 * - SIN: Luhn algorithm (mod-10 checksum)
 */

interface ValidationResult {
    valid: boolean;
    error?: string;
}

// ── SSN (United States) ─────────────────────────────────────────────────────

/**
 * Validate a US Social Security Number.
 * Rules:
 *   - Exactly 9 digits
 *   - Area (first 3): not 000, 666, or 900-999
 *   - Group (middle 2): not 00
 *   - Serial (last 4): not 0000
 */
export function validateSSN(ssn: string): ValidationResult {
    const digits = ssn.replace(/\D/g, "");

    if (digits.length !== 9) {
        return { valid: false, error: "SSN must be 9 digits" };
    }

    const area = parseInt(digits.substring(0, 3), 10);
    const group = parseInt(digits.substring(3, 5), 10);
    const serial = parseInt(digits.substring(5, 9), 10);

    if (area === 0) {
        return { valid: false, error: "Area number cannot be 000" };
    }
    if (area === 666) {
        return { valid: false, error: "Area number cannot be 666" };
    }
    if (area >= 900) {
        return { valid: false, error: "Area number cannot be 900-999" };
    }
    if (group === 0) {
        return { valid: false, error: "Group number cannot be 00" };
    }
    if (serial === 0) {
        return { valid: false, error: "Serial number cannot be 0000" };
    }

    return { valid: true };
}

/** Auto-format digits as XXX-XX-XXXX */
export function formatSSN(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, 9);
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/** Mask SSN to show only last 4 digits: ***-**-XXXX */
export function maskSSN(ssn: string): string {
    const digits = ssn.replace(/\D/g, "");
    if (digits.length < 4) return ssn;
    return `***-**-${digits.slice(-4)}`;
}

// ── SIN (Canada) ────────────────────────────────────────────────────────────

/**
 * Validate a Canadian Social Insurance Number using the Luhn algorithm.
 * Steps:
 *   1. Must be exactly 9 digits
 *   2. Double every 2nd digit (positions 2,4,6,8 — 1-indexed)
 *   3. If doubled value > 9, subtract 9
 *   4. Sum all digits
 *   5. Valid if sum % 10 === 0
 */
export function validateSIN(sin: string): ValidationResult {
    const digits = sin.replace(/\D/g, "");

    if (digits.length !== 9) {
        return { valid: false, error: "SIN must be 9 digits" };
    }

    let sum = 0;
    for (let i = 0; i < 9; i++) {
        let digit = parseInt(digits[i], 10);
        // Double every 2nd digit (0-indexed: positions 1, 3, 5, 7)
        if (i % 2 === 1) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
    }

    if (sum % 10 !== 0) {
        return { valid: false, error: "Invalid SIN (checksum failed)" };
    }

    return { valid: true };
}

/** Auto-format digits as XXX-XXX-XXX */
export function formatSIN(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, 9);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Mask SIN to show only last 3 digits: ***-***-XXX */
export function maskSIN(sin: string): string {
    const digits = sin.replace(/\D/g, "");
    if (digits.length < 3) return sin;
    return `***-***-${digits.slice(-3)}`;
}

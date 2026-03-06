/**
 * Shared role mapping utility.
 * Centralizes the mapping from employee_directory roles (HR Sheets) to app roles.
 * Used by: login, signup, bulk-invite, progress routes.
 */

export const APP_ROLES = ['agent', 'manager', 'qa', 'hr', 'executive', 'payroll'] as const;
export type AppRole = (typeof APP_ROLES)[number];

const EXECUTIVE_ROLES = ['owner', 'president', 'cto', 'head of operations', 'founder', 'ceo', 'caio'];
const HR_ROLES = ['head of hr', 'hr assistant', 'attendance assistant', 'payroll specialist'];
const QA_ROLES = ['head of qa', 'qa'];
const MANAGER_ROLES = ['manager - coach', 'team leader'];

/**
 * Maps an employee_directory role string to an app role.
 * The directory role comes from HR Sheets and can be any free-text string.
 */
export function mapDirectoryRoleToAppRole(directoryRole: string | null | undefined): AppRole {
    if (!directoryRole) return 'agent';
    const normalized = directoryRole.trim().toLowerCase();

    if (EXECUTIVE_ROLES.includes(normalized)) return 'executive';
    if (HR_ROLES.includes(normalized)) return 'hr';
    if (QA_ROLES.includes(normalized)) return 'qa';
    if (MANAGER_ROLES.includes(normalized)) return 'manager';
    return 'agent';
}

/** Display labels for each app role */
export const ROLE_LABELS: Record<AppRole, string> = {
    agent: 'Agent',
    manager: 'Manager',
    qa: 'QA',
    hr: 'HR',
    executive: 'Executive',
    payroll: 'Payroll',
};

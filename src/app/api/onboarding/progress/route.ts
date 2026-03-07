import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { mapDirectoryRoleToAppRole, APP_ROLES, type AppRole } from '@/lib/role-mapping';

// GET — Return onboarding progress stats for HR Launch Control (all roles)
export async function GET() {
    try {
        // Parallel queries: directory employees + signed-up users + access config
        const [directoryRes, usersRes, configRes] = await Promise.all([
            supabaseAdmin
                .from('employee_directory')
                .select('id, role, email, invite_sent_at, invite_status')
                .eq('employee_status', 'Active'),

            supabaseAdmin
                .from('users')
                .select('id, role, profile_completed')
                .eq('status', 'active'),

            supabaseAdmin
                .from('app_config')
                .select('key, value')
                .like('key', '%_portal_access'),
        ]);

        const employees = directoryRes.data || [];
        const users = usersRes.data || [];
        const configs = configRes.data || [];

        // Build per-role stats from directory
        type RoleStats = { active: number; invited: number; signedUp: number; completed: number; missingEmail: number };
        const byRole: Record<string, RoleStats> = {};
        for (const role of APP_ROLES) {
            byRole[role] = { active: 0, invited: 0, signedUp: 0, completed: 0, missingEmail: 0 };
        }

        // Count directory employees by mapped role
        for (const emp of employees) {
            const appRole = mapDirectoryRoleToAppRole(emp.role);
            byRole[appRole].active++;
            if (!emp.email) byRole[appRole].missingEmail++;
            if (emp.invite_sent_at) byRole[appRole].invited++;
        }

        // Count signed-up users by role (users table uses app role directly)
        const usersByRole: Record<string, { total: number; completed: number }> = {};
        for (const u of users) {
            const r = u.role || 'agent';
            if (!usersByRole[r]) usersByRole[r] = { total: 0, completed: 0 };
            usersByRole[r].total++;
            if (u.profile_completed) usersByRole[r].completed++;
        }

        for (const role of APP_ROLES) {
            byRole[role].signedUp = usersByRole[role]?.total || 0;
            byRole[role].completed = usersByRole[role]?.completed || 0;
        }

        // Global totals
        const totalActive = employees.length;
        const invited = employees.filter((e) => e.invite_sent_at).length;
        const signedUp = users.length;
        const completed = users.filter((u: any) => u.profile_completed).length;
        const missingEmail = employees.filter((e) => !e.email).length;

        // Access toggles per role
        const accessByRole: Record<string, boolean> = {};
        for (const role of APP_ROLES) {
            const row = configs.find((c) => c.key === `${role}_portal_access`);
            accessByRole[role] = row?.value === 'enabled';
        }

        return NextResponse.json({
            totalActive,
            invited,
            signedUp,
            completed,
            missingEmail,
            byRole,
            accessByRole,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// GET — Return onboarding progress stats for HR Launch Control
export async function GET() {
    try {
        // Parallel queries
        const [activeRes, invitedRes, signedUpRes, configRes] = await Promise.all([
            // Total active agents in employee directory
            supabaseAdmin
                .from('employee_directory')
                .select('id', { count: 'exact', head: true })
                .eq('employee_status', 'Active')
                .eq('role', 'Agent'),

            // Agents who received invite
            supabaseAdmin
                .from('employee_directory')
                .select('id', { count: 'exact', head: true })
                .eq('employee_status', 'Active')
                .eq('role', 'Agent')
                .not('invite_sent_at', 'is', null),

            // Agents who signed up + completed profile
            supabaseAdmin
                .from('users')
                .select('id, profile_completed')
                .eq('role', 'agent')
                .eq('status', 'active'),

            // Global access config
            supabaseAdmin
                .from('app_config')
                .select('value')
                .eq('key', 'agent_portal_access')
                .maybeSingle(),
        ]);

        const totalActive = activeRes.count || 0;
        const invited = invitedRes.count || 0;
        const signedUpUsers = signedUpRes.data || [];
        const signedUp = signedUpUsers.length;
        const completed = signedUpUsers.filter((u: any) => u.profile_completed).length;
        const globalAccess = configRes.data?.value === 'enabled';

        return NextResponse.json({
            totalActive,
            invited,
            signedUp,
            completed,
            globalAccess,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

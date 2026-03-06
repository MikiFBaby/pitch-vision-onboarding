import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { APP_ROLES } from '@/lib/role-mapping';

// GET — Return portal access state for all roles
export async function GET() {
    try {
        const { data, error } = await supabaseAdmin
            .from('app_config')
            .select('key, value')
            .like('key', '%_portal_access');

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const accessByRole: Record<string, boolean> = {};
        for (const role of APP_ROLES) {
            const row = data?.find((d) => d.key === `${role}_portal_access`);
            accessByRole[role] = row?.value === 'enabled';
        }

        return NextResponse.json({ accessByRole });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// POST — Toggle per-role access or per-user override
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action } = body;

        if (action === 'role_toggle') {
            const { role, value } = body; // role: 'agent' | 'manager' | etc., value: 'enabled' | 'disabled'
            if (!APP_ROLES.includes(role)) {
                return NextResponse.json({ error: `Invalid role. Must be one of: ${APP_ROLES.join(', ')}` }, { status: 400 });
            }
            if (!['enabled', 'disabled'].includes(value)) {
                return NextResponse.json({ error: 'Invalid value. Must be "enabled" or "disabled".' }, { status: 400 });
            }

            const configKey = `${role}_portal_access`;
            const { error } = await supabaseAdmin
                .from('app_config')
                .upsert({
                    key: configKey,
                    value: value,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key' });

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, role, enabled: value === 'enabled' });
        }

        // Legacy: keep backward-compat with 'global' action (maps to agent)
        if (action === 'global') {
            const { value } = body;
            if (!['enabled', 'disabled'].includes(value)) {
                return NextResponse.json({ error: 'Invalid value. Must be "enabled" or "disabled".' }, { status: 400 });
            }

            const { error } = await supabaseAdmin
                .from('app_config')
                .upsert({
                    key: 'agent_portal_access',
                    value: value,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key' });

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, globalAccess: value === 'enabled' });
        }

        if (action === 'per_user') {
            const { userId, override } = body; // override: 'granted' | 'blocked' | null
            if (!userId) {
                return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
            }
            if (override !== null && !['granted', 'blocked'].includes(override)) {
                return NextResponse.json({ error: 'Invalid override. Must be "granted", "blocked", or null.' }, { status: 400 });
            }

            const { error } = await supabaseAdmin
                .from('users')
                .update({ portal_access_override: override })
                .eq('id', userId);

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, userId, override });
        }

        return NextResponse.json({ error: 'Invalid action. Must be "role_toggle", "global", or "per_user".' }, { status: 400 });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

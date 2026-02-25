import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// GET — Return current global access state
export async function GET() {
    try {
        const { data, error } = await supabaseAdmin
            .from('app_config')
            .select('value')
            .eq('key', 'agent_portal_access')
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            globalAccess: data?.value === 'enabled'
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// POST — Toggle global access or per-agent override
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action } = body;

        if (action === 'global') {
            const { value } = body; // 'enabled' or 'disabled'
            if (!['enabled', 'disabled'].includes(value)) {
                return NextResponse.json({ error: 'Invalid value. Must be "enabled" or "disabled".' }, { status: 400 });
            }

            const { error } = await supabaseAdmin
                .from('app_config')
                .upsert({
                    key: 'agent_portal_access',
                    value: JSON.stringify(value),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key' });

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, globalAccess: value === 'enabled' });
        }

        if (action === 'per_agent') {
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

        return NextResponse.json({ error: 'Invalid action. Must be "global" or "per_agent".' }, { status: 400 });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

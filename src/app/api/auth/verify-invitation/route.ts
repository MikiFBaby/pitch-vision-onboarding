import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: Request) {
    try {
        const { token } = await req.json();

        if (!token) {
            return NextResponse.json({ valid: false, error: 'Token is required' }, { status: 400 });
        }

        // 1. Fetch invitation by token
        const { data: invitation, error } = await supabaseAdmin
            .from('invitations')
            .select('*')
            .eq('token', token)
            .single();

        if (error || !invitation) {
            return NextResponse.json({ valid: false, error: 'Invalid invitation token' });
        }

        // 2. Check if already used
        if (invitation.used) {
            return NextResponse.json({ valid: false, error: 'This invitation has already been used' });
        }

        // 3. Check if expired
        if (new Date(invitation.expires_at) < new Date()) {
            return NextResponse.json({ valid: false, error: 'This invitation has expired' });
        }

        // 4. Return invitation details (without token)
        return NextResponse.json({
            valid: true,
            invitation: {
                email: invitation.email,
                role: invitation.role,
                firstName: invitation.first_name,
                lastName: invitation.last_name
            }
        });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ valid: false, error: 'Internal server error' }, { status: 500 });
    }
}

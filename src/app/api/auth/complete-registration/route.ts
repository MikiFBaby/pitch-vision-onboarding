import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: Request) {
    try {
        const { token, firebaseUid } = await req.json();

        if (!token || !firebaseUid) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 1. Get and validate invitation
        const { data: invitation, error: tokenError } = await supabaseAdmin
            .from('invitations')
            .select('*')
            .eq('token', token)
            .single();

        if (tokenError || !invitation || invitation.used || new Date(invitation.expires_at) < new Date()) {
            return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 400 });
        }

        // 2. Create user record in Supabase
        const { data: user, error: userError } = await supabaseAdmin
            .from('users')
            .insert({
                firebase_uid: firebaseUid,
                email: invitation.email,
                role: invitation.role,
                first_name: invitation.first_name,
                last_name: invitation.last_name,
                team_id: invitation.team_id,
                profile_completed: true,
                status: 'active',
                last_login: new Date().toISOString()
            })
            .select()
            .single();

        if (userError) {
            console.error('Database Error:', userError);
            return NextResponse.json({ error: 'Failed to create user record' }, { status: 500 });
        }

        // 3. Mark invitation as used
        await supabaseAdmin
            .from('invitations')
            .update({
                used: true,
                used_at: new Date().toISOString()
            })
            .eq('id', invitation.id);

        return NextResponse.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                firstName: user.first_name,
                lastName: user.last_name
            }
        });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

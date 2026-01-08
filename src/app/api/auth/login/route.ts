import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: Request) {
    try {
        const { firebaseUid, email } = await req.json();

        if (!firebaseUid) {
            return NextResponse.json({ error: 'Firebase UID is required' }, { status: 400 });
        }

        // 1. Fetch existing user
        let { data: user, error: fetchError } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('firebase_uid', firebaseUid)
            .maybeSingle();

        if (fetchError) {
            console.error('Supabase Fetch Error:', fetchError);
            return NextResponse.json({ success: false, error: 'Database fetch failed' }, { status: 500 });
        }

        // 2. Create if missing
        if (!user) {
            const { data: newUser, error: createError } = await supabaseAdmin
                .from('users')
                .insert({
                    firebase_uid: firebaseUid,
                    email: email || '',
                    status: 'active',
                })
                .select('*')
                .single();

            if (createError) {
                console.error('Supabase Create Error:', createError);
                return NextResponse.json({ success: false, error: 'Failed to create user profile' }, { status: 500 });
            }
            user = newUser;
        }

        // 2. Update last login
        await supabaseAdmin
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', user.id);

        // 3. Determine redirect path based on role
        const redirectTo = user.profile_completed ? `/${user.role}` : '/onboarding';

        return NextResponse.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                status: user.status,
                profileCompleted: user.profile_completed,
                first_name: user.first_name,
                last_name: user.last_name,
                avatar_url: user.avatar_url
            },
            redirectTo
        });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

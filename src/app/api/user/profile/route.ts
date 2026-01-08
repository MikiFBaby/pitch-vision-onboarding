import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: Request) {
    try {
        const { firebaseUid, email, firstName, lastName, bio, interests, avatarUrl, role } = await req.json();

        if (!firebaseUid) {
            return NextResponse.json({ error: 'Missing user identification' }, { status: 400 });
        }

        console.log('Profile Update Payload:', {
            firebaseUid,
            email,
            firstName,
            lastName,
            role,
            avatarUrlSize: avatarUrl?.length
        });

        const updateData: any = {
            firebase_uid: firebaseUid,
            profile_completed: true
        };

        if (email !== undefined) updateData.email = email;
        if (firstName !== undefined) updateData.first_name = firstName;
        if (lastName !== undefined) updateData.last_name = lastName;
        if (bio !== undefined) updateData.bio = bio;
        if (interests !== undefined) updateData.interests = interests;
        if (avatarUrl !== undefined) updateData.avatar_url = avatarUrl;
        if (role !== undefined) updateData.role = role;

        const { data, error } = await supabaseAdmin
            .from('users')
            .upsert(updateData, { onConflict: 'firebase_uid' })
            .select()
            .single();

        if (error) {
            console.error('Supabase Profile Update Error:', error);
            return NextResponse.json({
                error: `Failed to update profile: ${error.message}`,
                details: error.hint || error.details
            }, { status: 500 });
        }

        console.log('Profile Update Success:', { id: data.id, firstName: data.first_name });
        return NextResponse.json({ success: true, user: data });

    } catch (error) {
        console.error('Profile API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

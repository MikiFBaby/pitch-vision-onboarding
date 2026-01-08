```typescript
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: Request) {
    try {
        const { firebaseUid, email, firstName, lastName, nickname, bio, interests, avatarUrl, role } = await req.json();

        // Validate required fields
        if (!firebaseUid || !email) {
            return NextResponse.json({ error: 'Missing identifier' }, { status: 400 });
        }

        console.log('Profile Update Payload:', {
            firebaseUid,
            email,
            firstName,
            lastName,
            nickname, // Added nickname to log
            role,
            avatarUrlSize: avatarUrl?.length
        });

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
                error: `Failed to update profile: ${ error.message } `,
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

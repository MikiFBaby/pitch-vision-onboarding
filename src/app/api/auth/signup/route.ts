import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: Request) {
    try {
        const { firebaseUid, email, firstName, lastName, role } = await req.json();

        if (!firebaseUid || !email) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 1. Check if user already exists
        const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('firebase_uid', firebaseUid)
            .single();

        if (existingUser) {
            return NextResponse.json({ success: true, message: 'User already exists', user: existingUser });
        }

        // 2. Check for "Directory Match" (Smart Enrollment)
        const { data: directoryMatch, error: dirError } = await supabaseAdmin
            .from('employee_directory')
            .select('*')
            .eq('email_address', email)
            .maybeSingle(); // Use maybeSingle to avoid 406 on no match

        let finalRole = role || 'agent';
        let finalFirstName = firstName || '';
        let finalLastName = lastName || '';
        let directoryId = null;

        if (directoryMatch) {
            console.log(`Found Directory Match for ${email}:`, directoryMatch);
            // Override with official data
            // Override with official data
            const directoryRole = directoryMatch.role ? directoryMatch.role.toLowerCase() : '';

            // Map Directory Role to App Role
            if (['owner', 'president', 'cto', 'head of operations'].includes(directoryRole)) {
                finalRole = 'executive';
            } else if (['head of hr', 'hr assistant', 'attendance assistant'].includes(directoryRole)) {
                finalRole = 'hr';
            } else if (['head of qa', 'qa'].includes(directoryRole)) {
                finalRole = 'qa';
            } else if (['manager - coach', 'team leader'].includes(directoryRole)) {
                finalRole = 'manager';
            } else if (['payroll specialist'].includes(directoryRole)) {
                finalRole = 'payroll';
            } else {
                finalRole = 'agent'; // Default fallthrough for 'agent' and unknown
            }

            finalFirstName = directoryMatch.first_name || finalFirstName;
            finalLastName = directoryMatch.last_name || finalLastName;
            directoryId = directoryMatch.id;

            // Link Firebase UID to Directory
            await supabaseAdmin
                .from('employee_directory')
                .update({ firebase_uid: firebaseUid })
                .eq('id', directoryMatch.id);
        } else {
            console.log(`No Directory Match for ${email}. Creating standard user.`);
        }

        // Determine Avatar URL (Priority: Directory > Google/Firebase > Default)
        const finalAvatarUrl = directoryMatch?.user_image || (req.headers.get('x-user-photo') || null);

        // 3. Create user in Supabase (public.users)
        const { data: newUser, error } = await supabaseAdmin
            .from('users')
            .insert({
                firebase_uid: firebaseUid,
                email,
                first_name: finalFirstName,
                last_name: finalLastName,
                role: finalRole,
                avatar_url: finalAvatarUrl,
                status: 'active',
                profile_completed: !!(finalFirstName && finalLastName),
                employee_id: directoryId // Store the link if it exists
            })
            .select()
            .single();

        if (error) {
            console.error('Supabase Create User Error:', error);
            return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            user: newUser,
            linkedToDirectory: !!directoryId
        });

    } catch (error) {
        console.error('Signup API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

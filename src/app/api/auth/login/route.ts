import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: Request) {
    try {
        const { firebaseUid, email, photoUrl } = await req.json();

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
            // 1.5 Check if user exists by email (to preventing duplicates on re-registration)
            const { data: existingUser } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('email', email)
                .maybeSingle();

            if (existingUser) {
                console.log(`[Login] Found existing user by email ${email}. Linking new UID.`);
                // Update the existing user with the new Firebase UID
                const { data: updatedUser, error: linkError } = await supabaseAdmin
                    .from('users')
                    .update({
                        firebase_uid: firebaseUid,
                        last_login: new Date().toISOString()
                    })
                    .eq('id', existingUser.id)
                    .select()
                    .single();

                if (!linkError) {
                    user = updatedUser;
                }
            }
        }

        if (!user) {
            // Check for "Directory Match" (Smart Enrollment)
            const { data: directoryMatch } = await supabaseAdmin
                .from('employee_directory')
                .select('*')
                .ilike('email', email) // Case-insensitive match
                .maybeSingle();

            let finalRole = 'agent';
            let finalFirstName = '';
            let finalLastName = '';
            let directoryId = null;

            if (directoryMatch) {
                console.log(`[Login] Found Directory Match for ${email}`);
                console.log(`[Login] Found Directory Match for ${email}`);

                const directoryRole = directoryMatch.role ? directoryMatch.role.toLowerCase() : '';

                // Map Directory Role to App Role
                const normalizedRole = directoryRole.trim().toLowerCase();
                console.log(`[Login] Mapping Directory Role: "${directoryRole}" -> Normalized: "${normalizedRole}"`);

                if (['owner', 'president', 'cto', 'head of operations', 'founder', 'ceo'].includes(normalizedRole)) {
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
                    finalRole = 'agent';
                }

                finalFirstName = directoryMatch.first_name || '';
                finalLastName = directoryMatch.last_name || '';
                directoryId = directoryMatch.id;

                // Sync UID specific to directory
                await supabaseAdmin
                    .from('employee_directory')
                    .update({ firebase_uid: firebaseUid })
                    .eq('id', directoryMatch.id);
            }

            // Determine Avatar URL (Priority: Directory > Google/Firebase > Default)
            const finalAvatarUrl = directoryMatch?.user_image || photoUrl || null;

            // 3. Create user in Supabase
            const { data: newUser, error: createError } = await supabaseAdmin
                .from('users')
                .insert({
                    firebase_uid: firebaseUid,
                    email: email || '',
                    first_name: finalFirstName,
                    last_name: finalLastName,
                    role: finalRole,
                    avatar_url: finalAvatarUrl,
                    status: 'active',
                    profile_completed: !!(finalFirstName && finalLastName),
                    employee_id: directoryId
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

        // 3. Determine admin status (CTO, executives with specific emails get universal access)
        const adminEmails = ['miki@pitchperfectsolutions.net'];
        const adminRoles = ['executive']; // CTO, CEO, President all map to 'executive'
        const isAdmin = adminEmails.includes(user.email?.toLowerCase()) || adminRoles.includes(user.role);

        // 4. Compute portal access for agents (global toggle + per-agent override)
        let portalAccess = true;
        if (user.role === 'agent' && !isAdmin) {
            if (user.portal_access_override === 'granted') {
                portalAccess = true;
            } else if (user.portal_access_override === 'blocked') {
                portalAccess = false;
            } else {
                // Check global config
                const { data: config } = await supabaseAdmin
                    .from('app_config')
                    .select('value')
                    .eq('key', 'agent_portal_access')
                    .maybeSingle();
                portalAccess = config?.value === 'enabled';
            }
        }

        // 5. Determine redirect path
        let redirectTo: string;
        if (!user.profile_completed) {
            redirectTo = '/onboarding';
        } else if (portalAccess) {
            redirectTo = `/${user.role}`;
        } else {
            redirectTo = '/onboarding/complete';
        }

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
                avatar_url: user.avatar_url,
                is_admin: isAdmin,
                portal_access: portalAccess,
            },
            redirectTo
        });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

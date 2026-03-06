import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { mapDirectoryRoleToAppRole } from '@/lib/role-mapping';

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

                finalRole = mapDirectoryRoleToAppRole(directoryMatch.role);
                console.log(`[Login] Mapping Directory Role: "${directoryMatch.role}" -> App Role: "${finalRole}"`);

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
                    profile_completed: false,
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

        // 3. Determine admin status (only specific emails get universal access)
        const adminEmails = ['miki@pitchperfectsolutions.net'];
        const isAdmin = adminEmails.includes(user.email?.toLowerCase());

        // 4. Compute portal access for ALL roles (global toggle + per-user override)
        let portalAccess = true;
        if (!isAdmin) {
            if (user.portal_access_override === 'granted') {
                portalAccess = true;
            } else if (user.portal_access_override === 'blocked') {
                portalAccess = false;
            } else {
                // Check role-specific config
                const configKey = `${user.role}_portal_access`;
                const { data: config } = await supabaseAdmin
                    .from('app_config')
                    .select('value')
                    .eq('key', configKey)
                    .maybeSingle();
                portalAccess = config?.value === 'enabled';
            }
        }

        // 5. Determine redirect path
        let redirectTo: string;
        if (!user.profile_completed) {
            redirectTo = '/onboarding';
        } else if (portalAccess) {
            // Restricted HR users land on their first allowed page
            if (user.role === 'hr' && user.hr_permissions?.allowed_pages?.length) {
                redirectTo = `/hr/${user.hr_permissions.allowed_pages[0]}`;
            } else {
                redirectTo = `/${user.role}`;
            }
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
                hr_permissions: user.hr_permissions || null,
            },
            redirectTo
        });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

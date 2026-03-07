import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { mapDirectoryRoleToAppRole } from '@/lib/role-mapping';

export async function POST(req: Request) {
    try {
        const { firebaseUid, email, firstName, lastName, role, phone } = await req.json();

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
            .ilike('email', email) // Case-insensitive match (consistent with login route)
            .maybeSingle();

        let finalRole = role || 'agent';
        let finalFirstName = firstName || '';
        let finalLastName = lastName || '';
        let directoryId = null;

        if (directoryMatch) {
            console.log(`Found Directory Match for ${email}:`, directoryMatch);
            finalRole = mapDirectoryRoleToAppRole(directoryMatch.role);

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

        // 3. Create or Update user in Supabase (public.users)
        // Use upsert to handle cases where the user might already exist (e.g. race condition or previous cleanup failure)
        const { data: newUser, error } = await supabaseAdmin
            .from('users')
            .upsert({
                firebase_uid: firebaseUid,
                email,
                first_name: finalFirstName,
                last_name: finalLastName,
                role: finalRole,
                avatar_url: finalAvatarUrl,
                status: 'active',
                profile_completed: false, // Always false — set to true only after onboarding wizard completes
                employee_id: directoryId, // Store the link if it exists
                ...(phone ? { phone } : {})
            }, { onConflict: 'firebase_uid' })
            .select()
            .single();

        if (error) {
            console.error('Supabase Create User Error:', error);
            return NextResponse.json({
                error: `Failed to create user profile: ${error.message}`,
                details: error.details,
                hint: error.hint
            }, { status: 500 });
        }

        // Sync phone to employee_directory if linked
        if (phone && directoryId) {
            await supabaseAdmin
                .from('employee_directory')
                .update({ phone })
                .eq('id', directoryId);
        }

        // Notify Slack onboarding channel about new registration
        const channelId = process.env.SLACK_ONBOARDING_CHANNEL_ID;
        const samToken = process.env.SLACK_ONBOARDING_BOT_TOKEN;
        if (channelId) {
            try {
                const { postSlackMessage } = await import('@/utils/slack-helpers');
                const fullName = `${finalFirstName} ${finalLastName}`.trim() || 'Unknown';
                await postSlackMessage(channelId,
                    `New registration: *${fullName}* (${email}) — ${finalRole}`,
                    [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: `:new: *New Registration*\n*Name:* ${fullName}\n*Email:* ${email}\n*Role:* ${finalRole}\n*Directory Match:* ${directoryId ? 'Yes' : 'No'}`
                            }
                        }
                    ],
                    samToken
                );
            } catch (err) {
                console.error('[Signup] Slack notification failed:', err);
            }
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

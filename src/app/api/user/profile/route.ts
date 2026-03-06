import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: Request) {
    try {
        const { firebaseUid, email, firstName, lastName, nickname, phone, bio, interests, avatarUrl } = await req.json();

        // Validate required fields
        if (!firebaseUid || !email) {
            return NextResponse.json({ error: 'Missing identifier' }, { status: 400 });
        }
        if (!phone || !phone.trim()) {
            return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
        }

        console.log('Profile Update Payload:', {
            firebaseUid,
            email,
            firstName,
            lastName,
            nickname,
            avatarUrlSize: avatarUrl?.length
        });

        const updateData: any = {
            firebase_uid: firebaseUid,
            profile_completed: true
        };

        if (email !== undefined) updateData.email = email;
        if (firstName !== undefined) updateData.first_name = firstName;
        if (lastName !== undefined) updateData.last_name = lastName;
        if (nickname !== undefined) updateData.nickname = nickname;
        if (phone !== undefined) updateData.phone = phone;
        if (bio !== undefined) updateData.bio = bio;
        if (interests !== undefined) updateData.interests = interests;
        if (avatarUrl !== undefined) updateData.avatar_url = avatarUrl;
        // role is NOT accepted from client — it's set by Smart Enrollment during signup

        const { data, error } = await supabaseAdmin
            .from('users')
            .upsert(updateData, { onConflict: 'firebase_uid' })
            .select()
            .single();

        if (error) {
            console.error('Supabase Profile Update Error:', error);
            return NextResponse.json({
                error: `Failed to update profile: ${error.message} `,
                details: error.hint || error.details
            }, { status: 500 });
        }

        console.log('Profile Update Success:', { id: data.id, firstName: data.first_name });

        // Sync phone to employee_directory if linked
        if (phone && data.employee_id) {
            await supabaseAdmin
                .from('employee_directory')
                .update({ phone })
                .eq('id', data.employee_id);
        }

        // Fire profile completion notifications asynchronously
        if (data.profile_completed) {
            notifyProfileCompletion(data).catch(err =>
                console.error('[Profile] Notification error:', err)
            );
        }

        return NextResponse.json({ success: true, user: data });

    } catch (error) {
        console.error('Profile API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// Profile completion notifications (runs async, non-blocking)
// ---------------------------------------------------------------------------

async function notifyProfileCompletion(user: any) {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.pitchvision.io';

    // 1. Email notification to admin
    try {
        await fetch(`${appUrl}/api/email/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: 'miki@pitchperfectsolutions.net',
                subject: `[Pitch Vision] ${fullName} completed their profile`,
                senderName: 'Pitch Vision',
                html: `<div style="font-family:sans-serif;padding:20px;">
                    <h2 style="margin:0 0 12px;">Profile Completed</h2>
                    <p><strong>${fullName}</strong> (${user.email}) has completed their onboarding profile.</p>
                    <p>Role: <strong>${user.role}</strong></p>
                    ${user.phone ? `<p>Phone: ${user.phone}</p>` : ''}
                </div>`
            })
        });
    } catch (err) {
        console.error('[Profile] Email notification failed:', err);
    }

    // 2. Slack notification (uses Sam bot)
    const channelId = process.env.SLACK_ONBOARDING_CHANNEL_ID;
    const samToken = process.env.SLACK_ONBOARDING_BOT_TOKEN;
    if (channelId) {
        try {
            const { postSlackMessage } = await import('@/utils/slack-helpers');
            await postSlackMessage(channelId,
                `Profile completed: *${fullName}* (${user.email}) — ${user.role}`,
                [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `:white_check_mark: *New Profile Completed*\n*Name:* ${fullName}\n*Email:* ${user.email}\n*Role:* ${user.role}${user.phone ? `\n*Phone:* ${user.phone}` : ''}`
                        }
                    }
                ],
                samToken
            );
        } catch (err) {
            console.error('[Profile] Slack notification failed:', err);
        }
    }

    // 3. Check if ALL employees have completed — "Ready for Launch" notification
    try {
        const { data: stats } = await supabaseAdmin
            .from('users')
            .select('profile_completed, role')
            .eq('status', 'active');

        const total = stats?.length || 0;
        const completed = stats?.filter((u: any) => u.profile_completed).length || 0;

        if (total > 0 && completed === total) {
            await fetch(`${appUrl}/api/email/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: 'miki@pitchperfectsolutions.net',
                    subject: '[Pitch Vision] ALL EMPLOYEES COMPLETED — Ready for Launch!',
                    senderName: 'Pitch Vision',
                    html: `<div style="font-family:sans-serif;padding:20px;">
                        <h2 style="color:#10b981;">All ${total} employees have completed their profiles!</h2>
                        <p>The platform is ready for launch. Go to <strong>HR &gt; Launch Control</strong> to enable portal access per role.</p>
                    </div>`
                })
            });

            if (channelId) {
                const { postSlackMessage } = await import('@/utils/slack-helpers');
                await postSlackMessage(channelId,
                    `:rocket: *ALL ${total} EMPLOYEES HAVE COMPLETED THEIR PROFILES!* The platform is ready for launch.`,
                    undefined,
                    samToken
                );
            }
        }
    } catch (err) {
        console.error('[Profile] All-complete check failed:', err);
    }
}

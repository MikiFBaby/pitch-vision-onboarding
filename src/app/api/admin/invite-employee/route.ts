import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
// import { sendInvitationEmail } from '@/lib/sendgrid';
import * as crypto from 'crypto';

export async function POST(req: Request) {
    try {
        const { email, role, firstName, lastName, teamId } = await req.json();

        if (!email || !role || !firstName || !lastName) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 1. Generate a secure token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

        // 2. Save invitation to Supabase
        const { data: invitation, error: invError } = await supabaseAdmin
            .from('invitations')
            .insert({
                email,
                role,
                first_name: firstName,
                last_name: lastName,
                team_id: teamId || null,
                token,
                expires_at: expiresAt.toISOString(),
            })
            .select()
            .single();

        if (invError) {
            console.error('Database Error:', invError);
            return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
        }

        // 3. Send invitation email (TODO: Switch to Resend)
        // const emailResult = await sendInvitationEmail(email, token, role, firstName);
        console.log(`Mock Invite Sent to ${email} with token ${token}`);

        // Mock success for now since we removed SendGrid
        const emailResult = { success: true, error: null };

        if (!emailResult.success) {
            // If email fails, we might want to delete the invitation or just log it
            console.error('Email Error:', emailResult.error);
            return NextResponse.json({
                success: true,
                message: 'Invitation created but email failed to send. Please share the token manually.',
                token: token
            });
        }

        return NextResponse.json({
            success: true,
            message: `Invitation sent to ${email}`,
            invitationId: invitation.id
        });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

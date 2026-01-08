import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const API_KEY = process.env.RESEND_API_KEY;
const resend = API_KEY ? new Resend(API_KEY) : null;

export async function POST(req: Request) {
    try {
        if (!resend) {
            return NextResponse.json({ error: 'Resend API Key NOT configured' }, { status: 500 });
        }

        const { email, name } = await req.json();

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        // Generate the "Smart Link"
        const inviteLink = `https://pitch-vision-web.vercel.app/login?role=agent&email=${encodeURIComponent(email)}&mode=signup`;

        const { data, error } = await resend.emails.send({
            from: 'Pitch Vision <onboarding@resend.dev>', // Use resend.dev for testing, or verified domain
            to: email, // Resend Free Tier only sends to your own email unless domain is verified
            subject: 'Welcome to Pitch Vision - Complete Your Registration',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                    <h2 style="color: #f43f5e;">Welcome to Pitch Vision</h2>
                    <p>Hello ${name || 'Team Member'},</p>
                    <p>You have been invited to join the Pitch Vision Intelligence Hub.</p>
                    <p>Your profile has already been set up by HR. Please click the button below to claim your account.</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${inviteLink}" style="background-color: #f43f5e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                            Complete Registration
                        </a>
                    </div>

                    <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link:</p>
                    <p style="color: #666; font-size: 14px; word-break: break-all;">${inviteLink}</p>
                </div>
            `,
        });

        if (error) {
            console.error('Resend API Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: `Invite sent to ${email}`, data });

    } catch (error: any) {
        console.error('Invite Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to send email' }, { status: 500 });
    }
}

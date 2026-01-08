import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase-admin';

const API_KEY = process.env.RESEND_API_KEY;
const resend = API_KEY ? new Resend(API_KEY) : null;

export async function POST(req: Request) {
    try {
        if (!resend) {
            return NextResponse.json({ error: 'Resend API Key NOT configured' }, { status: 500 });
        }

        const { limit = 20 } = await req.json(); // Default batch size 20

        // 1. Fetch unregistered employees
        const { data: unregistered, error: dbError } = await supabaseAdmin
            .from('employee_directory')
            .select('*')
            .is('firebase_uid', null)
            .not('email_address', 'is', null) // Ensure email exists
            .limit(limit);

        if (dbError) {
            return NextResponse.json({ error: dbError.message }, { status: 500 });
        }

        if (!unregistered || unregistered.length === 0) {
            return NextResponse.json({ message: 'No unregistered employees found.' });
        }

        // 2. Iterate and Send
        const results = [];
        for (const employee of unregistered) {
            const email = employee.email_address;
            const name = `${employee.first_name} ${employee.last_name}`;
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pitch-vision-web.vercel.app';
            const inviteLink = `${appUrl}/login?role=${(employee.role || 'agent').toLowerCase()}&email=${encodeURIComponent(email)}&mode=signup`;


            try {
                const { data, error } = await resend.emails.send({
                    from: 'Pitch Vision <admin@pitchvision.io>', // Using new domain
                    to: email,
                    subject: 'Action Required: Activate Your Pitch Vision Account',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                            <h2 style="color: #f43f5e;">Pitch Vision</h2>
                            <p>Hello ${name},</p>
                            <p>Your employee profile has been created. You are invited to activate your account on the Pitch Vision Intelligence Hub.</p>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${inviteLink}" style="background-color: #f43f5e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                                    Activate Account
                                </a>
                            </div>
                            <p style="text-align: center; color: #999; font-size: 12px;">This link is unique to your employee ID.</p>
                        </div>
                    `,
                });

                if (error) throw new Error(error.message);
                results.push({ email, status: 'sent', id: data?.id });

            } catch (err: any) {
                console.error(`Failed to send to ${email}:`, err);
                results.push({ email, status: 'failed', error: err.message });
            }
        }

        return NextResponse.json({
            success: true,
            processed: results.length,
            details: results
        });

    } catch (error: any) {
        console.error('Batch Invite Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

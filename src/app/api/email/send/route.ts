import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { to, cc, subjectSuffix, subject: providedSubject, html, text, attachments, senderName } = body;

        // Validation
        if (!to || (!subjectSuffix && !providedSubject)) {
            return NextResponse.json(
                { error: 'Missing required fields: to, and either subject or subjectSuffix' },
                { status: 400 }
            );
        }

        // Check for SMTP Config — fail loudly so callers know the email was NOT sent
        if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
            console.error('[Email API] SMTP not configured (missing SMTP_HOST or SMTP_USER). Email NOT sent to:', to);
            return NextResponse.json(
                { error: 'SMTP not configured. Set SMTP_HOST and SMTP_USER environment variables.', to },
                { status: 503 }
            );
        }

        // Configure transporter with Google Workspace settings
        const port = Number(process.env.SMTP_PORT) || 465;
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port,
            secure: port === 465, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        // Verify connection before sending
        try {
            await transporter.verify();
        } catch (error: any) {
            console.error('SMTP connection failed:', error);
            // Don't crash for user if SMTP flakiness - just log error
            return NextResponse.json(
                { error: `SMTP Connection Failed: ${error.message} (Code: ${error.code})` },
                { status: 500 }
            );
        }

        // Construct subject line
        const finalSenderName = senderName || 'User';
        const finalSubject = providedSubject || `From QA (${finalSenderName}) - ${subjectSuffix}`;

        // Send mail
        const info = await transporter.sendMail({
            from: `"${finalSenderName}" <${process.env.SMTP_USER}>`,
            to,
            cc,
            subject: finalSubject,
            text: text || html?.replace(/<[^>]*>?/gm, '') || 'Report attached.', // Fallback plain text
            html: html || undefined,
            attachments,
        });

        console.log('Message sent: %s', info.messageId);

        return NextResponse.json({ success: true, messageId: info.messageId });

    } catch (error: any) {
        console.error('Email send error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to send email' },
            { status: 500 }
        );
    }
}

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Test-only API: Deletes the Supabase profile for a test user so they can re-onboard
const ALLOWED_TEST_EMAILS = [
    'miki.capitalconnection@gmail.com',
];

export async function POST(req: Request) {
    try {
        const { email, firebaseUid } = await req.json();

        if (!email && !firebaseUid) {
            return NextResponse.json({ error: 'Email or firebaseUid is required' }, { status: 400 });
        }

        // Check if the email is in the allowed test list
        if (email && !ALLOWED_TEST_EMAILS.includes(email.toLowerCase())) {
            return NextResponse.json({ error: 'This endpoint is only for test accounts' }, { status: 403 });
        }

        // Delete by firebase_uid if provided, otherwise by email
        let deleteQuery = supabaseAdmin.from('users').delete();

        if (firebaseUid) {
            deleteQuery = deleteQuery.eq('firebase_uid', firebaseUid);
        } else {
            deleteQuery = deleteQuery.eq('email', email.toLowerCase());
        }

        const { error } = await deleteQuery;

        if (error) {
            console.error('Delete Error:', error);
            return NextResponse.json({ error: 'Failed to reset test user' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: `Test user profile deleted. You can now sign in again to go through onboarding.`
        });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

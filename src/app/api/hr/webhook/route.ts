import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: Request) {
    try {
        const data = await req.json();

        // Validate the webhook has required fields
        if (!data.type || !data.data) {
            return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
        }

        // Handle different event types
        if (data.type === 'hire') {
            const { error } = await supabaseAdmin
                .from('HR Hired')
                .insert({
                    'Agent Name': data.data.agent_name || data.data['Agent Name'],
                    'Hire Date': data.data.hire_date || data.data['Hire Date'],
                    'Campaign': data.data.campaign || data.data['Campaign'],
                    'Canadian/American': data.data.location || data.data['Canadian/American'],
                    created_at: new Date().toISOString()
                });

            if (error) {
                console.error('Error inserting hire:', error);
                return NextResponse.json({ error: 'Failed to insert hire data', details: error }, { status: 500 });
            }

            return NextResponse.json({ success: true, message: 'Hire recorded successfully' });
        }

        if (data.type === 'fire') {
            const { error } = await supabaseAdmin
                .from('HR Fired')
                .insert({
                    'Agent Name': data.data.agent_name || data.data['Agent Name'],
                    'Termination Date': data.data.fire_date || data.data['Termination Date'],
                    'Campaign': data.data.campaign || data.data['Campaign'],
                    'Canadian/American': data.data.location || data.data['Canadian/American'],
                    'Reason for Termination': data.data.reason || data.data['Reason for Termination'] || 'Not specified',
                    created_at: new Date().toISOString()
                });

            if (error) {
                console.error('Error inserting fire:', error);
                return NextResponse.json({ error: 'Failed to insert fire data', details: error }, { status: 500 });
            }

            return NextResponse.json({ success: true, message: 'Termination recorded successfully' });
        }

        return NextResponse.json({ error: 'Unknown event type' }, { status: 400 });

    } catch (error) {
        console.error('Webhook error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

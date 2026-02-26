import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// POST /api/attendance/delete — Delete an absence entry by ID
// Tries Non Booked Days Off first, then Booked Days Off
// Uses service_role key since RLS only allows service_role DELETE

export async function POST(request: NextRequest) {
    try {
        const { id, table } = await request.json();
        if (!id) {
            return NextResponse.json({ error: 'Missing event ID' }, { status: 400 });
        }

        // If caller specifies the table, use it directly
        const targetTable = table === 'Booked Days Off' ? 'Booked Days Off' : 'Non Booked Days Off';

        const { error } = await supabaseAdmin
            .from(targetTable)
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[Attendance Delete] Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('[Attendance Delete] Unhandled error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

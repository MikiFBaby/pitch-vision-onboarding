import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// POST /api/attendance/delete — Delete an attendance event by ID
// Uses service_role key since RLS only allows service_role DELETE

export async function POST(request: NextRequest) {
    try {
        const { id } = await request.json();
        if (!id) {
            return NextResponse.json({ error: 'Missing event ID' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('Attendance Events')
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

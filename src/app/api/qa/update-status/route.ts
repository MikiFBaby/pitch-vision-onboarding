import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
    try {
        const { id, status, reviewedBy, notes } = await request.json();

        if (!id || !status) {
            return NextResponse.json(
                { success: false, error: 'Missing id or status' },
                { status: 400 }
            );
        }

        // Validate status values
        const validStatuses = ['pending', 'approved', 'rejected', 'escalated', 'training_flagged'];
        if (!validStatuses.includes(status)) {
            return NextResponse.json(
                { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
                { status: 400 }
            );
        }

        console.log('Updating QA status:', { id, status, reviewedBy });

        const updateData: Record<string, unknown> = {
            'QA Status': status,
            'QA Reviewed At': new Date().toISOString(),
        };

        if (reviewedBy) {
            updateData['QA Reviewed By'] = reviewedBy;
        }

        if (notes) {
            updateData['QA Notes'] = notes;
        }

        const { error } = await supabaseAdmin
            .from('Pitch Perfect')
            .update(updateData)
            .eq('id', parseInt(id, 10));

        if (error) {
            console.error('Supabase update error:', error);
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: `Call ${id} marked as ${status}`
        });

    } catch (e: unknown) {
        const error = e as Error;
        console.error('Update status API error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

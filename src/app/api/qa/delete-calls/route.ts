import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function DELETE(request: NextRequest) {
    try {
        const { ids } = await request.json();

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json(
                { success: false, error: 'No IDs provided' },
                { status: 400 }
            );
        }

        // Convert string IDs to integers
        const numericIds = ids.map((id: string) => parseInt(id, 10));

        console.log('Deleting from QA Results, IDs:', numericIds);

        // Step 1: Clear foreign key references in processing_jobs
        // This prevents the constraint violation error
        const { error: clearFkError } = await supabaseAdmin
            .from('processing_jobs')
            .update({ qa_result_id: null })
            .in('qa_result_id', numericIds);

        if (clearFkError) {
            console.warn('Could not clear FK references (may not exist):', clearFkError.message);
            // Continue anyway - the rows might not exist in processing_jobs
        }

        // Step 2: Delete from QA Results
        const { error, count } = await supabaseAdmin
            .from('QA Results')
            .delete()
            .in('id', numericIds);

        if (error) {
            console.error('Supabase delete error:', error);
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 500 }
            );
        }

        console.log('Delete successful, count:', count);

        return NextResponse.json({
            success: true,
            deleted: numericIds.length,
            message: `Deleted ${numericIds.length} record(s)`
        });

    } catch (e: any) {
        console.error('Delete API error:', e);
        return NextResponse.json(
            { success: false, error: e.message },
            { status: 500 }
        );
    }
}

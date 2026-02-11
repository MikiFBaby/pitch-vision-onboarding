import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
    try {
        const { id, afCode, violation, evidence, reason, reviewedBy } = await request.json();

        if (!id || !afCode || !reason || !reviewedBy) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: id, afCode, reason, reviewedBy' },
                { status: 400 }
            );
        }

        // Fetch current auto_fail_reasons to append to
        const { data: current, error: fetchError } = await supabaseAdmin
            .from('QA Results')
            .select('auto_fail_reasons, compliance_score')
            .eq('id', parseInt(id, 10))
            .maybeSingle();

        if (fetchError) {
            return NextResponse.json(
                { success: false, error: fetchError.message },
                { status: 500 }
            );
        }

        if (!current) {
            return NextResponse.json(
                { success: false, error: 'Call not found' },
                { status: 404 }
            );
        }

        // Build the new auto-fail reason
        const newReason = {
            code: afCode,
            violation: violation || afCode,
            evidence: evidence || 'Manually flagged by QA reviewer',
            timestamp: null,
            time_seconds: -1,
            speaker: 'system' as const,
            additional_info: `Manual auto-fail by ${reviewedBy}: ${reason}`
        };

        // Append to existing reasons (or start fresh)
        const existingReasons = Array.isArray(current.auto_fail_reasons) ? current.auto_fail_reasons : [];
        const updatedReasons = [...existingReasons, newReason];

        const updateData: Record<string, unknown> = {
            'auto_fail_triggered': true,
            'auto_fail_reasons': updatedReasons,
            'compliance_score': 0,
            'call_status': 'auto_fail',
            'tag': 'escalated',
            'qa_status': 'rejected',
            'qa_reviewed_by': reviewedBy,
            'qa_reviewed_at': new Date().toISOString(),
            'qa_notes': `Manual Auto-Fail [${afCode}]: ${reason}`,
            'risk_level': 'HIGH',
            'review_priority': 'urgent',
            // Clear any previous override since QA is now confirming this IS a fail
            'auto_fail_overridden': false,
            'auto_fail_override_reason': null,
            'auto_fail_override_at': null,
            'auto_fail_override_by': null,
        };

        const { error: updateError } = await supabaseAdmin
            .from('QA Results')
            .update(updateData)
            .eq('id', parseInt(id, 10));

        if (updateError) {
            console.error('Manual auto-fail update error:', updateError);
            return NextResponse.json(
                { success: false, error: updateError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: `Call ${id} manually auto-failed with ${afCode}`,
            previousScore: current.compliance_score
        });

    } catch (e: unknown) {
        const error = e as Error;
        console.error('Manual auto-fail API error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

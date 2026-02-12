import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * API endpoint to update the Call Score in the database
 * POST /api/qa/update-score
 * 
 * This syncs the calculated weighted score to the database
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { callId, newScore, reason } = body;

        console.log('Score update request:', body);

        if (!callId || newScore === undefined) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: callId, newScore' },
                { status: 400 }
            );
        }

        // Validate score is a number between 0 and 100
        const score = parseInt(String(newScore), 10);
        if (isNaN(score) || score < 0 || score > 100) {
            return NextResponse.json(
                { success: false, error: 'Score must be a number between 0 and 100' },
                { status: 400 }
            );
        }

        // Parse ID
        const numericId = typeof callId === 'string' ? parseInt(callId, 10) : callId;
        console.log('Updating score for call ID:', numericId, 'to:', score);

        // Determine status and risk based on score
        // Thresholds: ≥90% = Compliant, 75-89% = Requires Review, <75% = Non-Compliant
        let newStatus = 'Non-Compliant';
        let newRiskLevel = 'High';

        if (score >= 90) {
            newStatus = 'Compliant';
            newRiskLevel = 'Low';
        } else if (score >= 75) {
            newStatus = 'Requires Review';
            newRiskLevel = 'Medium';
        }
        // else stays Non-Compliant / High

        // Check if this call has an active auto-fail that needs overriding
        const { data: current } = await supabaseAdmin
            .from('QA Results')
            .select('auto_fail_triggered, auto_fail_overridden')
            .eq('id', numericId)
            .maybeSingle();

        const hasActiveAutoFail = current?.auto_fail_triggered === true
            && current?.auto_fail_overridden !== true;

        // Build update payload
        const updatePayload: Record<string, unknown> = {
            'compliance_score': score,
            'call_status': newStatus,
            'risk_level': newRiskLevel
        };

        // If manually setting score > 0 on an auto-fail call, mark it as overridden
        if (hasActiveAutoFail && score > 0) {
            updatePayload['auto_fail_overridden'] = true;
            updatePayload['auto_fail_override_reason'] = reason || 'Score manually corrected by QA';
            updatePayload['auto_fail_override_at'] = new Date().toISOString();
        }

        // If manually setting score to 0, ensure auto-fail state is consistent
        if (score === 0 && !current?.auto_fail_triggered) {
            updatePayload['call_status'] = 'auto_fail';
        }

        // Update the database
        const { error: updateError, data: updateData } = await supabaseAdmin
            .from('QA Results')
            .update(updatePayload)
            .eq('id', numericId)
            .select();

        console.log('Update result:', { updateError, updateData });

        if (updateError) {
            console.error('Supabase update error:', updateError);
            return NextResponse.json(
                { success: false, error: updateError.message },
                { status: 500 }
            );
        }

        if (!updateData || updateData.length === 0) {
            return NextResponse.json(
                { success: false, error: `No record found with id ${numericId}` },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: `Score updated to ${score}%`,
            newScore: score,
            newStatus,
            newRiskLevel,
            reason
        });

    } catch (e: unknown) {
        const error = e as Error;
        console.error('Update score API error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

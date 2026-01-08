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

        // Update the database
        const { error: updateError, data: updateData } = await supabaseAdmin
            .from('Pitch Perfect')
            .update({
                'Call Score': score,
                'Call Status': newStatus,
                'Risk Level': newRiskLevel
            })
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

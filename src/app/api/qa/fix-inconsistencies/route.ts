import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * API endpoint to fix all inconsistent rows in the database
 * POST /api/qa/fix-inconsistencies
 * 
 * Scans all calls and ensures status/risk matches score using thresholds:
 * - ≥95% = Compliant, Low Risk
 * - 80-94% = Minor Issues, Medium Risk
 * - <80% = Non-Compliant, High Risk
 */
export async function POST(request: NextRequest) {
    try {
        console.log('Starting inconsistency fix...');

        // Fetch all calls
        const { data: calls, error: fetchError } = await supabaseAdmin
            .from('Pitch Perfect')
            .select('id, "Call Score", "Call Status", "Risk Level"')
            .order('id', { ascending: false });

        if (fetchError) {
            console.error('Fetch error:', fetchError);
            return NextResponse.json(
                { success: false, error: fetchError.message },
                { status: 500 }
            );
        }

        if (!calls || calls.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No calls found to fix',
                fixed: 0
            });
        }

        console.log(`Found ${calls.length} calls to check`);

        const inconsistencies: any[] = [];
        const fixes: any[] = [];

        // Check each call
        for (const call of calls) {
            // Parse score as integer (may be stored as string)
            const score = parseInt(String(call['Call Score'] || 0), 10) || 0;
            const currentStatus = call['Call Status'] || '';
            const currentRisk = call['Risk Level'] || '';

            // Determine correct status/risk based on score
            let correctStatus = 'Non-Compliant';
            let correctRisk = 'High';

            if (score >= 90) {
                correctStatus = 'Compliant';
                correctRisk = 'Low';
            } else if (score >= 75) {
                correctStatus = 'Requires Review';
                correctRisk = 'Medium';
            }

            // Check if there's a mismatch
            const statusMismatch = currentStatus !== correctStatus;
            const riskMismatch = currentRisk !== correctRisk;

            if (statusMismatch || riskMismatch) {
                inconsistencies.push({
                    id: call.id,
                    score,
                    currentStatus,
                    currentRisk,
                    correctStatus,
                    correctRisk,
                    statusMismatch,
                    riskMismatch
                });

                // Fix the row
                const { error: updateError } = await supabaseAdmin
                    .from('Pitch Perfect')
                    .update({
                        'Call Status': correctStatus,
                        'Risk Level': correctRisk
                    })
                    .eq('id', call.id);

                if (updateError) {
                    console.error(`Failed to fix call ${call.id}:`, updateError);
                } else {
                    fixes.push({
                        id: call.id,
                        score,
                        oldStatus: currentStatus,
                        newStatus: correctStatus,
                        oldRisk: currentRisk,
                        newRisk: correctRisk
                    });
                    console.log(`Fixed call ${call.id}: ${score}% -> ${correctStatus}/${correctRisk}`);
                }
            }
        }

        console.log(`Fixed ${fixes.length} inconsistent rows`);

        return NextResponse.json({
            success: true,
            message: `Found and fixed ${fixes.length} inconsistent rows out of ${calls.length} total`,
            totalCalls: calls.length,
            inconsistenciesFound: inconsistencies.length,
            fixesApplied: fixes.length,
            details: fixes
        });

    } catch (e: unknown) {
        const error = e as Error;
        console.error('Fix inconsistencies API error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

// GET method to preview inconsistencies without fixing
export async function GET(request: NextRequest) {
    try {
        console.log('Checking for inconsistencies...');

        // Fetch all calls
        const { data: calls, error: fetchError } = await supabaseAdmin
            .from('Pitch Perfect')
            .select('id, "Call Score", "Call Status", "Risk Level", "Agent Name"')
            .order('id', { ascending: false });

        if (fetchError) {
            return NextResponse.json(
                { success: false, error: fetchError.message },
                { status: 500 }
            );
        }

        const inconsistencies: any[] = [];

        for (const call of calls || []) {
            // Parse score as integer (may be stored as string)
            const score = parseInt(String(call['Call Score'] || 0), 10) || 0;
            const currentStatus = call['Call Status'] || '';
            const currentRisk = call['Risk Level'] || '';

            let correctStatus = 'Non-Compliant';
            let correctRisk = 'High';

            if (score >= 95) {
                correctStatus = 'Compliant';
                correctRisk = 'Low';
            } else if (score >= 80) {
                correctStatus = 'Requires Review';
                correctRisk = 'Medium';
            }

            if (currentStatus !== correctStatus || currentRisk !== correctRisk) {
                inconsistencies.push({
                    id: call.id,
                    agent: call['Agent Name'],
                    score,
                    current: `${currentStatus} / ${currentRisk}`,
                    expected: `${correctStatus} / ${correctRisk}`
                });
            }
        }

        return NextResponse.json({
            success: true,
            totalCalls: calls?.length || 0,
            inconsistenciesFound: inconsistencies.length,
            inconsistencies
        });

    } catch (e: unknown) {
        const error = e as Error;
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

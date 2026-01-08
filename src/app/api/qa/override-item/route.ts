import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * API endpoint to override individual checklist items after QA review
 * POST /api/qa/override-item
 * 
 * IMPORTANT: This endpoint does NOT modify the original Checklist field to avoid data corruption.
 * Instead, it stores overrides in the QA Notes field and recalculates the score.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { callId, itemKey, overrideStatus, reviewedBy, notes } = body;

        console.log('Override request received:', body);

        if (!callId || !itemKey || !overrideStatus) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: callId, itemKey, overrideStatus' },
                { status: 400 }
            );
        }

        // Validate override status
        const validStatuses = ['PASS', 'FAIL'];
        if (!validStatuses.includes(overrideStatus)) {
            return NextResponse.json(
                { success: false, error: `Invalid overrideStatus. Must be one of: ${validStatuses.join(', ')}` },
                { status: 400 }
            );
        }

        // Parse ID
        const numericId = typeof callId === 'string' ? parseInt(callId, 10) : callId;
        console.log('Looking up call with ID:', numericId);

        // Fetch current call data 
        const { data: callData, error: fetchError } = await supabaseAdmin
            .from('Pitch Perfect')
            .select('Checklist, "Call Score", "QA Notes"')
            .eq('id', numericId)
            .single();

        if (fetchError || !callData) {
            console.error('Failed to fetch call data:', fetchError);
            return NextResponse.json(
                { success: false, error: fetchError?.message || 'Call not found' },
                { status: 404 }
            );
        }

        const oldScore = callData['Call Score'] || 0;

        // Parse existing overrides from QA Notes
        let existingOverrides: any[] = [];
        try {
            if (callData['QA Notes']) {
                const qaNotes = typeof callData['QA Notes'] === 'string'
                    ? JSON.parse(callData['QA Notes'])
                    : callData['QA Notes'];
                existingOverrides = qaNotes.overrides || [];
            }
        } catch (e) {
            console.log('No existing overrides or invalid format');
        }

        // Build new override record
        const overrideRecord = {
            itemKey,
            overrideStatus,
            reviewedBy: reviewedBy || 'QA Agent',
            timestamp: new Date().toISOString(),
            notes: notes || ''
        };

        // Add/update override (replace if same itemKey exists)
        const filteredOverrides = existingOverrides.filter((o: any) =>
            o.itemKey?.toLowerCase() !== itemKey.toLowerCase()
        );
        filteredOverrides.push(overrideRecord);

        // Calculate new score based on checklist + overrides
        let checklist: any[] = [];
        let checklistParseSuccess = false;
        try {
            let raw = callData.Checklist;
            console.log('Raw checklist type:', typeof raw, 'value:', JSON.stringify(raw).substring(0, 500));

            if (typeof raw === 'string') {
                raw = JSON.parse(raw);
            }

            if (Array.isArray(raw)) {
                // Array format: [{name: "...", status: "PASS"}, ...]
                checklist = raw.map((item: any, idx: number) => ({
                    ...item,
                    name: item.name || item.requirement || item.requirement_name || `Item ${idx + 1}`
                }));
                checklistParseSuccess = true;
            } else if (raw && typeof raw === 'object') {
                // Object format: {"recorded_line": {status: "PASS", evidence: "..."}, ...}
                // Convert keys to readable names (like frontend does)
                checklist = Object.entries(raw).map(([key, value]: [string, any]) => {
                    // Convert snake_case/camelCase key to readable name
                    const readableName = key
                        .replace(/_/g, ' ')
                        .replace(/([a-z])([A-Z])/g, '$1 $2')
                        .replace(/\b\w/g, (c: string) => c.toUpperCase())
                        .trim();

                    if (typeof value === 'string') {
                        return { name: readableName, status: value };
                    }

                    return {
                        ...value,
                        name: value?.name || readableName,
                        status: value?.status || 'PASS'
                    };
                });
                checklistParseSuccess = checklist.length > 0;
            }
            console.log('Checklist parse status:', checklistParseSuccess, 'Items:', checklist.length);
            console.log('Parsed checklist names:', checklist.map((c: any) => `"${c.name}": ${c.status}`).join(', '));
        } catch (e) {
            console.error('Failed to parse checklist:', e);
            checklistParseSuccess = false;
        }

        // Count met/total with overrides applied
        let metCount = 0;
        let totalCount = 0;
        let newScore = oldScore; // DEFAULT: preserve old score

        if (checklistParseSuccess && checklist.length > 0) {
            console.log('Calculating score from', checklist.length, 'checklist items:');
            checklist.forEach((item: any) => {
                const itemName = item.name || item.requirement || item.requirement_name || '';
                let status = (item.status || '').toLowerCase();
                const originalStatus = status;

                if (status === 'n/a') {
                    console.log(`  [SKIP] "${itemName}" - N/A`);
                    return;
                }

                // Check if this item has an override
                const override = filteredOverrides.find((o: any) =>
                    o.itemKey?.toLowerCase() === itemName.toLowerCase() ||
                    o.itemKey?.toLowerCase().includes(itemName.toLowerCase()) ||
                    itemName.toLowerCase().includes(o.itemKey?.toLowerCase() || '')
                );

                if (override) {
                    status = override.overrideStatus.toLowerCase();
                    console.log(`  [OVERRIDE] "${itemName}": ${originalStatus} → ${status}`);
                }

                totalCount++;
                const isMet = ['met', 'pass', 'yes', 'true'].includes(status);
                if (isMet) {
                    metCount++;
                    console.log(`  [MET] "${itemName}" - status="${status}"`);
                } else {
                    console.log(`  [NOT MET] "${itemName}" - status="${status}"`);
                }
            });

            // Only update score if we successfully counted items
            if (totalCount > 0) {
                newScore = Math.round((metCount / totalCount) * 100);
            }
        } else {
            console.warn('Could not parse checklist - PRESERVING old score:', oldScore);
        }

        console.log(`Score calculation: ${metCount}/${totalCount} = ${newScore}% (was ${oldScore}%)`);

        // Determine new status and risk level based on score
        // Thresholds: ≥90% = Compliant, 75-89% = Requires Review, <75% = Non-Compliant
        let newStatus = 'Non-Compliant';
        let newRiskLevel = 'High';

        if (newScore >= 90) {
            newStatus = 'Compliant';
            newRiskLevel = 'Low';
        } else if (newScore >= 75) {
            newStatus = 'Requires Review';
            newRiskLevel = 'Medium';
        }
        // else stays Non-Compliant / High

        console.log(`Status: ${newStatus}, Risk: ${newRiskLevel}`);

        // Prepare the update data
        const qaNotesSave = JSON.stringify({ overrides: filteredOverrides });
        console.log('Saving QA Notes:', qaNotesSave);
        console.log('Overrides to save:', filteredOverrides);

        // Update QA Notes, Score, Status, and Risk Level - DO NOT touch the original Checklist
        const { error: updateError, data: updateData } = await supabaseAdmin
            .from('Pitch Perfect')
            .update({
                'Call Score': newScore,
                'Call Status': newStatus,
                'Risk Level': newRiskLevel,
                'QA Notes': qaNotesSave,
                'QA Status': overrideStatus === 'PASS' ? 'approved' : 'rejected'
            })
            .eq('id', numericId)
            .select();

        console.log('Update result:', { updateError, updateData });

        // Verify the save by reading back the data
        if (updateData && updateData.length > 0) {
            console.log('Saved QA Notes value:', updateData[0]['QA Notes']);
        }

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
            message: `Item "${itemKey}" overridden to ${overrideStatus}`,
            override: overrideRecord,
            scoreUpdate: {
                oldScore,
                newScore,
                metCount,
                totalCount
            }
        });

    } catch (e: unknown) {
        const error = e as Error;
        console.error('Override item API error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

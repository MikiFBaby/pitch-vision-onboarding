import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// This endpoint pushes QA analysis data to an external analytics server
// Can be called manually or automatically after each analysis

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            callId,
            externalEndpoint,  // Optional: override default endpoint
            includeTranscript = false  // Don't include transcript by default (privacy)
        } = body;

        // If no specific call, get recent analyzed calls
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Build query
        let query = supabase
            .from('Pitch Perfect')
            .select(`
        id,
        created_at,
        "Agent Name",
        "Campaign Type",
        "Compliance Score",
        "Risk Level",
        "QA Status",
        "Duration",
        "Phone Number",
        "QA Reviewed By",
        "QA Reviewed At",
        "Checklist"
      `)
            .order('created_at', { ascending: false });

        // Filter by specific call if provided
        if (callId) {
            query = query.eq('id', callId);
        } else {
            // Default: last 50 calls
            query = query.limit(50);
        }

        const { data: calls, error } = await query;

        if (error) {
            console.error('Database query error:', error);
            return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
        }

        // Transform data for analytics
        const analyticsPayload = {
            exportedAt: new Date().toISOString(),
            source: 'pitch-vision',
            recordCount: calls?.length || 0,
            records: calls?.map(call => {
                // Extract checklist stats
                let checklistStats = { total: 0, passed: 0, failed: 0, critical: 0 };
                try {
                    const checklist = typeof call.Checklist === 'string'
                        ? JSON.parse(call.Checklist)
                        : call.Checklist;

                    if (checklist && typeof checklist === 'object') {
                        const items = Object.values(checklist) as any[];
                        checklistStats.total = items.length;
                        checklistStats.passed = items.filter(i => i?.status?.toUpperCase() === 'PASS').length;
                        checklistStats.failed = items.filter(i => i?.status?.toUpperCase() === 'FAIL').length;
                        checklistStats.critical = items.filter(i => i?.weight?.toUpperCase() === 'CRITICAL').length;
                    }
                } catch (e) {
                    // Ignore parsing errors
                }

                return {
                    callId: call.id,
                    timestamp: call.created_at,
                    agentName: call['Agent Name'],
                    campaignType: call['Campaign Type'],
                    complianceScore: call['Compliance Score'],
                    riskLevel: call['Risk Level'],
                    qaStatus: call['QA Status'],
                    duration: call['Duration'],
                    reviewedBy: call['QA Reviewed By'],
                    reviewedAt: call['QA Reviewed At'],
                    checklistStats  // Pass/fail counts without full details
                };
            })
        };

        // If external endpoint provided, forward the data
        if (externalEndpoint) {
            try {
                const externalResponse = await fetch(externalEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(analyticsPayload)
                });

                if (!externalResponse.ok) {
                    console.warn('External endpoint returned error:', externalResponse.status);
                }

                return NextResponse.json({
                    success: true,
                    message: 'Data exported to external endpoint',
                    recordCount: analyticsPayload.recordCount,
                    externalStatus: externalResponse.status
                });
            } catch (e: any) {
                return NextResponse.json({
                    success: false,
                    error: 'Failed to reach external endpoint',
                    details: e.message,
                    // Still return the data so it's not lost
                    data: analyticsPayload
                }, { status: 500 });
            }
        }

        // Return data directly if no external endpoint
        return NextResponse.json({
            success: true,
            message: 'Data ready for export',
            ...analyticsPayload
        });

    } catch (error: any) {
        console.error('Export error:', error);
        return NextResponse.json(
            { error: error.message || 'Export failed' },
            { status: 500 }
        );
    }
}

// GET - Quick stats endpoint for dashboards
export async function GET(request: NextRequest) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Get aggregate stats for the last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const { data: calls, error } = await supabase
            .from('Pitch Perfect')
            .select('id, "Compliance Score", "Risk Level", "QA Status", created_at')
            .gte('created_at', sevenDaysAgo.toISOString())
            .order('created_at', { ascending: false });

        if (error) {
            return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
        }

        // Calculate aggregates
        const totalCalls = calls?.length || 0;
        const scores = calls?.map(c => c['Compliance Score']).filter(s => s != null) || [];
        const avgScore = scores.length > 0
            ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
            : 0;

        const riskCounts = {
            high: calls?.filter(c => c['Risk Level']?.toLowerCase() === 'high').length || 0,
            medium: calls?.filter(c => c['Risk Level']?.toLowerCase() === 'medium').length || 0,
            low: calls?.filter(c => c['Risk Level']?.toLowerCase() === 'low').length || 0
        };

        const statusCounts = {
            reviewed: calls?.filter(c => c['QA Status'] === 'reviewed').length || 0,
            pending: calls?.filter(c => c['QA Status'] === 'pending' || !c['QA Status']).length || 0,
            flagged: calls?.filter(c => c['QA Status'] === 'flagged').length || 0
        };

        return NextResponse.json({
            period: 'last_7_days',
            generatedAt: new Date().toISOString(),
            totalCalls,
            avgComplianceScore: avgScore,
            riskDistribution: riskCounts,
            qaStatusDistribution: statusCounts,
            callsPerDay: Math.round(totalCalls / 7 * 10) / 10
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

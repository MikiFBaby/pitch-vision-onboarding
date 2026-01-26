import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client with service role for full access
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { action, filters } = body;

        console.log('[Aura Query] Request:', { action, filters });

        if (action === 'get_calls') {
            // Build query for QA Results
            let query = supabase
                .from('QA Results')
                .select(`
                    id, created_at, agent_name, campaign_type, call_duration,
                    call_status, compliance_score, risk_level, summary,
                    violations, coaching_notes, checklist, transcript,
                    agent_speaking_time, customer_speaking_time, speaker_metrics,
                    qa_status, qa_reviewed_by, tag
                `)
                .order('created_at', { ascending: false });

            // Apply filters
            if (filters?.agent_name) {
                query = query.ilike('agent_name', `%${filters.agent_name}%`);
            }
            if (filters?.risk_level) {
                query = query.eq('risk_level', filters.risk_level);
            }
            if (filters?.call_id) {
                query = query.eq('id', filters.call_id);
            }
            if (filters?.min_score !== undefined) {
                query = query.gte('compliance_score', filters.min_score);
            }
            if (filters?.max_score !== undefined) {
                query = query.lte('compliance_score', filters.max_score);
            }
            if (filters?.tag) {
                query = query.eq('tag', filters.tag);
            }

            // Limit results
            const limit = filters?.limit || 10;
            query = query.limit(limit);

            const { data, error } = await query;

            if (error) {
                console.error('[Aura Query] Supabase error:', error);
                return NextResponse.json({ success: false, error: error.message }, { status: 500 });
            }

            // Summarize for Aura
            const summary = {
                total_calls: data?.length || 0,
                calls: data?.map(call => ({
                    id: call.id,
                    agent: call.agent_name,
                    score: call.compliance_score,
                    risk: call.risk_level,
                    status: call.call_status,
                    duration: call.call_duration,
                    summary: call.summary,
                    violations: call.violations,
                    coaching: call.coaching_notes,
                    talk_time: {
                        agent_seconds: call.agent_speaking_time,
                        customer_seconds: call.customer_speaking_time
                    },
                    tag: call.tag,
                    date: call.created_at
                }))
            };

            return NextResponse.json({ success: true, data: summary });
        }

        if (action === 'get_call_detail') {
            if (!filters?.call_id) {
                return NextResponse.json({ success: false, error: 'call_id required' }, { status: 400 });
            }

            const { data, error } = await supabase
                .from('QA Results')
                .select('*')
                .eq('id', filters.call_id)
                .single();

            if (error) {
                console.error('[Aura Query] Supabase error:', error);
                return NextResponse.json({ success: false, error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, data });
        }

        if (action === 'get_employee') {
            let query = supabase
                .from('employee_directory')
                .select('first_name, last_name, email, job_title, department, hire_date, slack_user_id');

            if (filters?.name) {
                query = query.or(`first_name.ilike.%${filters.name}%,last_name.ilike.%${filters.name}%`);
            }
            if (filters?.email) {
                query = query.ilike('email', `%${filters.email}%`);
            }

            const { data, error } = await query.limit(filters?.limit || 10);

            if (error) {
                console.error('[Aura Query] Supabase error:', error);
                return NextResponse.json({ success: false, error: error.message }, { status: 500 });
            }

            return NextResponse.json({ success: true, data });
        }

        return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });

    } catch (error: any) {
        console.error('[Aura Query] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: Request) {
    try {
        const { email } = await req.json();

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }



        // 1. Resolve Slack ID from Employee Directory
        const { data: empData, error: empError } = await supabaseAdmin
            .from('employee_directory')
            .select('slack_user_id')
            .eq('email', email)
            .maybeSingle();

        if (empError) {
            console.error('Error resolving slack ID:', empError);
            return NextResponse.json({ history: [] }); // Fail gracefully
        }

        if (!empData?.slack_user_id) {
            return NextResponse.json({ history: [] });
        }

        // 2. Fetch Recent Memory
        const { data: memoryData, error: memError } = await supabaseAdmin
            .from('slack_bot_memory')
            .select('message_in, message_out, issue, created_at')
            .eq('slack_user_id', empData.slack_user_id)
            .order('created_at', { ascending: false })
            .limit(20); // Last 20 interactions

        if (memError) {
            console.error('Error fetching slack memory:', memError);
            // Don't fail the whole chat if this fails
            return NextResponse.json({ history: [] });
        }

        return NextResponse.json({
            history: memoryData || [],
            linkedSlackId: empData.slack_user_id
        });

    } catch (error) {
        console.error('Slack History API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

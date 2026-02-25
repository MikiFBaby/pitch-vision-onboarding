import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const agent = request.nextUrl.searchParams.get('agent');
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);

  try {
    let query = supabaseAdmin
      .from('dialedin_coaching_events')
      .select('*')
      .order('event_date', { ascending: false })
      .limit(limit);

    if (agent) {
      query = query.ilike('agent_name', agent);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch coaching events' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent_name, coach_name, event_date, event_type, notes, tags, created_by } = body;

    if (!agent_name || !event_date) {
      return NextResponse.json({ error: 'agent_name and event_date are required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('dialedin_coaching_events')
      .insert({
        agent_name,
        coach_name: coach_name || null,
        event_date,
        event_type: event_type || 'coaching',
        notes: notes || null,
        tags: tags || [],
        created_by: created_by || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create coaching event' },
      { status: 500 },
    );
  }
}

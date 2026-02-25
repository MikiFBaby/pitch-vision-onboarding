import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

/**
 * Returns live status for a specific agent.
 * Query: ?name=John+Smith (case-insensitive match)
 */
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');

  if (!name || name.trim().length < 2) {
    return NextResponse.json({ live_status: null, has_live_data: false });
  }

  const { data, error } = await supabaseAdmin
    .from('dialedin_live_agent_status')
    .select('*')
    .ilike('agent_name', name.trim())
    .maybeSingle();

  if (error) {
    console.error('[Agent Live] Query error:', error);
    return NextResponse.json({ live_status: null, has_live_data: false });
  }

  // Treat status_since > 14 hours old as stale
  const isStale =
    data?.status_since &&
    Date.now() - new Date(data.status_since).getTime() > 14 * 60 * 60 * 1000;

  return NextResponse.json({
    live_status: data || null,
    has_live_data: !!(data && data.current_status !== 'offline' && !isStale),
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { LiveDashboardData } from '@/types/dialedin-types';

export const runtime = 'nodejs';

/**
 * Returns real-time DialedIn data: live metrics, agent statuses, and recent events.
 * No auth required (matches existing GET endpoint pattern).
 *
 * Query params:
 *   campaign - filter by campaign (default: '__all__')
 *   limit    - number of recent events to return (default: 20, max: 100)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const campaign = searchParams.get('campaign') || '__all__';
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);

  const today = new Date().toISOString().split('T')[0];

  try {
    // Fetch all three in parallel
    const [metricsResult, statusesResult, eventsResult] = await Promise.all([
      // Live metrics for today
      supabaseAdmin
        .from('dialedin_live_metrics')
        .select('*')
        .eq('metric_date', today)
        .eq('campaign', campaign)
        .maybeSingle(),

      // All agent statuses (non-offline by default)
      supabaseAdmin
        .from('dialedin_live_agent_status')
        .select('*')
        .neq('current_status', 'offline')
        .order('agent_name'),

      // Recent webhook events
      supabaseAdmin
        .from('dialedin_webhook_events')
        .select('event_type, event_subtype, agent_name, campaign, event_timestamp')
        .order('event_timestamp', { ascending: false })
        .limit(limit),
    ]);

    const response: LiveDashboardData = {
      live_metrics: metricsResult.data || null,
      agent_statuses: statusesResult.data || [],
      recent_events: eventsResult.data || [],
      has_live_data: !!(metricsResult.data?.last_event_at),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[Live] Query error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Query failed' },
      { status: 500 },
    );
  }
}

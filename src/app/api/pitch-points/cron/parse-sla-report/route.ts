import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { matchAgentNameToUser } from '@/utils/pitch-points-utils';

export async function POST(request: NextRequest) {
  try {
    const { reportDate, agents, source } = await request.json();

    if (!reportDate || !agents || !Array.isArray(agents)) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: reportDate, agents (array of { name, sla_avg_per_hour, total_calls?, total_hours_worked? })' },
        { status: 400 },
      );
    }

    let inserted = 0;
    let matched = 0;
    let unmatched: string[] = [];

    for (const agent of agents) {
      if (!agent.name || agent.sla_avg_per_hour === undefined) continue;

      // Try to match agent name to employee
      const agentMatch = await matchAgentNameToUser(agent.name);
      const employeeId = agentMatch?.employeeId || null;

      if (employeeId) {
        matched++;
      } else {
        unmatched.push(agent.name);
      }

      const { error } = await supabaseAdmin
        .from('sla_daily_metrics')
        .upsert(
          {
            agent_name: agent.name,
            employee_id: employeeId,
            report_date: reportDate,
            dialer_source: source || 'diledin',
            sla_avg_per_hour: agent.sla_avg_per_hour,
            total_calls: agent.total_calls || null,
            total_hours_worked: agent.total_hours_worked || null,
            raw_data: agent.raw_data || {},
            points_processed: false,
          },
          { onConflict: 'agent_name,report_date,dialer_source' },
        );

      if (!error) inserted++;
    }

    return NextResponse.json({
      success: true,
      inserted,
      matched,
      unmatched_agents: unmatched,
      total_agents: agents.length,
    });
  } catch (error) {
    console.error('Error parsing SLA report:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

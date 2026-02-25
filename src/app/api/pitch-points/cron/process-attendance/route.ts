import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getActiveRules, createTransaction, getConfig } from '@/utils/pitch-points-utils';

export async function POST() {
  try {
    const config = await getConfig();
    if (!config.system_enabled) {
      return NextResponse.json({ success: true, message: 'System disabled', processed: 0 });
    }

    const attendanceRules = await getActiveRules('attendance');
    if (attendanceRules.length === 0) {
      return NextResponse.json({ success: true, message: 'No active attendance rules', processed: 0 });
    }

    const now = new Date();
    let processed = 0;

    // Get all active agents
    const { data: activeAgents } = await supabaseAdmin
      .from('employee_directory')
      .select('id, first_name, last_name, email')
      .eq('employee_status', 'Active')
      .eq('role', 'Agent');

    if (!activeAgents || activeAgents.length === 0) {
      return NextResponse.json({ success: true, message: 'No active agents', processed: 0 });
    }

    for (const rule of attendanceRules) {
      if (!rule.period_days) continue;

      const periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - rule.period_days);
      const periodStartStr = periodStart.toISOString().split('T')[0];
      const periodEndStr = now.toISOString().split('T')[0];
      const sourceId = `${rule.rule_key}_${periodStartStr}_${periodEndStr}`;

      for (const agent of activeAgents) {
        const agentName = `${agent.first_name} ${agent.last_name}`.trim();

        // Check for unexcused absences in period
        const { data: unexcusedAbsences } = await supabaseAdmin
          .from('Non Booked Days Off')
          .select('*')
          .ilike('Agent Name', `%${agentName}%`)
          .gte('Date', periodStartStr)
          .lte('Date', periodEndStr);

        if ((unexcusedAbsences || []).length > 0) continue;

        // Find user account
        const { data: user } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('email', agent.email)
          .maybeSingle();

        if (!user) continue;

        // Check if already awarded for this period
        const { data: existing } = await supabaseAdmin
          .from('pitch_points_transactions')
          .select('id')
          .eq('user_id', user.id)
          .eq('source_type', 'attendance')
          .eq('source_id', sourceId)
          .maybeSingle();

        if (existing) continue;

        await createTransaction({
          userId: user.id,
          employeeId: agent.id,
          type: 'earn',
          amount: rule.points_amount,
          ruleId: rule.id,
          ruleKey: rule.rule_key,
          sourceType: 'attendance',
          sourceId,
          description: `${rule.label}: Perfect attendance ${periodStartStr} to ${periodEndStr}`,
          metadata: { period_start: periodStartStr, period_end: periodEndStr },
        });
        processed++;
      }
    }

    return NextResponse.json({ success: true, processed });
  } catch (error) {
    console.error('Error processing attendance points:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

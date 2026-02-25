import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  getActiveRules,
  matchScoreToRule,
  createTransaction,
  getConfig,
} from '@/utils/pitch-points-utils';

export async function POST() {
  try {
    const config = await getConfig();
    if (!config.system_enabled) {
      return NextResponse.json({ success: true, message: 'System disabled', processed: 0 });
    }

    // Get active SLA rules
    const slaRules = await getActiveRules('sla_performance');
    if (slaRules.length === 0) {
      return NextResponse.json({ success: true, message: 'No active SLA rules', processed: 0 });
    }

    // Fetch unprocessed SLA metrics
    const { data: metrics, error: metricsError } = await supabaseAdmin
      .from('sla_daily_metrics')
      .select('*')
      .eq('points_processed', false)
      .order('report_date', { ascending: true });

    if (metricsError) throw metricsError;

    let processed = 0;

    for (const metric of (metrics || [])) {
      if (!metric.employee_id || !metric.sla_avg_per_hour) continue;

      // Find the user account for this employee
      const { data: employee } = await supabaseAdmin
        .from('employee_directory')
        .select('email')
        .eq('id', metric.employee_id)
        .maybeSingle();

      if (!employee) continue;

      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', employee.email)
        .maybeSingle();

      if (!user) continue;

      // Match SLA to earning rule
      const matchedRule = matchScoreToRule(metric.sla_avg_per_hour, slaRules);
      if (matchedRule) {
        await createTransaction({
          userId: user.id,
          employeeId: metric.employee_id,
          type: 'earn',
          amount: matchedRule.points_amount,
          ruleId: matchedRule.id,
          ruleKey: matchedRule.rule_key,
          sourceType: 'sla_report',
          sourceId: metric.id,
          description: `SLA ${metric.sla_avg_per_hour.toFixed(1)}/hr on ${metric.report_date}`,
          metadata: {
            sla_avg: metric.sla_avg_per_hour,
            report_date: metric.report_date,
            total_calls: metric.total_calls,
          },
        });
        processed++;
      }

      // Mark as processed
      await supabaseAdmin
        .from('sla_daily_metrics')
        .update({ points_processed: true, points_processed_at: new Date().toISOString() })
        .eq('id', metric.id);
    }

    return NextResponse.json({
      success: true,
      processed,
      total_metrics_checked: (metrics || []).length,
    });
  } catch (error) {
    console.error('Error processing SLA points:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { AlertRule, Severity } from '@/types/dialedin-types';

export const runtime = 'nodejs';

/**
 * Cron endpoint: Evaluate alert rules against the latest daily data.
 * Generates alert records and optionally sends email notifications.
 *
 * Schedule: Daily at 7:00 AM Mon-Fri (after ETL runs at 6:45 AM)
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Get the most recent report date
    const { data: latestKpi } = await supabaseAdmin
      .from('dialedin_daily_kpis')
      .select('report_date')
      .order('report_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestKpi) {
      return NextResponse.json({ message: 'No KPI data to evaluate', alerts: 0 });
    }

    const reportDate = latestKpi.report_date;

    // 2. Fetch active alert rules
    const { data: rules } = await supabaseAdmin
      .from('dialedin_alert_rules')
      .select('*')
      .eq('is_active', true);

    if (!rules || rules.length === 0) {
      return NextResponse.json({ message: 'No active alert rules', alerts: 0 });
    }

    // 3. Fetch today's data
    const [kpiResult, agentResult] = await Promise.all([
      supabaseAdmin
        .from('dialedin_daily_kpis')
        .select('*')
        .eq('report_date', reportDate)
        .maybeSingle(),
      supabaseAdmin
        .from('dialedin_agent_performance')
        .select('*')
        .eq('report_date', reportDate),
    ]);

    const kpi = kpiResult.data;
    const agents = agentResult.data || [];

    // 4. Evaluate each rule
    const newAlerts: {
      report_date: string;
      rule_id: string;
      severity: Severity;
      agent_name: string | null;
      skill: string | null;
      metric_name: string;
      metric_value: number;
      threshold_value: number;
      message: string;
      details: Record<string, unknown>;
    }[] = [];

    for (const rule of rules as AlertRule[]) {
      if (rule.scope === 'daily_aggregate' && kpi) {
        evaluateAggregateRule(rule, kpi, reportDate, newAlerts);
      } else if (rule.scope === 'agent') {
        evaluateAgentRule(rule, agents, reportDate, newAlerts);
      }
    }

    // 5. Check cooldown — don't re-alert for same rule+agent within cooldown window
    const filteredAlerts = [];
    for (const alert of newAlerts) {
      const rule = rules.find((r: AlertRule) => r.id === alert.rule_id);
      const cooldownHours = rule?.cooldown_hours || 24;
      const cooldownCutoff = new Date();
      cooldownCutoff.setHours(cooldownCutoff.getHours() - cooldownHours);

      let query = supabaseAdmin
        .from('dialedin_alerts')
        .select('id')
        .eq('rule_id', alert.rule_id)
        .gte('created_at', cooldownCutoff.toISOString());

      if (alert.agent_name) {
        query = query.eq('agent_name', alert.agent_name);
      }

      const { data: existing } = await query.limit(1).maybeSingle();
      if (!existing) {
        filteredAlerts.push(alert);
      }
    }

    // 6. Insert new alerts
    if (filteredAlerts.length > 0) {
      await supabaseAdmin.from('dialedin_alerts').insert(filteredAlerts);
    }

    // 7. Send email notifications for critical alerts
    const criticalAlerts = filteredAlerts.filter((a) => a.severity === 'critical');
    if (criticalAlerts.length > 0) {
      await sendAlertEmails(criticalAlerts, rules as AlertRule[]);
    }

    return NextResponse.json({
      reportDate,
      evaluated: rules.length,
      alertsGenerated: filteredAlerts.length,
      criticalAlerts: criticalAlerts.length,
    });
  } catch (err) {
    console.error('Alert check error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Alert check failed' },
      { status: 500 },
    );
  }
}

function evaluateAggregateRule(
  rule: AlertRule,
  kpi: Record<string, unknown>,
  reportDate: string,
  alerts: Array<{
    report_date: string; rule_id: string; severity: Severity;
    agent_name: string | null; skill: string | null; metric_name: string;
    metric_value: number; threshold_value: number; message: string;
    details: Record<string, unknown>;
  }>,
) {
  let metricValue: number | null = null;

  switch (rule.metric) {
    case 'connect_rate':
      metricValue = kpi.connect_rate as number;
      break;
    case 'transfer_volume_delta':
      metricValue = kpi.delta_transfers
        ? ((kpi.delta_transfers as number) / Math.max(kpi.prev_day_transfers as number || 1, 1)) * 100
        : null;
      break;
    default:
      metricValue = kpi[rule.metric] as number | null;
  }

  if (metricValue === null || metricValue === undefined) return;

  const { severity, breached, threshold } = checkThreshold(rule, metricValue);
  if (breached) {
    alerts.push({
      report_date: reportDate,
      rule_id: rule.id,
      severity,
      agent_name: null,
      skill: null,
      metric_name: rule.metric,
      metric_value: metricValue,
      threshold_value: threshold,
      message: `${rule.name}: ${rule.metric} is ${metricValue.toFixed(2)} (threshold: ${threshold})`,
      details: { rule_name: rule.name, scope: 'daily_aggregate' },
    });
  }
}

function evaluateAgentRule(
  rule: AlertRule,
  agents: Record<string, unknown>[],
  reportDate: string,
  alerts: Array<{
    report_date: string; rule_id: string; severity: Severity;
    agent_name: string | null; skill: string | null; metric_name: string;
    metric_value: number; threshold_value: number; message: string;
    details: Record<string, unknown>;
  }>,
) {
  const minHours = rule.min_hours_filter || 0;

  for (const agent of agents) {
    const hoursWorked = (agent.hours_worked as number) || 0;
    if (hoursWorked < minHours) continue;

    // Skip QA/HR accounts
    const name = agent.agent_name as string;
    if (/\b(QA|HR)\b/i.test(name)) continue;

    let metricValue: number | null = null;

    switch (rule.metric) {
      case 'zero_transfers':
        if ((agent.transfers as number) === 0) {
          metricValue = 0;
        }
        break;
      case 'tph':
        metricValue = agent.tph as number;
        break;
      case 'dead_air_ratio':
        metricValue = agent.dead_air_ratio as number;
        break;
      case 'hung_up_ratio': {
        const disps = (agent.dispositions as Record<string, number>) || {};
        const connects = (agent.connects as number) || 0;
        metricValue = connects > 0 ? ((disps.hung_up_transfer || 0) / connects) * 100 : 0;
        break;
      }
      default:
        metricValue = agent[rule.metric] as number | null;
    }

    if (metricValue === null || metricValue === undefined) continue;

    // Special handling for zero_transfers — it's a boolean condition
    if (rule.metric === 'zero_transfers') {
      alerts.push({
        report_date: reportDate,
        rule_id: rule.id,
        severity: 'warning',
        agent_name: name,
        skill: (agent.skill as string) || null,
        metric_name: 'transfers',
        metric_value: 0,
        threshold_value: 0,
        message: `${name} worked ${hoursWorked.toFixed(1)}h with zero transfers`,
        details: {
          hours_worked: hoursWorked,
          dials: agent.dials,
          contacts: agent.contacts,
        },
      });
      continue;
    }

    const { severity, breached, threshold } = checkThreshold(rule, metricValue);
    if (breached) {
      alerts.push({
        report_date: reportDate,
        rule_id: rule.id,
        severity,
        agent_name: name,
        skill: (agent.skill as string) || null,
        metric_name: rule.metric,
        metric_value: metricValue,
        threshold_value: threshold,
        message: `${name}: ${rule.name} — ${rule.metric} is ${metricValue.toFixed(2)} (threshold: ${threshold})`,
        details: { hours_worked: hoursWorked },
      });
    }
  }
}

function checkThreshold(
  rule: AlertRule,
  value: number,
): { severity: Severity; breached: boolean; threshold: number } {
  const op = rule.operator;
  const warn = rule.warning_threshold;
  const crit = rule.critical_threshold;

  // Check critical first
  if (crit !== null && crit !== undefined) {
    if (
      (op === 'gte' && value >= crit) ||
      (op === 'lte' && value <= crit) ||
      (op === 'gt' && value > crit) ||
      (op === 'lt' && value < crit)
    ) {
      return { severity: 'critical', breached: true, threshold: crit };
    }
  }

  // Check warning
  if (warn !== null && warn !== undefined) {
    if (
      (op === 'gte' && value >= warn) ||
      (op === 'lte' && value <= warn) ||
      (op === 'gt' && value > warn) ||
      (op === 'lt' && value < warn)
    ) {
      return { severity: 'warning', breached: true, threshold: warn };
    }
  }

  return { severity: 'info', breached: false, threshold: warn || crit || 0 };
}

async function sendAlertEmails(
  alerts: Array<{ message: string; severity: string; agent_name: string | null; report_date: string }>,
  rules: AlertRule[],
) {
  // Collect all unique notify_emails from triggered rules
  const emailSet = new Set<string>();
  for (const alert of alerts) {
    const rule = rules.find((r) => alerts.some((a) => a.message.includes(r.name)));
    if (rule?.notify_emails) {
      for (const email of rule.notify_emails) {
        emailSet.add(email);
      }
    }
  }

  // Always notify admin
  emailSet.add('miki@pitchperfectsolutions.net');

  const alertSummary = alerts
    .map((a) => `• [${a.severity.toUpperCase()}] ${a.message}`)
    .join('\n');

  const subject = `⚠️ DialedIn Alert: ${alerts.length} critical issue${alerts.length > 1 ? 's' : ''} — ${alerts[0].report_date}`;
  const body = `DialedIn Red-Line Alerts\n${'='.repeat(40)}\n\n${alertSummary}\n\nView details: ${process.env.NEXT_PUBLIC_APP_URL || 'https://pitch-vision-web.vercel.app'}/executive/dialedin`;

  try {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: Array.from(emailSet).join(', '),
        subject,
        text: body,
        html: `<pre style="font-family: monospace; white-space: pre-wrap;">${body}</pre>`,
      }),
    });

    // Mark alerts as email_sent
    for (const alert of alerts) {
      // We can't update by matching message, but this runs right after insert
      // The email_sent flag is informational
    }
  } catch (err) {
    console.error('Failed to send alert emails:', err);
  }
}

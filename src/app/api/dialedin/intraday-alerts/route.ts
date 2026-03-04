import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { openDmChannel, postSlackMessage } from '@/utils/slack-helpers';
import { getBreakEvenTPH } from '@/utils/dialedin-revenue';
import { CAMPAIGN_MANAGERS, CAMPAIGN_TO_TEAM_SUBSTRING } from '@/lib/campaign-config';

export const runtime = 'nodejs';

interface SnapshotRow {
  agent_name: string;
  team: string | null;
  sla_hr: number;
  hours_worked: number;
  transfers: number;
  snapshot_at: string;
}

const COOLDOWN_HOURS = 4;
const CONSECUTIVE_SNAPSHOTS_THRESHOLD = 4; // 4 snapshots = ~2 hours

/**
 * POST /api/dialedin/intraday-alerts
 *
 * Triggered after each scrape (EC2 callback) or as a cron fallback.
 * Evaluates intraday alert conditions and sends Slack DMs to campaign managers.
 *
 * Body: { snapshot_at?: string }
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let snapshotAt: string | undefined;
  try {
    const body = await request.json();
    snapshotAt = body.snapshot_at;
  } catch { /* no body is fine */ }

  const today = new Date();
  const targetDate = snapshotAt
    ? snapshotAt.split('T')[0]
    : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Check if within business hours (9 AM - 7 PM ET, weekdays)
  const etHour = parseInt(today.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
  const etDay = parseInt(today.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'narrow' })) || today.getDay();
  if (etDay === 0 || etDay === 6 || etHour < 10 || etHour > 18) {
    return NextResponse.json({ message: 'Outside business hours, skipped', alerts: 0 });
  }

  // Fetch all snapshots for today
  const { data: allSnapshots, error } = await supabaseAdmin
    .from('dialedin_intraday_snapshots')
    .select('agent_name, team, sla_hr, hours_worked, transfers, snapshot_at')
    .eq('snapshot_date', targetDate)
    .order('snapshot_at', { ascending: true });

  if (error || !allSnapshots || allSnapshots.length === 0) {
    return NextResponse.json({ message: 'No snapshot data', alerts: 0 });
  }

  const rows = allSnapshots as SnapshotRow[];
  const snapshotTimes = [...new Set(rows.map((r) => r.snapshot_at))].sort();

  if (snapshotTimes.length < CONSECUTIVE_SNAPSHOTS_THRESHOLD) {
    return NextResponse.json({ message: 'Not enough snapshots yet', alerts: 0, snapshots: snapshotTimes.length });
  }

  const alerts: { alert_type: string; agent_name: string | null; team: string | null; details: Record<string, unknown> }[] = [];

  // --- Alert 1: Below break-even for 4 consecutive snapshots ---
  const recentTimes = snapshotTimes.slice(-CONSECUTIVE_SNAPSHOTS_THRESHOLD);
  const agentNames = [...new Set(rows.filter((r) => r.hours_worked > 0).map((r) => r.agent_name))];

  for (const agentName of agentNames) {
    const agentSnapshots = recentTimes.map((t) =>
      rows.find((r) => r.snapshot_at === t && r.agent_name === agentName),
    );

    // Must have data in all recent snapshots and >1hr worked in latest
    const latestSnap = agentSnapshots[agentSnapshots.length - 1];
    if (!latestSnap || latestSnap.hours_worked < 1) continue;

    const team = latestSnap.team?.toLowerCase() || '';
    const isMedicare = team.includes('aragon') || team.includes('medicare') || team.includes('whatif') || team.includes('elite') || team.includes('brandon');
    const be = isMedicare ? getBreakEvenTPH('Aragon Team A') : getBreakEvenTPH('Jade ACA Team');

    const allBelow = agentSnapshots.every((s) => s && s.sla_hr < be && s.hours_worked > 0);

    if (allBelow) {
      alerts.push({
        alert_type: 'below_break_even',
        agent_name: agentName,
        team: latestSnap.team,
        details: {
          sla_hr: latestSnap.sla_hr,
          break_even: be,
          hours_worked: latestSnap.hours_worked,
          transfers: latestSnap.transfers,
          consecutive_snapshots: CONSECUTIVE_SNAPSHOTS_THRESHOLD,
        },
      });
    }
  }

  // --- Alert 2: Team SLA decline >15% vs 2 hours ago ---
  if (snapshotTimes.length >= 5) {
    const latestTime = snapshotTimes[snapshotTimes.length - 1];
    const baselineTime = snapshotTimes[snapshotTimes.length - 5]; // ~2hrs ago

    // Group by team
    const teamLatest = new Map<string, { sla_sum: number; count: number }>();
    const teamBaseline = new Map<string, { sla_sum: number; count: number }>();

    for (const r of rows.filter((r) => r.snapshot_at === latestTime && r.hours_worked > 0 && r.team)) {
      const t = r.team!;
      const entry = teamLatest.get(t) || { sla_sum: 0, count: 0 };
      entry.sla_sum += r.sla_hr;
      entry.count++;
      teamLatest.set(t, entry);
    }

    for (const r of rows.filter((r) => r.snapshot_at === baselineTime && r.hours_worked > 0 && r.team)) {
      const t = r.team!;
      const entry = teamBaseline.get(t) || { sla_sum: 0, count: 0 };
      entry.sla_sum += r.sla_hr;
      entry.count++;
      teamBaseline.set(t, entry);
    }

    for (const [teamName, latest] of teamLatest) {
      const baseline = teamBaseline.get(teamName);
      if (!baseline || baseline.count < 3) continue;

      const latestAvg = latest.sla_sum / latest.count;
      const baselineAvg = baseline.sla_sum / baseline.count;

      if (baselineAvg > 0 && ((baselineAvg - latestAvg) / baselineAvg) > 0.15) {
        alerts.push({
          alert_type: 'team_sla_decline',
          agent_name: null,
          team: teamName,
          details: {
            current_avg: Math.round(latestAvg * 100) / 100,
            baseline_avg: Math.round(baselineAvg * 100) / 100,
            decline_pct: Math.round(((baselineAvg - latestAvg) / baselineAvg) * 100),
          },
        });
      }
    }
  }

  // --- Cooldown check + insert ---
  const alertsToSend: typeof alerts = [];

  for (const alert of alerts) {
    // Check cooldown
    const cooldownSince = new Date(Date.now() - COOLDOWN_HOURS * 3600_000).toISOString();
    const { count } = await supabaseAdmin
      .from('dialedin_intraday_alert_log')
      .select('id', { count: 'exact', head: true })
      .eq('alert_type', alert.alert_type)
      .eq('snapshot_date', targetDate)
      .gte('created_at', cooldownSince)
      .eq(alert.agent_name ? 'agent_name' : 'team', alert.agent_name || alert.team || '');

    if ((count ?? 0) > 0) continue; // cooldown active

    alertsToSend.push(alert);

    // Log the alert
    await supabaseAdmin.from('dialedin_intraday_alert_log').insert({
      alert_type: alert.alert_type,
      agent_name: alert.agent_name,
      team: alert.team,
      snapshot_date: targetDate,
      details: alert.details,
      notified_via: ['slack'],
    });
  }

  // --- Send Slack DMs to relevant managers ---
  let slackSent = 0;

  for (const alert of alertsToSend) {
    const managerSlackIds = await resolveManagerSlackIds(alert.team);

    for (const slackId of managerSlackIds) {
      const message = formatAlertMessage(alert);
      const dm = await openDmChannel(slackId);
      if (dm.ok && dm.channelId) {
        await postSlackMessage(dm.channelId, message);
        slackSent++;
      }
    }
  }

  return NextResponse.json({
    alerts_evaluated: alerts.length,
    alerts_sent: alertsToSend.length,
    slack_messages: slackSent,
    snapshot_date: targetDate,
  });
}

// Also support GET (for Vercel cron fallback)
export async function GET(request: NextRequest) {
  return POST(request);
}

// --- Helpers ---

async function resolveManagerSlackIds(team: string | null): Promise<string[]> {
  if (!team) return [];

  // Find which campaign this team belongs to
  const teamLower = team.toLowerCase();
  let campaignName: string | null = null;
  for (const [campaign, substring] of Object.entries(CAMPAIGN_TO_TEAM_SUBSTRING)) {
    if (teamLower.includes(substring)) {
      campaignName = campaign;
      break;
    }
  }
  if (!campaignName) return [];

  const managerStr = CAMPAIGN_MANAGERS[campaignName];
  if (!managerStr) return [];

  const managerNames = managerStr.split(',').map((n) => n.trim()).filter(Boolean);
  const slackIds: string[] = [];

  for (const name of managerNames) {
    const parts = name.split(' ');
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');

    const { data } = await supabaseAdmin
      .from('employee_directory')
      .select('slack_user_id')
      .ilike('first_name', firstName)
      .ilike('last_name', lastName || '%')
      .not('slack_user_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (data?.slack_user_id) {
      slackIds.push(data.slack_user_id);
    }
  }

  return slackIds;
}

function formatAlertMessage(alert: { alert_type: string; agent_name: string | null; team: string | null; details: Record<string, unknown> }): string {
  const d = alert.details;

  if (alert.alert_type === 'below_break_even') {
    return `:warning: *Intraday Alert — Below Break-Even*\n\n` +
      `Agent *${alert.agent_name}* has been below break-even for the last ${d.consecutive_snapshots} snapshots (~2 hours).\n\n` +
      `• Current SLA/hr: *${d.sla_hr}* (B/E: ${d.break_even})\n` +
      `• Transfers: ${d.transfers} | Hours: ${d.hours_worked}\n` +
      `• Team: ${alert.team || 'Unknown'}`;
  }

  if (alert.alert_type === 'team_sla_decline') {
    return `:chart_with_downwards_trend: *Intraday Alert — Team SLA Decline*\n\n` +
      `Team *${alert.team}* avg SLA/hr dropped *${d.decline_pct}%* in the last 2 hours.\n\n` +
      `• Current avg: *${d.current_avg}*\n` +
      `• 2 hours ago: *${d.baseline_avg}*`;
  }

  return `:bell: *Intraday Alert*\n\nType: ${alert.alert_type}\nDetails: ${JSON.stringify(d)}`;
}

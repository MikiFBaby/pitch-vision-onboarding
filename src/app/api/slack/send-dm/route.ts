import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { openDmChannel, postSlackMessage } from "@/utils/slack-helpers";
import { getBreakEvenTPH, getRevenuePerTransfer } from "@/utils/dialedin-revenue";
import { getCadToUsdRate, convertWageToUsd } from "@/utils/fx";
import { fetchNewHireSet, isNewHireAgent } from "@/utils/dialedin-new-hires";

export const runtime = "nodejs";

// ── Break allowance (same formula as intraday + dialedin-kpi) ──
function getBreakAllowanceMin(loggedInMin: number): number {
  return Math.min(69.6, loggedInMin * 0.145);
}

// ── Agent Power Rating (FIFA-style composite score) ──
function computePowerRating(
  avgTph: number | null,
  breakEven: number,
  avgQaScore: number | null,
  tphStdDev: number | null,
  daysWorked: number
): { score: number; grade: string } {
  const perfScore = avgTph != null ? Math.min(100, (avgTph / breakEven) * 50) : null;
  const qaScore = avgQaScore ?? null;
  const consistScore = tphStdDev != null ? Math.max(0, 100 - tphStdDev * 50) : null;
  const attendScore = Math.min(100, (daysWorked / 10) * 100);

  let totalWeight = 0;
  let weightedSum = 0;
  if (perfScore != null) { weightedSum += perfScore * 0.40; totalWeight += 0.40; }
  if (qaScore != null) { weightedSum += qaScore * 0.30; totalWeight += 0.30; }
  if (consistScore != null) { weightedSum += consistScore * 0.15; totalWeight += 0.15; }
  weightedSum += attendScore * 0.15;
  totalWeight += 0.15;

  const normalized = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  let grade: string;
  if (normalized >= 90) grade = "S";
  else if (normalized >= 80) grade = "A";
  else if (normalized >= 70) grade = "B+";
  else if (normalized >= 60) grade = "B";
  else if (normalized >= 50) grade = "C";
  else grade = "D";

  return { score: normalized, grade };
}

// ── Visual break-even bar ──
function beBar(ratio: number): string {
  const pct = Math.round(ratio * 100);
  const filled = Math.min(10, Math.max(0, Math.round(ratio * 10)));
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(10 - filled);
  const emoji = pct >= 100 ? ":white_check_mark:" : pct >= 80 ? ":large_yellow_circle:" : ":red_circle:";
  return `${emoji} \`${bar}\` ${pct}% of break-even`;
}

// ── Performance status ──
function getPerformanceStatus(
  avgTph: number | null,
  breakEven: number,
  pctChange: number | null
): { label: string; emoji: string } {
  if (avgTph == null) return { label: "No Data", emoji: ":black_circle:" };
  const ratio = avgTph / breakEven;
  if (ratio < 0.5) return { label: "Critical", emoji: ":red_circle:" };
  if (pctChange != null && pctChange <= -5) return { label: "Trending Down", emoji: ":small_red_triangle_down:" };
  if (pctChange != null && pctChange >= 5) return { label: "Trending Up", emoji: ":chart_with_upwards_trend:" };
  if (ratio >= 1.0) return { label: "Performing", emoji: ":large_green_circle:" };
  return { label: "Below Target", emoji: ":large_yellow_circle:" };
}

/**
 * POST /api/slack/send-dm
 * Sends a Slack DM with a sports-card-style agent snapshot.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { recipient_slack_id, recipient_name, message, employee_id, sent_by_email, include_snapshot = true } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    if (!employee_id) {
      return NextResponse.json({ error: "employee_id is required" }, { status: 400 });
    }

    // ── Resolve recipient Slack ID ──
    let slackUserId = recipient_slack_id;

    if (!slackUserId && recipient_name) {
      const nameParts = recipient_name.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.length >= 2 ? nameParts.slice(1).join(" ") : "";

      let query = supabaseAdmin
        .from("employee_directory")
        .select("slack_user_id, first_name, last_name")
        .not("slack_user_id", "is", null)
        .neq("slack_user_id", "");

      if (lastName) {
        query = query.ilike("first_name", firstName).ilike("last_name", lastName);
      } else {
        query = query.ilike("first_name", firstName);
      }

      const { data: dirMatch } = await query.maybeSingle();

      if (!dirMatch?.slack_user_id) {
        return NextResponse.json(
          { error: `Could not find Slack ID for "${recipient_name}". They may not have a linked Slack account.` },
          { status: 404 }
        );
      }
      slackUserId = dirMatch.slack_user_id;
    }

    if (!slackUserId) {
      return NextResponse.json({ error: "No recipient specified" }, { status: 400 });
    }

    // ── Parallel: DM channel + sender + employee fetch ──
    const [dmResult, senderResult, empResult] = await Promise.all([
      openDmChannel(slackUserId),
      sent_by_email
        ? supabaseAdmin
            .from("employee_directory")
            .select("first_name, last_name, user_image")
            .ilike("email", sent_by_email)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      recipient_name && include_snapshot
        ? supabaseAdmin
            .from("employee_directory")
            .select("first_name, last_name, email, phone, country, hourly_wage, current_campaigns, role, hired_at, training_start_date, user_image, employee_status, dialedin_name")
            .eq("id", employee_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (!dmResult.ok || !dmResult.channelId) {
      return NextResponse.json(
        { error: `Failed to open DM channel: ${dmResult.error || "Unknown error"}` },
        { status: 500 }
      );
    }

    // ── Resolve sender identity ──
    let senderName = sent_by_email || "Unknown";
    let senderAvatar: string | undefined;
    const sender = senderResult.data;
    if (sender?.first_name && sender?.last_name) {
      senderName = `${sender.first_name} ${sender.last_name}`;
    }
    if (sender?.user_image) {
      senderAvatar = sender.user_image;
    }

    // ── Build Agent Snapshot Card ──
    let blocks: any[] | undefined;
    let notificationText = message.trim();
    const emp = empResult.data;

    if (recipient_name && include_snapshot && emp) {
        const empName = `${emp.first_name} ${emp.last_name}`;
        const empFullName = empName.trim();
        const isAgent = emp.role === "Agent";

        // ── Card header blocks ──
        blocks = [
          { type: "section", text: { type: "mrkdwn", text: message.trim() } },
          { type: "divider" },
          { type: "header", text: { type: "plain_text", text: "\u26a1 AGENT SNAPSHOT", emoji: true } },
        ];

        // Hero photo
        if (emp.user_image) {
          blocks.push({
            type: "image",
            image_url: emp.user_image,
            alt_text: empName,
          });
        }

        // ── Agent-specific data ──
        if (isAgent) {
          const agentLookupName = emp.dialedin_name || empFullName;
          const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
          const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
          const todayDayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" });

          // 11 parallel queries (onboarding step 1 folded in)
          const [perfResult, qaResult, intradayResult, notesResult, newHireSet, cadRate, schedResult, bookedResult, unbookedResult, writeUpsResult, hireResult] = await Promise.all([
            supabaseAdmin
              .from("dialedin_agent_performance")
              .select("report_date, transfers, adjusted_tph, hours_worked, team, dials, connects")
              .ilike("agent_name", agentLookupName)
              .order("report_date", { ascending: false })
              .limit(14),
            supabaseAdmin
              .from("QA Results")
              .select("compliance_score, auto_fail_triggered, auto_fail_overridden")
              .ilike("agent_name", agentLookupName)
              .gte("call_date", thirtyDaysAgo),
            supabaseAdmin
              .from("dialedin_intraday_snapshots")
              .select("transfers, logged_in_time_min, wrap_time_min, pause_time_min, dialed, connects, sla_hr")
              .ilike("agent_name", agentLookupName)
              .eq("snapshot_date", todayET)
              .order("snapshot_at", { ascending: false })
              .limit(1),
            supabaseAdmin
              .from("employee_notes")
              .select("id")
              .eq("employee_id", employee_id),
            fetchNewHireSet(supabaseAdmin),
            getCadToUsdRate(),
            supabaseAdmin
              .from("Agent Schedule")
              .select("*")
              .ilike("First Name", emp.first_name.trim())
              .ilike("Last Name", emp.last_name?.trim() || "")
              .limit(1),
            supabaseAdmin
              .from("Booked Days Off")
              .select('"Agent Name", "Date"')
              .ilike("Agent Name", empFullName),
            supabaseAdmin
              .from("Non Booked Days Off")
              .select('"Agent Name", "Date", "Reason"')
              .ilike("Agent Name", empFullName),
            supabaseAdmin
              .from("employee_write_ups")
              .select("id")
              .eq("employee_id", employee_id),
            supabaseAdmin
              .from("onboarding_new_hires")
              .select("id")
              .eq("employee_id", employee_id)
              .maybeSingle(),
          ]);

          // Onboarding progress (only if hire record exists)
          let onboardingInfo: { completed: number; total: number } | null = null;
          if (hireResult.data) {
            const { data: progress } = await supabaseAdmin
              .from("onboarding_progress")
              .select("status")
              .eq("new_hire_id", hireResult.data.id);
            if (progress) {
              onboardingInfo = {
                total: progress.length,
                completed: progress.filter((p: any) => p.status === "completed").length,
              };
            }
          }

          // ── Compute perf aggregates ──
          let team: string | null = null;
          let totalTransfers = 0;
          let totalHours = 0;
          let avgTph: number | null = null;
          let tphStdDev: number | null = null;
          let perfLen = 0;
          let pctChange: number | null = null;

          if (perfResult.data?.length) {
            const records = perfResult.data;
            perfLen = records.length;
            totalTransfers = records.reduce((s, r: any) => s + (Number(r.transfers) || 0), 0);
            totalHours = records.reduce((s, r: any) => s + (Number(r.hours_worked) || 0), 0);
            const tphValues = records.map((r: any) => Number(r.adjusted_tph)).filter((v) => !isNaN(v) && v != null);
            avgTph = tphValues.length > 0 ? tphValues.reduce((a, b) => a + b, 0) / tphValues.length : null;
            team = (records[0] as any).team;

            if (!team && emp.current_campaigns?.length) {
              const c = emp.current_campaigns[0].toLowerCase();
              if (c.includes("medicare") || c.includes("whatif")) team = "medicare";
              else if (c.includes("aca")) team = "jade aca";
            }

            if (tphValues.length >= 2) {
              const mean = tphValues.reduce((a, b) => a + b, 0) / tphValues.length;
              const variance = tphValues.reduce((s, v) => s + (v - mean) ** 2, 0) / tphValues.length;
              tphStdDev = Math.sqrt(variance);
            }

            if (tphValues.length >= 4) {
              const mid = Math.floor(tphValues.length / 2);
              const avgRecent = tphValues.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
              const avgPrior = tphValues.slice(mid).reduce((a, b) => a + b, 0) / (tphValues.length - mid);
              pctChange = avgPrior > 0 ? ((avgRecent - avgPrior) / avgPrior) * 100 : 0;
            }
          }

          // ── QA aggregates ──
          let avgQaScore: number | null = null;
          let qaPassRate: number | null = null;
          let qaAutoFails = 0;
          let qaCallCount = 0;

          if (qaResult.data?.length) {
            const rows = qaResult.data;
            qaCallCount = rows.length;
            const scores = rows.map((r: any) => Number(r.compliance_score) || 0);
            avgQaScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
            qaPassRate = Math.round((scores.filter((s) => s >= 70).length / rows.length) * 100);
            qaAutoFails = rows.filter((r: any) => r.auto_fail_triggered && !r.auto_fail_overridden).length;
          }

          // ── Schedule ──
          const schedRow = schedResult.data?.[0] as any;
          const todayShift = schedRow?.[todayDayOfWeek] || null;

          // ── Attendance (30d) ──
          const thirtyDaysAgoMs = Date.now() - 30 * 86400000;
          const filterRecent = (rows: any[]) =>
            rows.filter((r) => {
              const d = new Date(r["Date"]);
              return !isNaN(d.getTime()) && d.getTime() >= thirtyDaysAgoMs;
            });
          const recentBooked = filterRecent(bookedResult.data || []);
          const recentUnbooked = filterRecent(unbookedResult.data || []);
          const allAbsenceDates = [...recentBooked, ...recentUnbooked]
            .map((r: any) => new Date(r["Date"]).getTime())
            .filter((t) => !isNaN(t));
          const lastEventDaysAgo = allAbsenceDates.length > 0 ? Math.round((Date.now() - Math.max(...allAbsenceDates)) / 86400000) : null;

          // ── Write-ups ──
          const writeUpCount = writeUpsResult.data?.length || 0;

          // ── Derived values ──
          const be = getBreakEvenTPH(team);
          const wageUsd = emp.hourly_wage ? convertWageToUsd(Number(emp.hourly_wage), emp.country, cadRate) : null;
          const perfStatus = getPerformanceStatus(avgTph, be, pctChange);

          // ════════════════════════════════════════════
          // CARD: Employee Info + Status
          // ════════════════════════════════════════════
          const infoParts: string[] = [];
          if (emp.role) infoParts.push(emp.role);
          if (emp.current_campaigns?.length) infoParts.push(emp.current_campaigns.join(", "));
          if (emp.country) infoParts.push(emp.country);
          if (emp.hourly_wage) infoParts.push(`$${emp.hourly_wage}/hr${emp.country === "Canada" ? " CAD" : ""}`);

          const infoLine2Parts: string[] = [];
          if (emp.hired_at) infoLine2Parts.push(`Since ${new Date(emp.hired_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`);
          if (emp.employee_status) infoLine2Parts.push(emp.employee_status);
          if (emp.email) infoLine2Parts.push(emp.email);

          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${empName.toUpperCase()}*  ${perfStatus.emoji} _${perfStatus.label}_\n${infoParts.join(" \u00b7 ")}${infoLine2Parts.length ? "\n" + infoLine2Parts.join(" \u00b7 ") : ""}`,
            },
          });

          // ════════════════════════════════════════════
          // CARD: Power Rating
          // ════════════════════════════════════════════
          const { score: powerScore, grade } = computePowerRating(avgTph, be, avgQaScore, tphStdDev, perfLen);
          const ratingLine = perfLen > 0 || qaCallCount > 0
            ? `\u2501\u2501\u2501\u2501\u2501\u2501 \u26a1 *POWER RATING: ${powerScore}* \u00b7 ${grade} \u2501\u2501\u2501\u2501\u2501\u2501`
            : `\u2501\u2501\u2501\u2501\u2501\u2501 \u26a1 *POWER RATING:* \u2014 \u00b7 _Insufficient data_ \u2501\u2501\u2501\u2501\u2501\u2501`;

          blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: ratingLine }] });

          // ════════════════════════════════════════════
          // SECTION: LIVE TODAY
          // ════════════════════════════════════════════
          if (intradayResult.data?.length) {
            const snap = intradayResult.data[0] as any;
            const loggedIn = Number(snap.logged_in_time_min) || 0;
            const wrapMin = Number(snap.wrap_time_min) || 0;
            const pauseMin = Number(snap.pause_time_min) || 0;
            const breakAllowance = getBreakAllowanceMin(loggedIn);
            const paidMin = loggedIn - wrapMin - pauseMin + breakAllowance;
            const todayTransfers = Number(snap.transfers) || 0;
            const adjSlaHr = paidMin > 0 ? todayTransfers / (paidMin / 60) : 0;
            const todayEmoji = adjSlaHr >= be ? ":zap:" : ":hourglass_flowing_sand:";
            const hrs = Math.floor(loggedIn / 60);
            const mins = Math.round(loggedIn % 60);
            const todayConnects = Number(snap.connects) || 0;
            const todayDials = Number(snap.dialed) || 0;
            const connectRate = todayDials > 0 ? Math.round((todayConnects / todayDials) * 100) : 0;

            const todayHours = loggedIn / 60;
            const todayLaborCost = wageUsd != null ? todayHours * wageUsd : null;
            const todayCostPerSla = todayLaborCost != null && todayTransfers > 0 ? todayLaborCost / todayTransfers : null;

            const todayFields: any[] = [
              { type: "mrkdwn", text: `*SLA/hr*\n${todayEmoji} ${adjSlaHr.toFixed(2)}` },
              { type: "mrkdwn", text: `*SLA*\n${todayTransfers}` },
              { type: "mrkdwn", text: `*Hours*\n${hrs}h ${mins}m` },
              { type: "mrkdwn", text: `*Dials*\n${todayDials}` },
              { type: "mrkdwn", text: `*Connects*\n${todayConnects}` },
              { type: "mrkdwn", text: `*Connect Rate*\n${connectRate}%` },
            ];

            if (todayLaborCost != null) {
              todayFields.push(
                { type: "mrkdwn", text: `*Labor*\n$${todayLaborCost.toFixed(0)}` },
                { type: "mrkdwn", text: `*Cost/SLA*\n${todayCostPerSla != null ? "$" + todayCostPerSla.toFixed(2) : "N/A"}` },
              );
            }

            blocks.push(
              { type: "context", elements: [{ type: "mrkdwn", text: ":satellite: *LIVE TODAY*" }] },
              { type: "section", fields: todayFields },
              { type: "context", elements: [{ type: "mrkdwn", text: beBar(adjSlaHr / be) }] }
            );
          }

          // ════════════════════════════════════════════
          // SECTION: LATEST DAY
          // ════════════════════════════════════════════
          if (perfResult.data?.length) {
            const latest = perfResult.data[0] as any;
            const latestTph = Number(latest.adjusted_tph) || 0;
            const latestSla = Number(latest.transfers) || 0;
            const latestHours = Number(latest.hours_worked) || 0;
            const latestDate = new Date(latest.report_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const revPerSla = getRevenuePerTransfer(team, null);
            const latestRevenue = latestSla * revPerSla;
            const latestCost = wageUsd != null ? latestHours * wageUsd : null;
            const latestPnl = latestCost != null ? latestRevenue - latestCost : null;
            const latestTphEmoji = latestTph >= be ? ":chart_with_upwards_trend:" : ":small_red_triangle_down:";

            const latestFields: any[] = [
              { type: "mrkdwn", text: `*SLA/hr*\n${latestTphEmoji} ${latestTph.toFixed(2)}` },
              { type: "mrkdwn", text: `*SLA*\n${latestSla}` },
              { type: "mrkdwn", text: `*Revenue*\n$${latestRevenue.toFixed(0)}` },
            ];

            if (latestPnl != null) {
              latestFields.push({ type: "mrkdwn", text: `*P&L*\n${latestPnl >= 0 ? ":white_check_mark:" : ":x:"} ${latestPnl >= 0 ? "+" : ""}$${latestPnl.toFixed(0)}` });
            } else {
              latestFields.push({ type: "mrkdwn", text: `*Hours*\n${latestHours.toFixed(1)}h` });
            }

            blocks.push(
              { type: "context", elements: [{ type: "mrkdwn", text: `:calendar: *LATEST DAY* \u2014 ${latestDate}` }] },
              { type: "section", fields: latestFields },
              { type: "context", elements: [{ type: "mrkdwn", text: beBar(latestTph / be) }] }
            );
          }

          // ════════════════════════════════════════════
          // SECTION: 14-DAY AVERAGE
          // ════════════════════════════════════════════
          if (perfLen > 0) {
            const tphVal = avgTph != null ? avgTph.toFixed(2) : "N/A";
            const tphEmoji = avgTph != null && avgTph >= be ? ":chart_with_upwards_trend:" : ":small_red_triangle_down:";

            blocks.push(
              { type: "context", elements: [{ type: "mrkdwn", text: ":bar_chart: *14-DAY AVERAGE*" }] },
              {
                type: "section",
                fields: [
                  { type: "mrkdwn", text: `*Avg SLA/hr*\n${tphEmoji} ${tphVal}` },
                  { type: "mrkdwn", text: `*Total SLA*\n${totalTransfers}` },
                  { type: "mrkdwn", text: `*Avg Hours*\n${(totalHours / perfLen).toFixed(1)}h` },
                  { type: "mrkdwn", text: `*Shifts*\n${perfLen}` },
                ],
              },
              { type: "context", elements: [{ type: "mrkdwn", text: avgTph != null ? beBar(avgTph / be) : ":black_circle: No TPH data" }] }
            );
          }

          // ════════════════════════════════════════════
          // SECTION: ECONOMICS
          // ════════════════════════════════════════════
          if (perfLen > 0 && wageUsd != null) {
            const laborCost = totalHours * wageUsd;
            const costPerSla = totalTransfers > 0 ? laborCost / totalTransfers : 0;
            const revPerSla = getRevenuePerTransfer(team, null);
            const marginPerSla = revPerSla - costPerSla;
            const marginEmoji = marginPerSla >= 0 ? ":white_check_mark:" : ":x:";
            const marginSign = marginPerSla >= 0 ? "+" : "";
            const totalRevenue = totalTransfers * revPerSla;
            const roi = laborCost > 0 ? ((totalRevenue - laborCost) / laborCost) * 100 : 0;
            const roiEmoji = roi >= 0 ? ":moneybag:" : ":rotating_light:";

            blocks.push(
              { type: "context", elements: [{ type: "mrkdwn", text: ":money_with_wings: *ECONOMICS* (14d)" }] },
              {
                type: "section",
                fields: [
                  { type: "mrkdwn", text: `*Labor*\n$${laborCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
                  { type: "mrkdwn", text: `*Cost/SLA*\n$${costPerSla.toFixed(2)}` },
                  { type: "mrkdwn", text: `*Rev/SLA*\n$${revPerSla.toFixed(2)}` },
                  { type: "mrkdwn", text: `*Margin/SLA*\n${marginEmoji} ${marginSign}$${Math.abs(marginPerSla).toFixed(2)}` },
                ],
              },
              { type: "context", elements: [{ type: "mrkdwn", text: `${roiEmoji} ROI: ${roi >= 0 ? "+" : ""}${roi.toFixed(0)}% \u00b7 Revenue: $${totalRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}` }] }
            );
          } else if (perfLen > 0 && wageUsd == null) {
            blocks.push({
              type: "context",
              elements: [{ type: "mrkdwn", text: ":money_with_wings: *ECONOMICS* \u2014 _Wage data not available_" }],
            });
          }

          // ════════════════════════════════════════════
          // SECTION: QA COMPLIANCE
          // ════════════════════════════════════════════
          if (qaCallCount > 0) {
            const scoreEmoji = avgQaScore! >= 70 ? ":white_check_mark:" : avgQaScore! >= 40 ? ":warning:" : ":x:";
            const afEmoji = qaAutoFails > 0 ? ":rotating_light:" : ":shield:";

            blocks.push(
              { type: "context", elements: [{ type: "mrkdwn", text: ":mag: *QA COMPLIANCE* (30d)" }] },
              {
                type: "section",
                fields: [
                  { type: "mrkdwn", text: `*Score*\n${scoreEmoji} ${avgQaScore}/100` },
                  { type: "mrkdwn", text: `*Pass Rate*\n${qaPassRate}%` },
                  { type: "mrkdwn", text: `*Auto-Fails*\n${afEmoji} ${qaAutoFails}` },
                  { type: "mrkdwn", text: `*Reviewed*\n${qaCallCount} calls` },
                ],
              }
            );
          }

          // ════════════════════════════════════════════
          // SECTION: SCHEDULE + ATTENDANCE
          // ════════════════════════════════════════════
          const infoLines: string[] = [];

          if (todayShift && todayShift.toString().trim() && todayShift.toString().trim().toLowerCase() !== "off") {
            infoLines.push(`:calendar: *Schedule* \u00b7 Today (${todayDayOfWeek.slice(0, 3)}): ${todayShift.toString().trim()}`);
          } else if (todayShift && todayShift.toString().trim().toLowerCase() === "off") {
            infoLines.push(`:calendar: *Schedule* \u00b7 Today: OFF`);
          } else if (schedRow) {
            infoLines.push(`:calendar: *Schedule* \u00b7 Today: _No shift scheduled_`);
          }

          if (recentBooked.length > 0 || recentUnbooked.length > 0) {
            const unbookedEmoji = recentUnbooked.length >= 6 ? ":red_circle:" : recentUnbooked.length >= 3 ? ":large_yellow_circle:" : ":large_green_circle:";
            const attParts = [
              `:palm_tree: Planned: ${recentBooked.length}`,
              `${unbookedEmoji} Unplanned: ${recentUnbooked.length}`,
            ];
            if (lastEventDaysAgo != null) attParts.push(`Last: ${lastEventDaysAgo}d ago`);
            infoLines.push(`:clipboard: *Attendance (30d)* \u00b7 ${attParts.join(" \u00b7 ")}`);
          }

          for (const line of infoLines) {
            blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: line }] });
          }

          // ════════════════════════════════════════════
          // FOOTER: Trend + Badges
          // ════════════════════════════════════════════
          blocks.push({ type: "divider" });

          if (pctChange != null && perfLen > 0) {
            let trendText: string;
            if (pctChange >= 5) trendText = ":arrow_upper_right: Trending up";
            else if (pctChange <= -5) trendText = ":arrow_lower_right: Trending down";
            else trendText = ":arrow_right: Flat";

            let consistencyText: string;
            if (tphStdDev != null) {
              if (tphStdDev < 0.5) consistencyText = ":star: Very consistent";
              else if (tphStdDev < 1.0) consistencyText = "Consistent";
              else consistencyText = ":warning: Inconsistent";
            } else {
              consistencyText = "N/A";
            }

            blocks.push({
              type: "context",
              elements: [{ type: "mrkdwn", text: `${trendText} \u00b7 ${consistencyText} \u00b7 ${perfLen} shifts` }],
            });
          }

          const badges: string[] = [];
          const notesCount = notesResult.data?.length || 0;
          badges.push(notesCount > 0 ? `:memo: ${notesCount} note${notesCount !== 1 ? "s" : ""}` : ":memo: No notes");
          if (writeUpCount > 0) {
            badges.push(`:pencil2: ${writeUpCount} write-up${writeUpCount !== 1 ? "s" : ""}`);
          }
          if (onboardingInfo) {
            badges.push(`:clipboard: ${onboardingInfo.completed}/${onboardingInfo.total} onboarded`);
          }
          if (isNewHireAgent(agentLookupName, newHireSet)) {
            badges.push(":seedling: New Hire");
          }

          blocks.push({
            type: "context",
            elements: [{ type: "mrkdwn", text: badges.join(" \u00b7 ") }],
          });

        } else {
          // ── Non-agent: compact info only ──
          const infoParts: string[] = [];
          if (emp.role) infoParts.push(emp.role);
          if (emp.current_campaigns?.length) infoParts.push(emp.current_campaigns.join(", "));
          if (emp.country) infoParts.push(emp.country);
          if (emp.email) infoParts.push(emp.email);

          const infoLine2Parts: string[] = [];
          if (emp.hired_at) infoLine2Parts.push(`Since ${new Date(emp.hired_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`);
          if (emp.employee_status) infoLine2Parts.push(emp.employee_status);

          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${empName.toUpperCase()}*\n${infoParts.join(" \u00b7 ")}${infoLine2Parts.length ? "\n" + infoLine2Parts.join(" \u00b7 ") : ""}`,
            },
          });
        }

        // ── Footer (all recipients) ──
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pitchvision.io";
        const profileUrl = `${appUrl}/hr?employee=${employee_id}`;

        blocks.push(
          { type: "divider" },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "View Full Profile", emoji: true },
                url: profileUrl,
                action_id: "view_profile",
              },
            ],
          },
          {
            type: "context",
            elements: [
              { type: "mrkdwn", text: `\u26a1 Pitch Vision HR \u00b7 ${new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}` },
            ],
          }
        );

        // Notification text
        const campaignTag = emp.current_campaigns?.length ? ` (${emp.current_campaigns[0]})` : "";
        const preview = message.trim().length > 150 ? message.trim().slice(0, 150) + "..." : message.trim();
        notificationText = `RE: ${empName}${campaignTag} \u2014 ${preview}`;
    }

    // ── Send message ──
    const msgResult = await postSlackMessage(
      dmResult.channelId,
      notificationText,
      blocks,
      undefined,
      { username: senderName, icon_url: senderAvatar }
    );
    if (!msgResult?.ok) {
      return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    }

    // ── Audit trail (fire-and-forget — don't block response) ──
    supabaseAdmin.from("employee_write_ups").insert({
      employee_id,
      type: "slack_dm",
      subject: `DM to ${recipient_name || "Employee"}`,
      body: message.trim(),
      sent_by: senderName,
      sent_at: new Date().toISOString(),
      status: "sent",
      message_id: msgResult.ts || null,
    }).then(({ error }) => {
      if (error) console.error("[send-dm] Audit trail insert failed:", error.message);
    });

    return NextResponse.json({
      success: true,
      message_ts: msgResult.ts,
    });
  } catch (err: any) {
    console.error("[send-dm] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

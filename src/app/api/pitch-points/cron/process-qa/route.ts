import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  getActiveRules,
  matchScoreToRule,
  createTransaction,
  updateStreak,
  checkRateLimit,
  matchAgentNameToUser,
  getConfig,
} from '@/utils/pitch-points-utils';
import { COMPLIANCE_THRESHOLD } from '@/utils/qa-utils';

export async function POST() {
  try {
    const config = await getConfig();
    if (!config.system_enabled) {
      return NextResponse.json({ success: true, message: 'System disabled', processed: 0 });
    }

    // Get active QA performance rules
    const qaRules = await getActiveRules('qa_performance');
    const streakRules = await getActiveRules('compliance_streak');

    if (qaRules.length === 0) {
      return NextResponse.json({ success: true, message: 'No active QA rules', processed: 0 });
    }

    // Fetch approved QA calls from the last 24 hours that haven't been processed yet
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: approvedCalls, error: callsError } = await supabaseAdmin
      .from('Pitch Perfect')
      .select('id, agent_name, compliance_score, call_date, auto_fail_triggered')
      .eq('qa_status', 'approved')
      .gte('qa_reviewed_at', since)
      .order('qa_reviewed_at', { ascending: true });

    if (callsError) throw callsError;

    // Find already processed call IDs
    const callIds = (approvedCalls || []).map((c: { id: number }) => String(c.id));
    const { data: existingTxns } = await supabaseAdmin
      .from('pitch_points_transactions')
      .select('source_id')
      .eq('source_type', 'qa_review')
      .in('source_id', callIds);

    const processedIds = new Set((existingTxns || []).map((t: { source_id: string }) => t.source_id));

    let processed = 0;
    let streakBonuses = 0;

    for (const call of (approvedCalls || [])) {
      const callIdStr = String(call.id);
      if (processedIds.has(callIdStr)) continue;

      // Match agent to user
      const agentMatch = await matchAgentNameToUser(call.agent_name || '');
      if (!agentMatch) continue;

      const { userId, employeeId } = agentMatch;
      const score = call.compliance_score || 0;
      const isCompliant = score >= COMPLIANCE_THRESHOLD && !call.auto_fail_triggered;

      // Award QA score points
      const matchedRule = matchScoreToRule(score, qaRules);
      if (matchedRule) {
        const withinLimit = await checkRateLimit(userId, matchedRule.rule_key, matchedRule.max_per_day, matchedRule.max_per_week);
        if (withinLimit) {
          await createTransaction({
            userId,
            employeeId,
            type: 'earn',
            amount: matchedRule.points_amount,
            ruleId: matchedRule.id,
            ruleKey: matchedRule.rule_key,
            sourceType: 'qa_review',
            sourceId: callIdStr,
            description: `QA Score ${score} on call ${callIdStr}`,
            metadata: { score, call_date: call.call_date, agent_name: call.agent_name },
          });
          processed++;
        }
      }

      // Update streak
      const { newStreak } = await updateStreak(userId, isCompliant);

      // Check for streak bonuses
      if (isCompliant) {
        for (const streakRule of streakRules) {
          if (streakRule.streak_count && newStreak === streakRule.streak_count) {
            const withinLimit = await checkRateLimit(userId, streakRule.rule_key, streakRule.max_per_day, streakRule.max_per_week);
            if (withinLimit) {
              await createTransaction({
                userId,
                employeeId,
                type: 'earn',
                amount: streakRule.points_amount,
                ruleId: streakRule.id,
                ruleKey: streakRule.rule_key,
                sourceType: 'qa_review',
                sourceId: `streak_${callIdStr}`,
                description: `${streakRule.label}: ${newStreak} consecutive compliant calls!`,
                metadata: { streak_count: newStreak, trigger_call_id: callIdStr },
              });
              streakBonuses++;
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      streak_bonuses: streakBonuses,
      total_calls_checked: (approvedCalls || []).length,
    });
  } catch (error) {
    console.error('Error processing QA points:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

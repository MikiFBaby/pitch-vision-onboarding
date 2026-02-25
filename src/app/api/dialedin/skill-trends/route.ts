import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { SkillTrendPoint } from '@/types/dialedin-types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const days = parseInt(request.nextUrl.searchParams.get('days') || '30', 10);
  const skill = request.nextUrl.searchParams.get('skill');

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let query = supabaseAdmin
      .from('dialedin_skill_summary')
      .select('*')
      .gte('report_date', startDate.toISOString().split('T')[0])
      .order('report_date', { ascending: true });

    if (skill) {
      query = query.eq('skill', skill);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by skill
    const skillSet = new Set<string>();
    const trends: Record<string, SkillTrendPoint[]> = {};

    for (const row of data || []) {
      const s = row.skill || 'Unknown';
      skillSet.add(s);
      if (!trends[s]) trends[s] = [];
      trends[s].push({
        date: row.report_date,
        agent_count: row.agent_count,
        total_transfers: row.total_transfers,
        avg_tph: row.avg_tph,
        connect_rate: row.connect_rate,
        conversion_rate: row.conversion_rate,
      });
    }

    return NextResponse.json({
      skills: Array.from(skillSet).sort(),
      trends,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch skill trends' },
      { status: 500 },
    );
  }
}

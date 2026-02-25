import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isExcludedTeam } from '@/utils/dialedin-revenue';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const skill = searchParams.get('skill');
  const sort = searchParams.get('sort') || 'tph';
  const limit = parseInt(searchParams.get('limit') || '100', 10);
  const ranking = searchParams.get('ranking'); // 'top' or 'bottom'
  const includeWage = searchParams.get('include_wage') === 'true';

  try {
    let query = supabaseAdmin
      .from('dialedin_agent_performance')
      .select('*');

    if (date) {
      query = query.eq('report_date', date);
    } else {
      // Default: most recent date
      const { data: latest } = await supabaseAdmin
        .from('dialedin_daily_kpis')
        .select('report_date')
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest) {
        query = query.eq('report_date', latest.report_date);
      }
    }

    if (skill) {
      query = query.eq('skill', skill);
    }

    const team = searchParams.get('team');
    if (team) {
      query = query.eq('team', team);
    }

    // Sorting
    const ascending = ranking === 'bottom';
    const sortCol = sort === 'conversion' ? 'conversion_rate'
      : sort === 'dials' ? 'dials'
      : sort === 'hours' ? 'hours_worked'
      : 'tph';

    query = query.order(sortCol, { ascending, nullsFirst: false }).limit(limit);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter out excluded teams
    let agents = (data || []).filter((a: any) => !isExcludedTeam(a.team));

    // Optionally enrich with hourly_wage from employee_directory
    let wages: Record<string, number> = {};
    if (includeWage && agents.length > 0) {
      const { data: employees } = await supabaseAdmin
        .from('employee_directory')
        .select('first_name, last_name, hourly_wage')
        .eq('employee_status', 'Active')
        .not('hourly_wage', 'is', null);

      if (employees) {
        // Build a name → wage lookup
        const wageMap = new Map<string, number>();
        for (const emp of employees) {
          const name = `${emp.first_name} ${emp.last_name}`.trim().toLowerCase();
          if (emp.hourly_wage != null) {
            wageMap.set(name, Number(emp.hourly_wage));
          }
        }

        // Match agent names to employee wages
        for (const agent of agents) {
          const agentNameLower = (agent.agent_name || '').trim().toLowerCase();
          const wage = wageMap.get(agentNameLower);
          if (wage !== undefined) {
            wages[agent.agent_name] = wage;
          }
        }
      }
    }

    return NextResponse.json({ data: agents, wages: includeWage ? wages : undefined });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch agents' },
      { status: 500 },
    );
  }
}

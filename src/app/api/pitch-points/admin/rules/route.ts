import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('pitch_points_earning_rules')
      .select('*')
      .order('category', { ascending: true })
      .order('points_amount', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ success: true, rules: data || [] });
  } catch (error) {
    console.error('Error fetching rules:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rule_key, category, label, description, points_amount, multiplier, threshold_min, threshold_max, streak_count, period_days, max_per_day, max_per_week, created_by } = body;

    if (!rule_key || !category || !label || points_amount === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: rule_key, category, label, points_amount' },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from('pitch_points_earning_rules')
      .insert({
        rule_key,
        category,
        label,
        description: description || null,
        points_amount,
        multiplier: multiplier || 1.0,
        threshold_min: threshold_min ?? null,
        threshold_max: threshold_max ?? null,
        streak_count: streak_count ?? null,
        period_days: period_days ?? null,
        max_per_day: max_per_day ?? null,
        max_per_week: max_per_week ?? null,
        created_by: created_by || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, rule: data });
  } catch (error) {
    console.error('Error creating rule:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing rule id' }, { status: 400 });
    }

    const body = await request.json();
    body.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('pitch_points_earning_rules')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, rule: data });
  } catch (error) {
    console.error('Error updating rule:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

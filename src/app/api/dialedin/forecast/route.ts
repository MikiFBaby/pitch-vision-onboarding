import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { linearRegression, mean } from '@/utils/dialedin-analytics';
import { getRevenuePerTransfer } from '@/utils/dialedin-revenue';
import type { ForecastResult } from '@/types/dialedin-types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const days = parseInt(request.nextUrl.searchParams.get('days') || '30', 10);
  const forecastDays = parseInt(request.nextUrl.searchParams.get('forecast_days') || '30', 10);

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: kpis, error } = await supabaseAdmin
      .from('dialedin_daily_kpis')
      .select('report_date, total_transfers, total_man_hours')
      .gte('report_date', startDate.toISOString().split('T')[0])
      .order('report_date', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!kpis || kpis.length < 3) {
      return NextResponse.json({ data: null, message: 'Not enough data for forecast' });
    }

    // Compute daily revenue (using default blended rate)
    const defaultRate = getRevenuePerTransfer(null);
    const historical = kpis.map((d) => ({
      date: d.report_date,
      revenue: Math.round(d.total_transfers * defaultRate * 100) / 100,
    }));

    // Build regression points
    const baseDate = new Date(kpis[0].report_date + 'T12:00:00Z');
    const points = kpis.map((d) => {
      const dayNum = Math.round((new Date(d.report_date + 'T12:00:00Z').getTime() - baseDate.getTime()) / (86400000));
      return { x: dayNum, y: d.total_transfers * defaultRate };
    });

    const { slope, intercept, r2 } = linearRegression(points);

    // Project forward
    const lastDay = points[points.length - 1].x;
    const forecast: Array<{ date: string; predicted_revenue: number }> = [];
    for (let i = 1; i <= forecastDays; i++) {
      const dayNum = lastDay + i;
      const predicted = slope * dayNum + intercept;
      const futureDate = new Date(baseDate);
      futureDate.setUTCDate(futureDate.getUTCDate() + dayNum);
      forecast.push({
        date: futureDate.toISOString().split('T')[0],
        predicted_revenue: Math.max(0, Math.round(predicted * 100) / 100),
      });
    }

    const dailyAvg = mean(historical.map((h) => h.revenue));
    const trend: 'growing' | 'declining' | 'flat' =
      slope > dailyAvg * 0.01 ? 'growing' :
      slope < -dailyAvg * 0.01 ? 'declining' : 'flat';

    const result: ForecastResult = {
      historical,
      forecast,
      model: {
        slope: Math.round(slope * 100) / 100,
        r_squared: Math.round(r2 * 1000) / 1000,
        trend,
        daily_avg: Math.round(dailyAvg * 100) / 100,
        projected_monthly: Math.round(dailyAvg * 22 * 100) / 100, // ~22 business days
      },
    };

    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to compute forecast' },
      { status: 500 },
    );
  }
}

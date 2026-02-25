/**
 * Shared analytics computation functions for DialedIn dashboard.
 * Used by multiple API routes for WoW, consistency, forecast, etc.
 */

import type { DailyKPIs, WeekAggregates, WoWComparison } from '@/types/dialedin-types';

// ═══════════════════════════════════════════════════════════
// Statistical helpers
// ═══════════════════════════════════════════════════════════

export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function std(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

export function safeDiv(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

// ═══════════════════════════════════════════════════════════
// Week-over-Week Comparison
// ═══════════════════════════════════════════════════════════

export function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // Mon=0, Sun=6
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().split('T')[0];
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function aggregateWeek(days: DailyKPIs[], start: string, end: string): WeekAggregates {
  const filtered = days.filter((d) => d.report_date >= start && d.report_date < end);
  const totalTransfers = filtered.reduce((s, d) => s + d.total_transfers, 0);
  const totalHours = filtered.reduce((s, d) => s + d.total_man_hours, 0);
  const totalDials = filtered.reduce((s, d) => s + d.total_dials, 0);
  const totalConnects = filtered.reduce((s, d) => s + d.total_connects, 0);

  return {
    start,
    end: addDays(end, -1),
    transfers: totalTransfers,
    hours: totalHours,
    tph: safeDiv(totalTransfers, totalHours),
    connect_rate: filtered.length > 0 ? mean(filtered.map((d) => d.connect_rate)) : 0,
    conversion_rate: filtered.length > 0 ? mean(filtered.map((d) => d.conversion_rate)) : 0,
    agents_avg: filtered.length > 0 ? mean(filtered.map((d) => d.total_agents)) : 0,
    dials: totalDials,
    connects: totalConnects,
    days_count: filtered.length,
  };
}

function computeDelta(current: number, prev: number): { abs: number; pct: number } {
  return {
    abs: current - prev,
    pct: prev === 0 ? 0 : ((current - prev) / prev) * 100,
  };
}

export function computeWoW(kpis: DailyKPIs[]): WoWComparison | null {
  if (kpis.length === 0) return null;

  const sorted = [...kpis].sort((a, b) => b.report_date.localeCompare(a.report_date));
  const latestDate = sorted[0].report_date;
  const currentWeekStart = getMondayOfWeek(latestDate);
  const currentWeekEnd = addDays(currentWeekStart, 7);
  const prevWeekStart = addDays(currentWeekStart, -7);

  const currentWeek = aggregateWeek(kpis, currentWeekStart, currentWeekEnd);
  const prevWeek = aggregateWeek(kpis, prevWeekStart, currentWeekStart);

  if (prevWeek.days_count === 0) return null;

  return {
    current_week: currentWeek,
    prev_week: prevWeek,
    deltas: {
      transfers: computeDelta(currentWeek.transfers, prevWeek.transfers),
      tph: computeDelta(currentWeek.tph, prevWeek.tph),
      connect_rate: computeDelta(currentWeek.connect_rate, prevWeek.connect_rate),
      conversion_rate: computeDelta(currentWeek.conversion_rate, prevWeek.conversion_rate),
      dials: computeDelta(currentWeek.dials, prevWeek.dials),
      connects: computeDelta(currentWeek.connects, prevWeek.connects),
      hours: computeDelta(currentWeek.hours, prevWeek.hours),
    },
  };
}

// ═══════════════════════════════════════════════════════════
// Consistency Score
// ═══════════════════════════════════════════════════════════

export function computeConsistencyScore(tphValues: number[]): number {
  if (tphValues.length < 3) return 0;
  const m = mean(tphValues);
  if (m === 0) return 0;
  const s = std(tphValues);
  const cv = s / m; // coefficient of variation
  return Math.max(0, Math.min(100, Math.round(100 - cv * 100)));
}

// ═══════════════════════════════════════════════════════════
// Decline Streak Detection
// ═══════════════════════════════════════════════════════════

export function computeDeclineStreak(tphValues: number[]): number {
  let maxStreak = 0;
  let streak = 0;

  for (let i = 1; i < tphValues.length; i++) {
    if (tphValues[i] < tphValues[i - 1]) {
      streak++;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      streak = 0;
    }
  }

  return maxStreak;
}

// ═══════════════════════════════════════════════════════════
// Linear Regression
// ═══════════════════════════════════════════════════════════

export function linearRegression(
  points: { x: number; y: number }[],
): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const yMean = sumY / n;
  const ssRes = points.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const ssTot = points.reduce((s, p) => s + (p.y - yMean) ** 2, 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

// ═══════════════════════════════════════════════════════════
// Sparkline Builder
// ═══════════════════════════════════════════════════════════

export function buildSparkline(
  history: { report_date: string; tph: number }[],
  startDate: string,
  endDate: string,
): number[] {
  const dateMap = new Map<string, number>();
  for (const h of history) {
    dateMap.set(h.report_date, h.tph);
  }

  const result: number[] = [];
  const current = new Date(startDate + 'T12:00:00Z');
  const end = new Date(endDate + 'T12:00:00Z');

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    result.push(dateMap.get(dateStr) ?? 0);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════
// Date Helpers
// ═══════════════════════════════════════════════════════════

export function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split('T')[0];
}

export function diffInDays(dateA: string, dateB: string): number {
  const a = new Date(dateA + 'T12:00:00Z');
  const b = new Date(dateB + 'T12:00:00Z');
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export function getYearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

export function getMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════════════════
// Time Series Bucketing (for Revenue Workspace)
// ═══════════════════════════════════════════════════════════

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Get ISO week number for a date */
function getISOWeekNumber(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getUTCFullYear(), 0, 1).getTime()) / 86400000) + 1;
  return Math.ceil((dayOfYear + new Date(d.getUTCFullYear(), 0, 1).getUTCDay()) / 7);
}

/** "Feb 19" style label for a date */
export function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "W8 (Feb 17–23)" style label for a Monday date */
export function getWeekLabel(mondayStr: string): string {
  const wk = getISOWeekNumber(mondayStr);
  const start = new Date(mondayStr + 'T12:00:00Z');
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return `W${wk} (${MONTH_ABBR[start.getUTCMonth()]} ${start.getUTCDate()}–${end.getUTCDate()})`;
}

/** "Feb 2026" style label for "2026-02" */
export function getMonthLabel(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  return `${MONTH_ABBR[parseInt(month, 10) - 1]} ${year}`;
}

/** Group date-keyed rows by week (Monday start) */
export function bucketByWeek<T extends { date: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const monday = getMondayOfWeek(row.date);
    const bucket = map.get(monday) || [];
    bucket.push(row);
    map.set(monday, bucket);
  }
  return map;
}

/** Group date-keyed rows by month (YYYY-MM) */
export function bucketByMonth<T extends { date: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    const bucket = map.get(month) || [];
    bucket.push(row);
    map.set(month, bucket);
  }
  return map;
}

/** Compute start date from period shorthand */
export function getStartDateFromPeriod(period: string): string {
  if (period === 'ytd') return getYearStart();
  if (period === 'mtd') return getMonthStart();
  const match = period.match(/^(\d+)d$/);
  if (match) return subtractDays(todayStr(), parseInt(match[1], 10));
  return getYearStart();
}

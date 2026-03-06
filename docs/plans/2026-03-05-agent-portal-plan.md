# Agent Portal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the existing `/agent` page with a 4-tab layout (Dashboard, Performance, Earnings, Coaching) featuring real-time metrics, gamification tiers/streaks/leaderboard, earnings tracking with "carrot" goals, and AI-generated coaching.

**Architecture:** Incremental enhancement of `src/app/(protected)/agent/page.tsx`. Extract current dashboard content into `AgentDashboardTab`, add 3 new tab components. Shared state (agent name, intraday data, stats) lives in the parent page and passes down via props. Two new API routes (`/api/agent/earnings`, `/api/agent/coaching`) plus a utility module for tier/streak computation.

**Tech Stack:** Next.js 14 App Router, React 18, Supabase (DB + Realtime), Framer Motion, Recharts, Lucide icons, Tailwind CSS (glass-morphism design system). Existing hooks: `useIntradayData`, `useAgentDialedinStats`. New dependency: `canvas-confetti`.

---

## Task 1: Tier Utility Module

**Files:**
- Create: `src/utils/agent-tiers.ts`

**Context:** This module defines the 5-tier system, streak computation, and daily transfer targets. It has zero dependencies on React or API calls — pure computation from arrays of numbers. Every other task depends on this.

**Step 1: Create the tier utility module**

```typescript
// src/utils/agent-tiers.ts

export interface TierDefinition {
  tier: number;
  name: string;
  minSlaHr: number;
  badge: string;
  color: string;       // Tailwind color class stem (e.g. "amber" → used as text-amber-400)
}

export const TIERS: TierDefinition[] = [
  { tier: 1, name: "Rookie",    minSlaHr: 0,   badge: "Bronze",   color: "amber"   },
  { tier: 2, name: "Performer", minSlaHr: 2.0,  badge: "Silver",   color: "slate"   },
  { tier: 3, name: "Pro",       minSlaHr: 3.0,  badge: "Gold",     color: "yellow"  },
  { tier: 4, name: "Star",      minSlaHr: 4.0,  badge: "Platinum", color: "cyan"    },
  { tier: 5, name: "Elite",     minSlaHr: 5.0,  badge: "Diamond",  color: "violet"  },
];

/** Get tier for a given 7-day avg SLA/hr */
export function getTier(avgSlaHr: number): TierDefinition {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (avgSlaHr >= TIERS[i].minSlaHr) return TIERS[i];
  }
  return TIERS[0];
}

/** Get next tier (or null if already Elite) */
export function getNextTier(currentTier: TierDefinition): TierDefinition | null {
  const idx = TIERS.findIndex((t) => t.tier === currentTier.tier);
  return idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
}

/** Progress to next tier as 0-1 fraction */
export function getTierProgress(avgSlaHr: number, currentTier: TierDefinition): number {
  const next = getNextTier(currentTier);
  if (!next) return 1; // Already Elite
  const range = next.minSlaHr - currentTier.minSlaHr;
  if (range <= 0) return 1;
  return Math.min(Math.max((avgSlaHr - currentTier.minSlaHr) / range, 0), 1);
}

/**
 * Compute hot streak: consecutive most-recent days where SLA/hr >= breakEven.
 * @param dailySlaHr - Array of SLA/hr values, most recent LAST (chronological order)
 * @param breakEven - Break-even threshold (ACA: 2.5, Medicare: 3.5)
 */
export function computeHotStreak(dailySlaHr: number[], breakEven: number): number {
  let streak = 0;
  for (let i = dailySlaHr.length - 1; i >= 0; i--) {
    if (dailySlaHr[i] >= breakEven) streak++;
    else break;
  }
  return streak;
}

/**
 * Compute QA streak: consecutive most-recent calls with score >= 80.
 * @param scores - Array of compliance scores, most recent LAST
 */
export function computeQaStreak(scores: number[]): number {
  let streak = 0;
  for (let i = scores.length - 1; i >= 0; i--) {
    if (scores[i] >= 80) streak++;
    else break;
  }
  return streak;
}

/** Daily transfer target based on tier. Higher tiers get harder targets. */
export function getDailyTransferTarget(tier: TierDefinition, hoursExpected: number): number {
  const targetSlaHr = tier.tier <= 2 ? 2.5 : tier.tier <= 4 ? 3.5 : 5.0;
  return Math.ceil(targetSlaHr * hoursExpected);
}

/** Weekly earnings milestones (USD). Agent sees the next milestone above their current weekly earnings. */
export const WEEKLY_MILESTONES = [500, 750, 1000, 1250, 1500];

export function getNextMilestone(currentWeeklyEarnings: number): number | null {
  return WEEKLY_MILESTONES.find((m) => m > currentWeeklyEarnings) ?? null;
}
```

**Step 2: Commit**

```bash
git add src/utils/agent-tiers.ts
git commit -m "feat(agent): add tier/streak utility module"
```

---

## Task 2: Earnings API Route

**Files:**
- Create: `src/app/api/agent/earnings/route.ts`

**Context:** This route returns the agent's hourly wage (from `employee_directory`), pay period boundaries, and accumulated hours/earnings for the current pay period. The frontend will combine this with live intraday hours for a real-time earnings counter.

**Step 1: Create the earnings route**

```typescript
// src/app/api/agent/earnings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCadToUsdRate, convertWageToUsd } from "@/utils/fx";
import { getCached, setCache } from "@/utils/dialedin-cache";

export const runtime = "nodejs";

/**
 * GET /api/agent/earnings?agent=Blair+Brown
 *
 * Returns:
 * - hourly_wage_usd: number
 * - pay_period: { start: string, end: string }
 * - period_hours: number (total hours in period so far, excluding today)
 * - period_earnings_usd: number
 * - period_days_worked: number
 */

function getCurrentPayPeriod(): { start: string; end: string } {
  // Pitch Perfect uses bi-weekly pay periods starting on Sundays.
  // Reference anchor: Sunday Jan 5 2025 (a known period start).
  const anchor = new Date("2025-01-05T00:00:00Z");
  const now = new Date();
  const diffMs = now.getTime() - anchor.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const periodIndex = Math.floor(diffDays / 14);
  const periodStart = new Date(anchor.getTime() + periodIndex * 14 * 86400000);
  const periodEnd = new Date(periodStart.getTime() + 13 * 86400000);
  return {
    start: periodStart.toISOString().slice(0, 10),
    end: periodEnd.toISOString().slice(0, 10),
  };
}

export async function GET(req: NextRequest) {
  const agentName = req.nextUrl.searchParams.get("agent");
  if (!agentName) {
    return NextResponse.json({ error: "agent param required" }, { status: 400 });
  }

  const cacheKey = `agent-earnings:${agentName}`;
  const cached = getCached<Record<string, unknown>>(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    // 1. Look up employee wage + country
    const { data: emp } = await supabaseAdmin
      .from("employee_directory")
      .select("hourly_wage, country, dialedin_name, first_name, last_name")
      .or(
        `dialedin_name.ilike.${agentName},and(first_name.ilike.${agentName.split(" ")[0]},last_name.ilike.${agentName.split(" ").slice(1).join(" ") || "_"})`,
      )
      .limit(1)
      .maybeSingle();

    const rawWage = emp?.hourly_wage ?? 0;
    const country = emp?.country ?? null;
    const cadRate = await getCadToUsdRate();
    const wageUsd = convertWageToUsd(rawWage, country, cadRate);

    // 2. Get pay period boundaries
    const payPeriod = getCurrentPayPeriod();

    // 3. Sum hours from dialedin_agent_performance for this period (excluding today)
    const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const { data: perfRows } = await supabaseAdmin
      .from("dialedin_agent_performance")
      .select("hours_worked, report_date")
      .eq("agent_name", agentName)
      .gte("report_date", payPeriod.start)
      .lt("report_date", todayET);

    let periodHours = 0;
    let periodDaysWorked = 0;
    const daysSet = new Set<string>();
    for (const row of perfRows || []) {
      periodHours += Number(row.hours_worked) || 0;
      daysSet.add(row.report_date);
    }
    periodDaysWorked = daysSet.size;

    const result = {
      hourly_wage_usd: Math.round(wageUsd * 100) / 100,
      country,
      pay_period: payPeriod,
      period_hours: Math.round(periodHours * 100) / 100,
      period_earnings_usd: Math.round(periodHours * wageUsd * 100) / 100,
      period_days_worked: periodDaysWorked,
    };

    setCache(cacheKey, result, 5 * 60_000); // 5 min cache
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch earnings" },
      { status: 500 },
    );
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/agent/earnings/route.ts
git commit -m "feat(agent): add earnings API route"
```

---

## Task 3: Coaching API Route

**Files:**
- Create: `src/app/api/agent/coaching/route.ts`

**Context:** Calls OpenAI-compatible API (via OpenRouter, same pattern as QA pipeline) to generate 3 coaching cards based on the agent's recent performance. Cached 24hr per agent.

**Step 1: Create the coaching route**

```typescript
// src/app/api/agent/coaching/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCached, setCache } from "@/utils/dialedin-cache";

export const runtime = "nodejs";

const CACHE_TTL = 24 * 60 * 60_000; // 24 hours

interface CoachingCard {
  type: "strength" | "growth" | "challenge";
  title: string;
  body: string;
  metric?: string;
}

/**
 * GET /api/agent/coaching?agent=Blair+Brown
 *
 * Returns 3 AI-generated coaching cards cached for 24hr.
 */
export async function GET(req: NextRequest) {
  const agentName = req.nextUrl.searchParams.get("agent");
  if (!agentName) {
    return NextResponse.json({ error: "agent param required" }, { status: 400 });
  }

  const cacheKey = `agent-coaching:${agentName}`;
  const cached = getCached<CoachingCard[]>(cacheKey);
  if (cached) return NextResponse.json({ cards: cached });

  try {
    // Gather context: last 7 days perf + recent QA
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startDate = sevenDaysAgo.toISOString().slice(0, 10);

    const [perfResult, qaResult] = await Promise.all([
      supabaseAdmin
        .from("dialedin_agent_performance")
        .select("report_date, tph, sla_hr, transfers, hours_worked, conversion_rate, dials, connects")
        .eq("agent_name", agentName)
        .gte("report_date", startDate)
        .order("report_date", { ascending: true }),
      supabaseAdmin
        .from("qa_results")
        .select("compliance_score, auto_fail_triggered, call_date")
        .eq("agent_name", agentName)
        .gte("call_date", startDate)
        .order("call_date", { ascending: false })
        .limit(10),
    ]);

    const perf = perfResult.data || [];
    const qa = qaResult.data || [];

    // Build AI prompt
    const perfSummary = perf.map((d) =>
      `${d.report_date}: SLA/hr=${d.sla_hr}, TPH=${d.tph}, transfers=${d.transfers}, hours=${d.hours_worked}, conv%=${d.conversion_rate}, dials=${d.dials}`
    ).join("\n");

    const qaSummary = qa.map((c) =>
      `${c.call_date}: score=${c.compliance_score}%, auto_fail=${c.auto_fail_triggered}`
    ).join("\n");

    const avgSlaHr = perf.length > 0
      ? perf.reduce((s, d) => s + Number(d.sla_hr), 0) / perf.length
      : 0;
    const avgQa = qa.length > 0
      ? qa.reduce((s, c) => s + (Number(c.compliance_score) || 0), 0) / qa.length
      : 0;

    const systemPrompt = `You are a call center performance coach. Generate exactly 3 coaching cards for an agent based on their data. Be specific, actionable, and encouraging. Reference actual numbers from their data.

Return ONLY valid JSON array with exactly 3 objects:
[
  {"type": "strength", "title": "brief title", "body": "2-3 sentences about what they're doing well", "metric": "the specific metric"},
  {"type": "growth", "title": "brief title", "body": "2-3 sentences with specific improvement tip", "metric": "the specific metric"},
  {"type": "challenge", "title": "brief title", "body": "1-2 sentences with a concrete goal for today", "metric": "target number"}
]`;

    const userPrompt = `Agent: ${agentName}
7-day avg SLA/hr: ${avgSlaHr.toFixed(2)}
7-day avg QA score: ${avgQa.toFixed(0)}%

Performance (last 7 days):
${perfSummary || "No performance data available"}

QA Results (recent):
${qaSummary || "No QA data available"}`;

    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Fallback: generate static cards from data
      const cards = generateFallbackCards(agentName, avgSlaHr, avgQa, perf);
      setCache(cacheKey, cards, CACHE_TTL);
      return NextResponse.json({ cards });
    }

    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat-v3-0324",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!aiResponse.ok) {
      const cards = generateFallbackCards(agentName, avgSlaHr, avgQa, perf);
      setCache(cacheKey, cards, CACHE_TTL);
      return NextResponse.json({ cards });
    }

    const aiJson = await aiResponse.json();
    const content = aiJson.choices?.[0]?.message?.content || "[]";

    // Parse AI response — extract JSON array
    let cards: CoachingCard[];
    try {
      const match = content.match(/\[[\s\S]*\]/);
      cards = match ? JSON.parse(match[0]) : generateFallbackCards(agentName, avgSlaHr, avgQa, perf);
    } catch {
      cards = generateFallbackCards(agentName, avgSlaHr, avgQa, perf);
    }

    setCache(cacheKey, cards, CACHE_TTL);
    return NextResponse.json({ cards });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate coaching" },
      { status: 500 },
    );
  }
}

function generateFallbackCards(
  agentName: string,
  avgSlaHr: number,
  avgQa: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  perf: any[],
): CoachingCard[] {
  const firstName = agentName.split(" ")[0];
  const bestDay = perf.length > 0
    ? perf.reduce((best, d) => (d.sla_hr > best.sla_hr ? d : best), perf[0])
    : null;

  return [
    {
      type: "strength",
      title: avgSlaHr >= 3 ? "Strong Transfer Rate" : "Consistent Effort",
      body: bestDay
        ? `${firstName}, your best day this week was ${bestDay.report_date} with ${bestDay.sla_hr} SLA/hr and ${bestDay.transfers} transfers. That's the pace to aim for!`
        : `${firstName}, keep showing up and putting in the hours. Consistency is the foundation of success.`,
      metric: `${avgSlaHr.toFixed(2)} avg SLA/hr`,
    },
    {
      type: "growth",
      title: avgQa < 80 ? "QA Score Focus" : "Push for Next Tier",
      body: avgQa < 80
        ? `Your QA average is ${avgQa.toFixed(0)}%. Focus on the compliance checklist — greeting, disclosure, and verbal consent are the easiest points to secure.`
        : `With ${avgSlaHr.toFixed(2)} SLA/hr, you're ${avgSlaHr < 3 ? `${(3 - avgSlaHr).toFixed(2)} away from Pro tier` : "on track"}. Try to minimize wrap time between calls.`,
      metric: avgQa < 80 ? `${avgQa.toFixed(0)}% QA avg` : `${avgSlaHr.toFixed(2)} SLA/hr`,
    },
    {
      type: "challenge",
      title: "Today's Goal",
      body: `Aim for ${Math.ceil(avgSlaHr + 0.5)} SLA/hr today. That means roughly ${Math.ceil((avgSlaHr + 0.5) * 8)} transfers in a full shift.`,
      metric: `${Math.ceil(avgSlaHr + 0.5)} SLA/hr`,
    },
  ];
}
```

**Step 2: Commit**

```bash
git add src/app/api/agent/coaching/route.ts
git commit -m "feat(agent): add AI coaching API route"
```

---

## Task 4: Earnings Hook

**Files:**
- Create: `src/hooks/useAgentEarnings.ts`

**Step 1: Create the hook**

```typescript
// src/hooks/useAgentEarnings.ts
"use client";

import { useState, useEffect, useCallback } from "react";

interface EarningsData {
  hourly_wage_usd: number;
  country: string | null;
  pay_period: { start: string; end: string };
  period_hours: number;
  period_earnings_usd: number;
  period_days_worked: number;
}

interface UseAgentEarningsReturn {
  data: EarningsData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAgentEarnings(agentName: string | undefined): UseAgentEarningsReturn {
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!agentName) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/agent/earnings?agent=${encodeURIComponent(agentName)}`);
      if (res.ok) {
        setData(await res.json());
        setError(null);
      } else {
        setError(`API returned ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [agentName]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
```

**Step 2: Commit**

```bash
git add src/hooks/useAgentEarnings.ts
git commit -m "feat(agent): add useAgentEarnings hook"
```

---

## Task 5: Coaching Hook

**Files:**
- Create: `src/hooks/useAgentCoaching.ts`

**Step 1: Create the hook**

```typescript
// src/hooks/useAgentCoaching.ts
"use client";

import { useState, useEffect, useCallback } from "react";

interface CoachingCard {
  type: "strength" | "growth" | "challenge";
  title: string;
  body: string;
  metric?: string;
}

interface UseAgentCoachingReturn {
  cards: CoachingCard[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAgentCoaching(agentName: string | undefined): UseAgentCoachingReturn {
  const [cards, setCards] = useState<CoachingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!agentName) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/agent/coaching?agent=${encodeURIComponent(agentName)}`);
      if (res.ok) {
        const json = await res.json();
        setCards(json.cards || []);
        setError(null);
      } else {
        setError(`API returned ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [agentName]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  return { cards, loading, error, refetch: fetchData };
}
```

**Step 2: Commit**

```bash
git add src/hooks/useAgentCoaching.ts
git commit -m "feat(agent): add useAgentCoaching hook"
```

---

## Task 6: Install canvas-confetti

**Step 1: Install the package**

```bash
npm install canvas-confetti
npm install -D @types/canvas-confetti
```

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add canvas-confetti dependency"
```

---

## Task 7: Shared Components — TierBadge and StreakIndicator

**Files:**
- Create: `src/components/agent/TierBadge.tsx`
- Create: `src/components/agent/StreakIndicator.tsx`

**Context:** Small, reusable display components used in Performance tab and Dashboard tab. TierBadge shows the tier name + badge color. StreakIndicator shows a flame icon + day count.

**Step 1: Create TierBadge**

```typescript
// src/components/agent/TierBadge.tsx
"use client";

import { motion } from "framer-motion";
import type { TierDefinition } from "@/utils/agent-tiers";

const TIER_GRADIENTS: Record<string, string> = {
  amber:  "from-amber-600 to-amber-400",
  slate:  "from-slate-400 to-slate-300",
  yellow: "from-yellow-500 to-yellow-300",
  cyan:   "from-cyan-400 to-cyan-200",
  violet: "from-violet-500 to-purple-300",
};

interface TierBadgeProps {
  tier: TierDefinition;
  size?: "sm" | "md" | "lg";
}

export default function TierBadge({ tier, size = "md" }: TierBadgeProps) {
  const sizeClasses = {
    sm: "text-[10px] px-2 py-0.5",
    md: "text-xs px-3 py-1",
    lg: "text-sm px-4 py-1.5",
  };

  return (
    <motion.span
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`inline-flex items-center gap-1.5 font-bold rounded-full bg-gradient-to-r ${TIER_GRADIENTS[tier.color] || TIER_GRADIENTS.amber} text-black/80 ${sizeClasses[size]}`}
    >
      <span className="opacity-70">{tier.badge}</span>
      <span>{tier.name}</span>
    </motion.span>
  );
}
```

**Step 2: Create StreakIndicator**

```typescript
// src/components/agent/StreakIndicator.tsx
"use client";

import { Flame, Shield, Award } from "lucide-react";
import { motion } from "framer-motion";

type StreakType = "hot" | "attendance" | "qa";

interface StreakIndicatorProps {
  type: StreakType;
  days: number;
  label?: string;
}

const STREAK_CONFIG: Record<StreakType, { icon: typeof Flame; color: string; label: string }> = {
  hot:        { icon: Flame,  color: "text-orange-400", label: "Hot Streak" },
  attendance: { icon: Shield, color: "text-emerald-400", label: "Perfect Attendance" },
  qa:         { icon: Award,  color: "text-blue-400", label: "QA Champion" },
};

export default function StreakIndicator({ type, days, label }: StreakIndicatorProps) {
  if (days <= 0) return null;
  const config = STREAK_CONFIG[type];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className="flex items-center gap-1.5"
    >
      <Icon size={14} className={`${config.color} ${days >= 5 ? "animate-pulse" : ""}`} />
      <span className={`text-xs font-bold ${config.color}`}>{days}d</span>
      <span className="text-[10px] text-white/40">{label || config.label}</span>
    </motion.div>
  );
}
```

**Step 3: Commit**

```bash
git add src/components/agent/TierBadge.tsx src/components/agent/StreakIndicator.tsx
git commit -m "feat(agent): add TierBadge and StreakIndicator components"
```

---

## Task 8: LeaderboardTable Component

**Files:**
- Create: `src/components/agent/LeaderboardTable.tsx`

**Context:** Shows top 10 agents in the same campaign, ranked by today's SLA/hr. Highlights the current agent's row. Data comes from `useIntradayData` with `includeRank=true`.

**Step 1: Create LeaderboardTable**

```typescript
// src/components/agent/LeaderboardTable.tsx
"use client";

import { motion } from "framer-motion";
import type { IntradayAgentRow } from "@/types/dialedin-types";

interface LeaderboardTableProps {
  agents: IntradayAgentRow[];
  currentAgentName: string;
  maxRows?: number;
}

export default function LeaderboardTable({ agents, currentAgentName, maxRows = 10 }: LeaderboardTableProps) {
  // Sort by SLA/hr descending, take top N
  const sorted = [...agents]
    .sort((a, b) => b.sla_hr - a.sla_hr)
    .slice(0, maxRows);

  const currentIdx = sorted.findIndex(
    (a) => a.name.toLowerCase() === currentAgentName.toLowerCase(),
  );

  // If current agent not in top N, find their global rank and append
  let currentAgent: IntradayAgentRow | null = null;
  let currentGlobalRank: number | null = null;
  if (currentIdx === -1) {
    const allSorted = [...agents].sort((a, b) => b.sla_hr - a.sla_hr);
    const globalIdx = allSorted.findIndex(
      (a) => a.name.toLowerCase() === currentAgentName.toLowerCase(),
    );
    if (globalIdx !== -1) {
      currentAgent = allSorted[globalIdx];
      currentGlobalRank = globalIdx + 1;
    }
  }

  return (
    <div className="space-y-1">
      {sorted.map((agent, i) => {
        const isMe = agent.name.toLowerCase() === currentAgentName.toLowerCase();
        return (
          <motion.div
            key={agent.name}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
              isMe ? "bg-indigo-500/15 border border-indigo-500/30" : "bg-white/5"
            }`}
          >
            <span className={`text-xs font-bold w-6 text-center ${
              i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-600" : "text-white/40"
            }`}>
              #{i + 1}
            </span>
            <span className={`text-xs flex-1 truncate ${isMe ? "text-white font-bold" : "text-white/70"}`}>
              {isMe ? `${agent.name} (You)` : agent.name}
            </span>
            <span className="text-xs font-mono font-bold text-white/80">
              {agent.sla_hr.toFixed(2)}
            </span>
            <span className="text-[10px] text-white/40 w-12 text-right">
              {agent.transfers} SLA
            </span>
          </motion.div>
        );
      })}

      {/* Show current agent at bottom if not in top N */}
      {currentAgent && currentGlobalRank && (
        <>
          <div className="text-center text-white/20 text-[10px] py-1">···</div>
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-indigo-500/15 border border-indigo-500/30">
            <span className="text-xs font-bold w-6 text-center text-white/40">
              #{currentGlobalRank}
            </span>
            <span className="text-xs flex-1 truncate text-white font-bold">
              {currentAgent.name} (You)
            </span>
            <span className="text-xs font-mono font-bold text-white/80">
              {currentAgent.sla_hr.toFixed(2)}
            </span>
            <span className="text-[10px] text-white/40 w-12 text-right">
              {currentAgent.transfers} SLA
            </span>
          </div>
        </>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/agent/LeaderboardTable.tsx
git commit -m "feat(agent): add LeaderboardTable component"
```

---

## Task 9: CarrotGoalCard Component

**Files:**
- Create: `src/components/agent/CarrotGoalCard.tsx`

**Step 1: Create CarrotGoalCard**

```typescript
// src/components/agent/CarrotGoalCard.tsx
"use client";

import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";

interface CarrotGoalCardProps {
  title: string;
  current: number;
  target: number;
  unit: string;          // "$", "SLA", "days", etc.
  rewardMessage: string;
  completed?: boolean;
}

export default function CarrotGoalCard({
  title,
  current,
  target,
  unit,
  rewardMessage,
  completed = false,
}: CarrotGoalCardProps) {
  const progress = target > 0 ? Math.min(current / target, 1) : 0;
  const remaining = Math.max(target - current, 0);
  const pct = Math.round(progress * 100);

  // SVG circular progress ring
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card rounded-xl border-white/5 p-4 ${
        completed ? "border-emerald-500/30 bg-emerald-500/5" : ""
      }`}
    >
      <div className="flex items-center gap-4">
        {/* Circular progress */}
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
            <motion.circle
              cx="40" cy="40" r={radius} fill="none"
              stroke={completed ? "#10b981" : "#6366f1"}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {completed ? (
              <CheckCircle size={20} className="text-emerald-400" />
            ) : (
              <span className="text-sm font-bold text-white">{pct}%</span>
            )}
          </div>
        </div>

        {/* Text content */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-white/40 uppercase tracking-widest mb-1">{title}</div>
          {completed ? (
            <div className="text-sm font-bold text-emerald-400">{rewardMessage}</div>
          ) : (
            <>
              <div className="text-sm font-bold text-white">
                {remaining.toLocaleString(undefined, { maximumFractionDigits: 1 })} {unit} to go
              </div>
              <div className="text-[10px] text-white/40 mt-0.5">
                {current.toLocaleString(undefined, { maximumFractionDigits: 1 })} / {target.toLocaleString(undefined, { maximumFractionDigits: 1 })} {unit}
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/agent/CarrotGoalCard.tsx
git commit -m "feat(agent): add CarrotGoalCard component"
```

---

## Task 10: EventFeed Component

**Files:**
- Create: `src/components/agent/EventFeed.tsx`

**Step 1: Create EventFeed**

```typescript
// src/components/agent/EventFeed.tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { TrendingUp, ShieldCheck, Award, Clock, Phone } from "lucide-react";

export interface FeedEvent {
  id: string;
  type: "transfer" | "qa" | "tier" | "streak" | "shift";
  title: string;
  subtitle?: string;
  timestamp: string;  // ISO string or display string
  icon?: "transfer" | "qa" | "tier" | "streak" | "shift";
}

const ICON_MAP = {
  transfer: Phone,
  qa: ShieldCheck,
  tier: Award,
  streak: TrendingUp,
  shift: Clock,
};

const COLOR_MAP: Record<string, string> = {
  transfer: "text-emerald-400",
  qa: "text-blue-400",
  tier: "text-yellow-400",
  streak: "text-orange-400",
  shift: "text-white/40",
};

interface EventFeedProps {
  events: FeedEvent[];
  maxItems?: number;
}

export default function EventFeed({ events, maxItems = 20 }: EventFeedProps) {
  const visible = events.slice(0, maxItems);

  return (
    <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1 scrollbar-thin">
      <AnimatePresence mode="popLayout">
        {visible.map((event) => {
          const Icon = ICON_MAP[event.type] || Phone;
          const color = COLOR_MAP[event.type] || "text-white/40";

          return (
            <motion.div
              key={event.id}
              layout
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
            >
              <Icon size={14} className={color} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white/80 truncate">{event.title}</div>
                {event.subtitle && (
                  <div className="text-[10px] text-white/30 truncate">{event.subtitle}</div>
                )}
              </div>
              <span className="text-[10px] text-white/20 font-mono shrink-0">{event.timestamp}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {events.length === 0 && (
        <div className="text-center py-6 text-white/20 text-xs">No events yet today</div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/agent/EventFeed.tsx
git commit -m "feat(agent): add EventFeed component"
```

---

## Task 11: Dashboard Tab Component

**Files:**
- Create: `src/components/agent/AgentDashboardTab.tsx`

**Context:** This extracts and enhances the existing agent page content into the Dashboard tab. It receives all shared state as props from the parent page. Shows 4 metric cards, the live status banner, intraday hourly chart, the event feed, recent analyzed calls, and the voice training agent.

**Step 1: Create AgentDashboardTab**

This is the largest component. It reuses the existing agent page content but adds:
- Yesterday same-time delta on each metric card
- 7-day sparkline on metric cards (from `recentDays`)
- Event feed below the metrics

The component receives these props from the parent:

```typescript
interface AgentDashboardTabProps {
  agentName: string;
  userName: string;
  intradayAgent: IntradayAgentRow | null;
  intradayData: IntradayData | null;
  intradayLoading: boolean;
  liveStatus: LiveAgentStatus | null;
  hasLiveData: boolean;
  recentDays: AgentPerformance[];
  averages: AgentAverages | null;
  latest: AgentPerformance | null;
  qaStats: { avg_score: number; total_calls: number; auto_fail_count: number; pass_rate: number } | null;
  recentCalls: RecentCall[];
  callsLoading: boolean;
  statsLoading: boolean;
  qaLoading: boolean;
  agentBreakEven: number;
  pitchPoints: number | null;
}
```

Move all the existing rendering from `agent/page.tsx` into this component. Add the event feed section after the intraday performance card. Build events from:
- `intradayData.agent_hourly_trend` → transfer delta events
- `recentCalls` → QA result events
- Tier changes → computed from recentDays

The exact implementation will mirror the existing page content, wrapped with the event feed addition. Keep the existing StatsCard, InteractiveChart, and VoiceTrainingAgent usage.

**Step 2: Commit**

```bash
git add src/components/agent/AgentDashboardTab.tsx
git commit -m "feat(agent): add AgentDashboardTab component"
```

---

## Task 12: Performance Tab Component

**Files:**
- Create: `src/components/agent/AgentPerformanceTab.tsx`

**Context:** Shows tier badge + progress bar, 3 streak indicators, campaign leaderboard, and 7-day trend chart.

**Step 1: Create AgentPerformanceTab**

Props:

```typescript
interface AgentPerformanceTabProps {
  agentName: string;
  recentDays: AgentPerformance[];   // 7 most recent days
  intradayAgents: IntradayAgentRow[]; // All agents for leaderboard
  agentBreakEven: number;
  qaScores: number[];               // Recent QA scores for streak
}
```

Key sections:
1. **Tier card** — calls `getTier(avg7d)`, shows TierBadge + progress bar via `getTierProgress()`
2. **Streaks row** — 3 StreakIndicator components
3. **Leaderboard** — LeaderboardTable component (campaign-filtered agents)
4. **Trend chart** — Recharts AreaChart with break-even reference line

Use Recharts `AreaChart`, `Area`, `ReferenceLine`, `XAxis`, `YAxis`, `Tooltip` for the trend chart. The project already has `recharts` installed.

**Step 2: Commit**

```bash
git add src/components/agent/AgentPerformanceTab.tsx
git commit -m "feat(agent): add AgentPerformanceTab component"
```

---

## Task 13: Earnings Tab Component

**Files:**
- Create: `src/components/agent/AgentEarningsTab.tsx`

**Context:** Shows live earnings counter, pay period progress, and 3 carrot goal cards.

**Step 1: Create AgentEarningsTab**

Props:

```typescript
interface AgentEarningsTabProps {
  agentName: string;
  intradayAgent: IntradayAgentRow | null;  // live hours_worked
  earningsData: EarningsData | null;        // from useAgentEarnings
  earningsLoading: boolean;
  recentDays: AgentPerformance[];
  tier: TierDefinition;
  avgSlaHr: number;
}
```

Key sections:
1. **Today's Earnings card** — `earningsData.hourly_wage_usd * intradayAgent.hours_worked` (live)
2. **Pay Period Tracker** — horizontal progress bar: period_earnings + today's earnings / projected total
3. **Three CarrotGoalCards:**
   - Daily Transfer Target: `getDailyTransferTarget(tier, 8)` vs `intradayAgent.transfers`
   - Weekly Earnings: `getNextMilestone(weeklyEarnings)` vs weekly total
   - Tier Promotion: distance to next tier threshold

**Step 2: Commit**

```bash
git add src/components/agent/AgentEarningsTab.tsx
git commit -m "feat(agent): add AgentEarningsTab component"
```

---

## Task 14: Coaching Tab Component

**Files:**
- Create: `src/components/agent/AgentCoachingTab.tsx`

**Context:** Displays 3 AI-generated coaching cards with flip animation. Daily challenge has "Accept" button persisted in localStorage.

**Step 1: Create AgentCoachingTab**

Props:

```typescript
interface AgentCoachingTabProps {
  agentName: string;
  cards: CoachingCard[];
  loading: boolean;
}
```

Each card:
- Strength: emerald accent, star icon
- Growth: amber accent, trending-up icon
- Challenge: indigo accent, target icon + "Accept Challenge" button

Card flip: use Framer Motion `rotateY` on mount. Challenge accepted state stored in `localStorage` key `coaching-challenge-${agentName}-${today}`.

**Step 2: Commit**

```bash
git add src/components/agent/AgentCoachingTab.tsx
git commit -m "feat(agent): add AgentCoachingTab component"
```

---

## Task 15: Refactor Agent Page — Tab Layout

**Files:**
- Modify: `src/app/(protected)/agent/page.tsx`

**Context:** This is the main integration task. The existing 500-line page becomes a shell that manages shared state and renders tabs. All current rendering moves to AgentDashboardTab (Task 11).

**Step 1: Refactor the page**

The refactored page will:
1. Keep all existing hooks (`useAuth`, `useAgentDialedinStats`, `useIntradayData`, admin simulation)
2. Add `useAgentEarnings`, `useAgentCoaching`
3. Add tab state from URL searchParams: `const [activeTab, setActiveTab] = useState("dashboard")`
4. Render a tab strip + the active tab component
5. Pass shared data as props to each tab

Tab strip design: horizontal pills matching the existing glass-morphism style.

```typescript
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "performance", label: "Performance", icon: Trophy },
  { id: "earnings", label: "Earnings", icon: DollarSign },
  { id: "coaching", label: "Coaching", icon: Lightbulb },
] as const;
```

Compute shared values once in the parent:
- `avgSlaHr` (7-day average from recentDays)
- `currentTier` (from avgSlaHr)
- `hotStreak`, `qaStreak` (from recentDays + QA scores)

**Step 2: Verify build**

```bash
npx next build
```

**Step 3: Commit**

```bash
git add src/app/(protected)/agent/page.tsx
git commit -m "feat(agent): refactor page with 4-tab layout"
```

---

## Task 16: End-to-End Verification

**Step 1: Run build**

```bash
npx next build
```

Expected: Clean build with no errors.

**Step 2: Test locally**

```bash
npm run dev
```

Navigate to `http://localhost:3000/agent` (or use admin simulation). Verify:
- Tab strip renders with 4 tabs
- Dashboard tab shows existing content + event feed
- Performance tab shows tier, streaks, leaderboard, trend chart
- Earnings tab shows live earnings, pay period, carrot goals
- Coaching tab shows 3 AI cards (or fallback cards)
- Tab switching is instant (no page reload)
- URL updates with `?tab=performance` etc.

**Step 3: Push**

```bash
git push origin main
```

---

## Dependency Graph

```
Task 1 (tiers.ts) ──┐
                     ├──→ Task 12 (PerformanceTab)
                     ├──→ Task 13 (EarningsTab) ──→ Task 15 (Page refactor)
                     └──→ Task 11 (DashboardTab) ─→ Task 15
Task 2 (earnings API) → Task 4 (earnings hook) ──→ Task 13
Task 3 (coaching API) → Task 5 (coaching hook) ──→ Task 14 (CoachingTab) → Task 15
Task 6 (confetti) ────→ Task 12
Task 7 (Badge/Streak) → Task 11, Task 12
Task 8 (Leaderboard) ─→ Task 12
Task 9 (CarrotGoal) ──→ Task 13
Task 10 (EventFeed) ──→ Task 11
Task 15 (Page) ───────→ Task 16 (E2E verify)
```

**Parallel execution waves:**
- **Wave 1:** Tasks 1, 2, 3, 6 (all independent)
- **Wave 2:** Tasks 4, 5, 7, 8, 9, 10 (depend on Wave 1)
- **Wave 3:** Tasks 11, 12, 13, 14 (depend on Wave 2)
- **Wave 4:** Task 15 (depends on all tab components)
- **Wave 5:** Task 16 (E2E verify)

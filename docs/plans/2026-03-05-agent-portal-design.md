# Agent Portal Design

**Date:** 2026-03-05
**Approach:** Incremental Enhancement (Approach A) — extend existing `/agent` page

## Overview

An interactive, real-time dashboard for call center agents showing performance metrics, earned income tracking, and gamification "carrots" that motivate agents toward measurable goals. Builds on the existing agent page with a horizontal tab strip.

## Architecture

- **Auth:** Individual agent login via Firebase Auth + Supabase profile sync (existing)
- **Role gate:** `role === 'agent'` in `(protected)/layout.tsx` (existing)
- **Data sources:** `useIntradayData`, `useAgentDialedinStats`, existing API routes + new `/api/agent/*` routes
- **Real-time:** Supabase Realtime subscriptions + 5-min polling fallback (existing pattern from `useIntradayData`)
- **Design system:** Glass-morphism cards, Framer Motion animations, Recharts charts (existing)

## Tab Layout

Horizontal tab strip at the top of the agent page:

| Tab | Purpose |
|-----|---------|
| **Dashboard** | Live shift overview — the "home" tab |
| **Performance** | Tier progress, streaks, leaderboard |
| **Earnings** | Today's earnings, pay period tracker, carrot goals |
| **Coaching** | AI-generated improvement tips |

Default tab: Dashboard. Tabs persist via URL query param (`?tab=performance`).

## Section 1: Dashboard Tab

Four live metric cards in a row:

| Card | Source | Update |
|------|--------|--------|
| Today's Transfers | intraday snapshot | Real-time |
| SLA/hr (Adjusted TPH) | intraday snapshot | Real-time |
| Hours Logged | intraday snapshot | Real-time |
| QA Score (Latest) | `qa_results` table | Daily |

Each card shows current value, delta vs yesterday same-time, and a micro-sparkline (last 7 days).

**Event Feed** below the cards — a combined timeline of:
- Transfer events (from intraday snapshots, showing count changes)
- QA results posted (from `qa_results` table)
- Tier promotions / streak milestones (computed client-side)
- Shift start/end markers (from intraday first/last snapshot)

Feed uses Framer Motion `AnimatePresence` for smooth entry animations. Max 20 items shown, scrollable.

## Section 2: Performance Tab

### Tier System (5 tiers)

| Tier | Name | SLA/hr Threshold | Badge |
|------|------|-------------------|-------|
| 1 | Rookie | < 2.0 | Bronze |
| 2 | Performer | 2.0 – 2.99 | Silver |
| 3 | Pro | 3.0 – 3.99 | Gold |
| 4 | Star | 4.0 – 4.99 | Platinum |
| 5 | Elite | 5.0+ | Diamond |

Tier is computed from 7-day rolling average SLA/hr. Progress bar shows distance to next tier. Tier change triggers confetti animation via `canvas-confetti`.

### Streaks

- **Hot Streak:** Consecutive days above break-even SLA/hr (ACA: 2.5, Medicare: 3.5)
- **Perfect Attendance:** Consecutive scheduled days worked (no NCNS)
- **QA Champion:** Consecutive calls above 80% compliance score

Streaks displayed as flame/fire icons with day count. Streak broken = reset animation.

### Campaign Leaderboard

Top 10 agents in the agent's campaign, ranked by today's SLA/hr. Agent's own position highlighted. Uses existing `includeRank` param from `useIntradayData`. Campaign-only (not cross-campaign) to keep competition fair.

### Trend Chart

7-day SLA/hr trend via Recharts `AreaChart`. Break-even line overlaid. Data from `dialedin_agent_performance` (EOD final numbers).

## Section 3: Earnings Tab

### Today's Earnings Card

```
Hours Logged × Hourly Wage = Today's Earnings
(e.g., 4.5 hrs × $18.00/hr = $81.00)
```

Live counter that updates as hours accumulate. Wage from `employee_directory.hourly_wage`. Canadian agents converted via FX rate.

### Pay Period Tracker

Visual progress bar showing earnings accumulated in current pay period (bi-weekly). Projection line shows estimated total if current pace continues.

### Carrot Goals

Three goal cards, each showing proximity to a target:

| Goal | Logic | Reward Message |
|------|-------|----------------|
| Daily Transfer Target | "X more transfers to hit Y" | "Hit your daily target!" |
| Weekly Earnings Milestone | "Earn $Z more this week to hit $W" | Configurable milestones |
| Tier Promotion | "Maintain X.X SLA/hr for Y more days to reach [Tier]" | Tier badge unlock |

Goals use progress rings (circular progress indicators). Completed goals get a checkmark + celebration animation.

## Section 4: Coaching Tab

AI-generated coaching cards powered by Aura (existing AI infrastructure). Three cards refreshed daily:

| Card | Content |
|------|---------|
| **Strength** | What the agent is doing well (based on QA scores, TPH trend) |
| **Growth Area** | Specific metric to improve with actionable tip |
| **Daily Challenge** | A concrete goal for today (e.g., "Try to hit 3.0 SLA/hr before 2 PM") |

Data inputs to AI: last 7 days of performance data, recent QA results, current tier, streak status.

New API route: `POST /api/agent/coaching` — calls AI with agent context, caches response for 24hr.

Cards use a "flip" animation to reveal content. Agent can mark daily challenge as "accepted" (stored in localStorage for now).

## Section 5: Manager Portal Enhancements

When managers view the agent portal enhancements reflected in their own dashboard:

- **Tier Distribution Chart:** Pie/donut chart showing team breakdown by tier
- **Agent Table Columns:** Add "Tier", "Streak", "Yesterday SLA/hr" columns
- **Agent Drill-Down:** Click agent name to see their full agent portal view (read-only)

## Data Flow

```
Agent logs in → Firebase Auth → Supabase profile lookup → role='agent'
  → Dashboard tab loads:
    - useIntradayData(agent=self) → live metrics
    - Supabase Realtime → event feed
  → Performance tab loads:
    - /api/agent/stats → 7-day perf history
    - useIntradayData(includeRank=true) → leaderboard
  → Earnings tab loads:
    - employee_directory.hourly_wage
    - useIntradayData → hours_logged
    - /api/agent/earnings → pay period data
  → Coaching tab loads:
    - /api/agent/coaching → AI-generated cards (cached 24hr)
```

## New Files Needed

- `src/app/(protected)/agent/page.tsx` — Enhanced (tab layout)
- `src/components/agent/AgentDashboardTab.tsx`
- `src/components/agent/AgentPerformanceTab.tsx`
- `src/components/agent/AgentEarningsTab.tsx`
- `src/components/agent/AgentCoachingTab.tsx`
- `src/components/agent/TierBadge.tsx`
- `src/components/agent/StreakIndicator.tsx`
- `src/components/agent/EventFeed.tsx`
- `src/components/agent/CarrotGoalCard.tsx`
- `src/components/agent/LeaderboardTable.tsx`
- `src/app/api/agent/coaching/route.ts`
- `src/app/api/agent/earnings/route.ts`
- `src/hooks/useAgentCoaching.ts`
- `src/hooks/useAgentEarnings.ts`
- `src/utils/agent-tiers.ts` — Tier definitions + computation logic

## Non-Goals (for now)

- Commission / bonus structure (separate future work per user)
- Mobile PWA packaging
- Push notifications
- Cross-campaign leaderboard
- Manager ability to set custom goals per agent

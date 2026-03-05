# PitchVision Web - Directory Structure & Conventions

## Top-Level Directory Layout

```
/Users/MikiF/pitch-vision-web/
├── .claude/                      # User private project memory
│   └── projects/-Users-MikiF-pitch-vision-web/memory/MEMORY.md
├── .planning/                    # Architecture & planning docs (NEW)
│   └── codebase/
│       ├── ARCHITECTURE.md
│       └── STRUCTURE.md
├── .serena/                      # Serena code editor config
├── .vercel/                      # Vercel deployment config
├── .vscode/                      # VS Code settings
├── .git/                         # Git history
├── .n8n-snapshots/               # n8n workflow backups (~60 snapshots)
├── .next/                        # Next.js build output (ignored)
├── src/                          # Source code (see below)
├── scripts/                      # Utility scripts (52 files, see below)
├── docs/                         # Documentation (12 subdirs)
├── public/                       # Static assets (favicons, images)
├── supabase/                     # Supabase migrations & triggers (17 dirs)
├── nginx/                        # Nginx reverse proxy config (Docker)
├── Dockerfile                    # Production image
├── Dockerfile.cron               # Cron job image (Alpine)
├── docker-compose.yml            # Local dev compose
├── next.config.ts                # Next.js config (standalone output, IgnoreBuildErrors)
├── tsconfig.json                 # TypeScript config (@/* alias)
├── package.json                  # Dependencies + scripts
├── package-lock.json             # Lock file
├── .env.local                    # Local secrets (Firebase, Supabase keys)
├── .env.production               # Prod secrets
├── .env.production.template      # Prod template
├── .gitignore                    # Git ignores (.env*, node_modules, .next, etc.)
├── .dockerignore                 # Docker build ignores
├── vercel.json                   # Vercel build config
├── firebase.json                 # Firebase CLI config
├── firestore.rules               # Firestore security rules (unused)
├── firestore.indexes.json        # Firestore indexes (unused)
└── postcss.config.mjs            # PostCSS + Tailwind config
```

---

## `/src` Directory Structure (Main Application)

```
src/
├── app/                          # Next.js App Router pages & API routes
├── components/                   # Reusable React components (30+ directories)
├── context/                      # Global context providers (4 files)
├── lib/                          # Shared libraries & configs (9 files)
├── hooks/                        # Custom React hooks (6 files)
├── utils/                        # Utility modules (33 files, 1000+ lines each)
├── types/                        # TypeScript type definitions (4 files)
├── config/                       # Configuration modules
├── middleware.ts                 # Next.js request middleware (QA lockdown)
└── globals.css                   # Global Tailwind styles
```

### `/src/app` - Next.js App Router (Routes & API)

```
app/
├── layout.tsx                    # Root layout (AuthProvider, VoiceProvider)
├── globals.css                   # Global styles
├── middleware.ts                 # Request interceptor (QA mode)
│
├── (protected)/                  # Protected route group
│   ├── layout.tsx                # Auth enforcement, role checks (94 lines)
│   ├── agent/                    # Agent portal
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Dashboard redirect
│   │   ├── education/            # Learning management
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   └── [courseId]/page.tsx
│   │   ├── resources/            # Learning materials
│   │   └── rewards/              # Pitch Points
│   │       ├── layout.tsx
│   │       ├── page.tsx          # Main page
│   │       ├── leaderboard/
│   │       ├── store/
│   │       └── history/
│   │
│   ├── hr/                       # HR operations
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Dashboard
│   │   ├── directory/            # Employee roster
│   │   ├── schedule/             # Agent schedules
│   │   ├── attendance/           # Daily attendance
│   │   ├── calendar/             # Calendar view
│   │   ├── analytics/            # HR metrics
│   │   ├── onboarding/           # New hire portal
│   │   ├── pitch-points/         # Rewards admin
│   │   ├── reports/              # Weekly/monthly reports
│   │   └── launch/               # Slack channel setup
│   │
│   ├── executive/                # Leadership dashboard
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Main dashboard (KPIs + revenue)
│   │   ├── analytics/            # Advanced analytics
│   │   ├── pnl/                  # Profit & Loss
│   │   ├── revenue/              # Retreaver revenue ticker
│   │   ├── dialedin/             # DialedIn data management
│   │   ├── roster/               # Hiring pipeline
│   │   ├── operations/           # Alerts + health
│   │   └── expenses/             # Cost tracking
│   │
│   ├── manager/                  # Team managers
│   │   └── pitch-points/
│   │
│   └── partner/                  # Partner portal (future)
│
├── qa/                           # QA dashboard (public if QA_ONLY mode, else protected)
│   ├── layout.tsx
│   └── page.tsx                  # Compliance scoring + Aura AI chat
│
├── auth/                         # Auth flows
│   ├── layout.tsx
│   └── setup/page.tsx            # Post-login setup
│
├── login/page.tsx                # Firebase login page (public)
├── onboarding/                   # Onboarding portal (public)
│   ├── layout.tsx
│   ├── page.tsx
│   └── complete/page.tsx         # Thank-you page (portal disabled)
│
├── admin/                        # Admin panel
│   ├── layout.tsx
│   └── employees/page.tsx        # Invite / bulk upload
│
├── text-reveal/page.tsx          # Demo / animation showcase
│
└── api/                          # API route handlers (42+ endpoints)
    ├── auth/
    │   ├── login/route.ts
    │   ├── signup/route.ts
    │   ├── verify-invitation/route.ts
    │   └── complete-registration/route.ts
    │
    ├── cron/                     # Scheduled jobs (CRON_SECRET auth)
    │   ├── slack-sync/route.ts
    │   ├── dialedin-ingest/route.ts
    │   ├── dialedin-intraday/route.ts
    │   ├── retreaver-ingest/route.ts
    │   ├── directory-audit/route.ts
    │   ├── sync-health/route.ts
    │   ├── sam-alerts/route.ts
    │   └── sam-weekly-digest/route.ts
    │
    ├── dialedin/                 # DialedIn analytics (20+ endpoints)
    │   ├── kpis/route.ts
    │   ├── agents/route.ts
    │   ├── agent-stats/route.ts
    │   ├── agent-live/route.ts
    │   ├── live/route.ts
    │   ├── revenue/route.ts
    │   ├── intraday/route.ts
    │   ├── forecast/route.ts
    │   ├── anomalies/route.ts
    │   ├── coaching/route.ts
    │   ├── skills/route.ts
    │   ├── upload/route.ts
    │   ├── webhook/events/route.ts
    │   └── (11 more endpoints)
    │
    ├── retreaver/                # Revenue tracking (3 endpoints)
    │   ├── revenue/route.ts
    │   ├── live/route.ts
    │   └── sync/route.ts
    │
    ├── qa/                       # Quality assurance (13+ endpoints)
    │   ├── aura-chat/route.ts
    │   ├── aura-query/route.ts
    │   ├── upload-recording/route.ts
    │   ├── delete-calls/route.ts
    │   ├── update-score/route.ts
    │   └── (8 more)
    │
    ├── hr/                       # HR operations (8 endpoints)
    │   ├── schedule/route.ts
    │   ├── terminate-employee/route.ts
    │   ├── performance-bulk/route.ts
    │   └── (5 more)
    │
    ├── pitch-points/             # Rewards system (20+ endpoints)
    │   ├── balance/route.ts
    │   ├── leaderboard/route.ts
    │   ├── redeem/route.ts
    │   ├── admin/
    │   ├── manager/
    │   ├── cron/
    │   └── (more)
    │
    ├── slack/                    # Slack integration (6 endpoints)
    │   ├── events/route.ts
    │   ├── interactions/route.ts
    │   ├── attendance-events/route.ts
    │   └── (3 more)
    │
    ├── docuseal/                 # Contract signing (3 endpoints)
    │   ├── send-contract/route.ts
    │   ├── check-status/route.ts
    │   └── webhook/route.ts
    │
    ├── onboarding/               # Onboarding workflows (2 endpoints)
    │   └── progress/route.ts
    │
    ├── user/profile/route.ts     # User profile endpoint
    ├── email/send/route.ts       # Email delivery
    ├── fx-rate/route.ts          # Currency conversion (CAD→USD)
    ├── health/route.ts           # Health check
    ├── n8n-proxy/route.ts        # n8n API pass-through
    └── debug/processing-jobs/route.ts  # Development
```

**API Route Naming Convention:**
- Directory structure matches route: `/api/dialedin/kpis` → `src/app/api/dialedin/kpis/route.ts`
- Cron routes require `Authorization: Bearer ${CRON_SECRET}` header
- All routes return `NextResponse.json()` with `{success, data}` or `{error}`

---

### `/src/components` - React Components (30+ directories)

```
components/
├── ui/                           # Base UI components (23 files)
│   ├── button.tsx                # Styled button (Radix)
│   ├── card.tsx                  # Card container
│   ├── checkbox.tsx              # Checkbox
│   ├── dialog.tsx                # Modal dialog
│   ├── dropdown.tsx              # Dropdown menu
│   ├── input.tsx                 # Text input
│   ├── label.tsx                 # Form label
│   ├── tabs.tsx                  # Tab navigation
│   ├── select.tsx                # Select dropdown
│   ├── slider.tsx                # Slider input
│   ├── tooltip.tsx               # Tooltip
│   ├── badge.tsx                 # Badge tag
│   ├── alert.tsx                 # Alert box
│   └── (13 more base UI)
│
├── layout/                       # Navigation & layout
│   ├── Navbar.tsx
│   ├── Sidebar.tsx
│   ├── SidebarNav.tsx
│   └── BreadcrumbNav.tsx
│
├── dashboard/                    # Executive dashboard
│   ├── KPICard.tsx               # KPI metric card
│   ├── TrendChart.tsx            # Trend sparkline
│   ├── RevenueWidget.tsx         # Revenue aggregates
│   └── LabourCostBreakdown.tsx
│
├── dialedin/                     # DialedIn features (32 files)
│   ├── AgentTable.tsx            # Agent list view
│   ├── AgentCard.tsx             # Agent card widget
│   ├── KPIChart.tsx              # Time-series chart
│   ├── HeatmapChart.tsx          # Heatmap visualization
│   ├── AlertCard.tsx             # Performance alert
│   ├── CoachingImpact.tsx        # Coaching metrics
│   ├── AnomalyDetector.tsx       # Anomaly visualization
│   ├── revenue/
│   │   ├── RevenueTickerLive.tsx # Live ticker (Retreaver)
│   │   ├── RevenueTrendChart.tsx # Revenue trend
│   │   └── CampaignRevenue.tsx
│   └── (more)
│
├── hr/                           # HR features (23 files)
│   ├── EmployeeTable.tsx         # Roster table
│   ├── EmployeeProfileDrawer.tsx # Employee detail panel
│   ├── ScheduleCalendar.tsx      # Calendar view
│   ├── AttendanceWidget.tsx      # Daily attendance
│   ├── AnalyticsCard.tsx         # HR metrics
│   ├── onboarding/
│   │   ├── ChecklistCard.tsx     # Onboarding steps
│   │   ├── ChecklistItemDetail.tsx
│   │   ├── DocumentUpload.tsx    # File upload
│   │   └── ContractStatus.tsx    # DocuSeal status
│   └── schedule/
│       ├── ShiftTable.tsx        # Shift view
│       └── BreakSchedule.tsx
│
├── qa/                           # QA features (19 files)
│   ├── TranscriptViewer.tsx      # Call transcript
│   ├── ComplianceCard.tsx        # Compliance score card
│   ├── AutoFailMarker.tsx        # Auto-fail annotations
│   ├── AuraVoiceWidget.tsx       # Aura AI voice chat
│   ├── AuraChat.tsx              # Aura AI text chat
│   ├── QADashboard.tsx           # Main QA page
│   ├── ui/
│   │   ├── WaveformViewer.tsx   # Audio waveform
│   │   └── LegendItems.tsx       # Chart legend
│   └── (more)
│
├── pitch-points/                 # Rewards system (10 files)
│   ├── LeaderboardTable.tsx      # Rankings table
│   ├── StoreCard.tsx             # Store item
│   ├── RedemptionForm.tsx        # Redemption submission
│   ├── PointsBalance.tsx         # Balance display
│   └── (more)
│
├── roster/                       # Team management (8 files)
│   ├── HiringPipeline.tsx        # Hiring stages
│   ├── TerminationCard.tsx       # Termination workflow
│   ├── OrgChart.tsx              # Org structure
│   └── (more)
│
├── agent/                        # Agent features (3 files)
│   ├── AgentRewards.tsx
│   └── AgentEducation.tsx
│
├── onboarding/                   # Onboarding UI (3 files)
│   ├── InvitationForm.tsx        # Invite new hire
│   ├── BulkImport.tsx            # Bulk upload
│   └── OnboardingPortal.tsx      # New hire dashboard
│
├── chat/                         # Chat features (2 files)
│   └── ChatWidget.tsx
│
└── (additional feature directories)
```

**Component Naming Conventions:**
- PascalCase file names (e.g., `EmployeeTable.tsx`)
- Client components: `"use client"` at top
- Server components: no directive (default)
- Props interface named `{ComponentName}Props`
- Export default component at bottom

---

### `/src/lib` - Shared Libraries & Config (9 files)

```
lib/
├── supabase.ts                   # Export (auto-detects env)
├── supabase-client.ts            # Client-side (15 lines)
├── supabase-admin.ts             # Server-side admin (18 lines)
├── firebase.ts                   # Firebase config
├── campaign-config.ts            # Campaign-to-manager mapping (114 lines)
├── slack-config.ts               # Slack workspace config
├── hr-utils.ts                   # HR deduplication + name matching (427 lines)
├── mock-data.ts                  # Test data fixtures
└── utils.ts                      # Generic helpers
```

**Library Usage Patterns:**
```typescript
// Server-side (API routes, cron jobs)
import { supabaseAdmin } from '@/lib/supabase-admin';
const { data, error } = await supabaseAdmin.from('table').select('*');

// Client-side (React components)
import { supabaseClient } from '@/lib/supabase-client';
const channel = supabaseClient.channel('table:id=123').on('*', handler);
```

---

### `/src/context` - Global State Providers (4 files)

```
context/
├── AuthContext.tsx               # User auth + profile (47 lines)
│   └── useAuth() hook
├── QAContext.tsx                 # QA filters + view state (22 lines)
│   └── useQA() hook
├── VoiceContext.tsx              # ElevenLabs speech (37 lines)
│   └── useVoice() hook
└── ExecutiveFilterContext.tsx    # Date + metric filters (144 lines)
    └── useExecutiveFilter() hook
```

**Context Consumer Pattern:**
```typescript
import { useAuth } from '@/context/AuthContext';
const { user, profile, loading } = useAuth();
```

---

### `/src/hooks` - Custom React Hooks (6 files)

```
hooks/
├── useAuth.ts                    # Auth context hook
├── useIntradayData.ts            # Intraday metrics fetching (107 lines)
├── useAgentDialedinStats.ts      # Agent-specific metrics (113 lines)
├── useLiveData.ts                # Real-time dashboard updates (71 lines)
├── useRecentQAStats.ts           # QA metrics fetch (81 lines)
└── useGeminiLive.ts              # Gemini Live streaming (616 lines)
```

**Hook Usage Pattern:**
```typescript
const { data, loading, error } = useIntradayData({ agentId, dateRange });
```

---

### `/src/utils` - Utility Modules (33 files, 1000+ LOC each)

```
utils/
├── dialedin-kpi.ts               # KPI computation (1062 lines)
│   ├── computeAgentPerformance()
│   ├── computeTeamKPIs()
│   ├── getBreakAllowanceMin()
│   ├── getBreakEvenTPH()
│   └── (metric aggregation)
│
├── dialedin-parser.ts            # XLS parsing (617 lines)
│   ├── parseDialedInReport()
│   ├── parseAgentSummary()
│   ├── deduplicatePerformance()
│   └── (column mapping)
│
├── dialedin-store.ts             # Data persistence (428 lines)
│   ├── storePerformanceData()
│   ├── syncIntraday()
│   └── (DB writes)
│
├── dialedin-revenue.ts           # Revenue calc (150 lines)
│   ├── getBreakEvenTPH()
│   ├── computeAgentRevenue()
│   └── (FX conversion)
│
├── dialedin-analytics.ts         # Analytics (382 lines)
│   ├── computeRampCurve()
│   ├── detectAnomalies()
│   └── (trend analysis)
│
├── dialedin-scraper.ts           # IMAP email parsing (272 lines)
│   ├── fetchDialedInEmails()
│   ├── parseEmailAttachments()
│   └── (IMAP client)
│
├── dialedin-webhook.ts           # Real-time events (424 lines)
│   ├── processAgentActivity()
│   ├── updateLiveSnapshot()
│   └── (event handlers)
│
├── qa-utils.ts                   # QA compliance (413 lines)
│   ├── computeComplianceScore()
│   ├── validateAutoFails()
│   ├── mapAutoFailCodes()
│   └── (scoring logic)
│
├── retreaver-ingest.ts           # Revenue sync (680 lines)
│   ├── syncRetreaverFromCSV()
│   ├── enrichWithPhoneData()
│   ├── deduplicateCalls()
│   └── (multi-signal matching)
│
├── pitch-points-utils.ts         # Rewards calc (317 lines)
│   ├── calculatePointsEarned()
│   ├── applyRedemption()
│   └── (accrual logic)
│
├── hr-utils.ts                   # HR dedup (427 lines)
│   ├── deduplicateEmployees()
│   ├── matchNames()
│   ├── formatScheduleKey()
│   └── (roster logic)
│
├── pdf-report.ts                 # PDF generation (609 lines)
│   ├── generateQAReport()
│   ├── generatePerformanceReport()
│   └── (jsPDF + pdfkit)
│
├── contract-templates.ts         # DocuSeal HTML (394 lines)
│   ├── getContractHTML()
│   ├── getAttestationHTML()
│   └── (template literals)
│
├── attestation-templates.ts      # Attestation HTML (231 lines)
│   └── attestationHTMLTemplate()
│
├── certificate-pdf.ts            # Certificate gen (138 lines)
│   ├── generateCertificate()
│   └── (jsPDF)
│
├── onboarding-helpers.ts         # Onboarding logic (127 lines)
│   ├── getChecklistItems()
│   ├── mapChecklistStatus()
│   └── (country-specific)
│
├── s3-upload.ts                  # S3 file uploads (56 lines)
│   └── uploadToS3()
│
├── fx.ts                         # Currency conversion (60 lines)
│   ├── getFXRate()
│   ├── convertCADtoUSD()
│   └── (live rate + cache)
│
├── format.ts                     # Formatting helpers (39 lines)
│   ├── formatCurrency()
│   ├── formatPercent()
│   └── (display formatting)
│
├── directory-utils.ts            # Slack name matching (60 lines)
│   ├── namesMatch()
│   └── (fuzzy matching)
│
├── report-generator.ts           # Report exports (444 lines)
│   ├── generateCSV()
│   ├── generateExcel()
│   └── (data export)
│
├── aura-context.ts               # Aura AI state (618 lines)
│   ├── manageConversationHistory()
│   ├── formatTranscriptContext()
│   └── (Gemini Live)
│
├── dialedin-heatmap.ts           # Heatmap data (127 lines)
│   ├── generateHeatmap()
│   └── (time-series binning)
│
├── dialedin-new-hires.ts         # New hire detection (60 lines)
│   ├── fetchNewHireSet()
│   ├── isNewHireAgent()
│   └── (5-shift threshold)
│
├── dialer-adapter.ts             # Dialer cost tracking (75 lines)
│   ├── computeDialerCost()
│   └── (per-agent allocation)
│
├── dialedin-cache.ts             # Cache layer (27 lines)
│   └── (memoization)
│
└── (more utility modules)
```

**Utility Module Pattern:**
```typescript
// Export pure functions, no side effects
export function computeAgentPerformance(data: AgentData[]): PerformanceMetrics {
  // business logic
  return metrics;
}

// In API route:
import { computeAgentPerformance } from '@/utils/dialedin-kpi';
const metrics = computeAgentPerformance(rawData);
```

---

### `/src/types` - TypeScript Definitions (4 files)

```
types/
├── dialedin-types.ts             # DialedIn schemas (1,083 lines)
│   ├── AgentPerformance
│   ├── CampaignMetrics
│   ├── SubcampaignSummary
│   ├── ReportMetadata
│   └── (15+ interfaces)
│
├── qa-types.ts                   # QA schemas (289 lines)
│   ├── QAResult
│   ├── AutoFailCode
│   ├── ComplianceScore
│   └── (10+ interfaces)
│
├── pitch-points-types.ts         # Rewards schemas (142 lines)
│   ├── PointsTransaction
│   ├── RedemptionRequest
│   └── (5+ interfaces)
│
└── supabase.ts                   # (Supabase auto-generated types, if using CLI)
```

**Type Definition Pattern:**
```typescript
export interface AgentPerformance {
  agent_id: string;
  agent_name: string;
  tph: number;  // Transfers per hour
  sla_rate: number;  // 0-100 percent
  cost: number;  // USD
}
```

---

### `/src/config` - Configuration Modules

```
config/
└── (Minimal config here; most in /lib)
```

---

## `/scripts` Directory - Utility Scripts (52 files)

```
scripts/
├── pitch-health-blocklist.json   # 115 names to exclude (Pitch Health team)
├── sheets-to-supabase-sync.js    # Google Apps Script (V3, paste into Apps Script)
├── n8n-deploy.py                 # n8n deployment + auto-rollback
├── dialedin-parser.mjs           # XLS parsing CLI tool
├── slack-cleanup.mjs             # Slack user cleanup utility
├── slack-full-audit.mjs          # Slack audit (reconciliation, dedup)
├── add-eustace.mjs               # Add specific employee script
├── audit-directory.js            # Directory audit + backfill photos
├── qa-violations-sync.js         # Sync QA violations to HR
├── (40+ more utility scripts)
└── _audit-directory.js           # (Legacy)
```

**Script Execution Pattern:**
```bash
# Deploy n8n workflow with auto-rollback
python3 scripts/n8n-deploy.py ai-analysis --rollback

# Add employee to directory
node scripts/add-eustace.mjs

# Audit Slack → employee_directory reconciliation
node scripts/slack-full-audit.mjs
```

---

## `/docs` Directory - Documentation (12 subdirs)

```
docs/
├── google-apps-script-hr-sync.js # DEPRECATED (V2, replaced by sheets-to-supabase-sync.js)
├── qa-pipeline-architecture.md   # QA n8n workflow details
├── campaign-guidelines.md        # ACA/Medicare/WhatIF checklists
├── onboarding-status.md          # Onboarding portal progress
├── (more markdown docs)
└── (9+ other directories)
```

---

## `/supabase` Directory - Database Migrations (17 subdirs)

```
supabase/
├── migrations/                   # SQL migration files
│   ├── 20240101000000_init.sql
│   ├── 20240115000000_add_qa_tables.sql
│   ├── 20240201000000_add_indexes.sql
│   └── (40+ migration files)
├── seed.sql                      # Initial data seed
├── functions/                    # PostgreSQL functions
│   ├── set_auto_tag_by_compliance_score.sql
│   └── (more functions)
├── triggers/                     # PostgreSQL triggers
│   └── (trigger definitions)
└── (more directories)
```

**Database Table Count: 25+ tables**
- `users` — User accounts + roles
- `employee_directory` — Employee records + hiring status
- `dialedin_agent_performance` — Daily agent metrics
- `dialedin_daily_kpis` — Team-level KPIs
- `dialedin_agent_snapshots` — Intraday snapshots
- `qa_results` — Call transcripts + compliance scores
- `qa_auto_fails` — Auto-fail violations
- `qa_language_assessments` — AI language analysis
- `retreaver_events` — Call revenue events
- `pitch_points_transactions` — Reward accrual/redemption
- `pitch_points_store` — Reward catalog
- `pitch_points_rules` — Point accrual rules
- `app_config` — Global feature toggles
- `executive_cost_config` — Cost tracking (salary, subscriptions, dialer)
- `agent_schedules` — Agent schedule (synced from Google Sheets)
- `onboarding_checklist` — New hire tasks (country-specific)
- `employee_documents` — Uploaded files (contract, ID, etc.)
- `slack_users` — Cached Slack user profiles
- `dialedin_reports` — Report metadata + upload history
- (5+ more)

---

## Naming Conventions

### File & Directory Names

| Category | Convention | Example |
|----------|-----------|---------|
| React Components | PascalCase | `EmployeeTable.tsx`, `KPICard.tsx` |
| Pages | lowercase | `page.tsx`, `[id]/page.tsx` |
| API routes | snake_case dirs, lowercase file | `/api/dialedin/agent-stats/route.ts` |
| Utils | camelCase | `dialedin-kpi.ts`, `qa-utils.ts` |
| Context | PascalCase + Context suffix | `AuthContext.tsx`, `QAContext.tsx` |
| Hooks | camelCase + use prefix | `useAuth()`, `useIntradayData()` |
| Types | PascalCase | `AgentPerformance`, `QAResult` |
| Config | camelCase | `campaign-config.ts`, `slack-config.ts` |

### Variable & Function Names

| Category | Convention | Example |
|----------|-----------|---------|
| Constants | UPPER_SNAKE_CASE | `BREAK_EVEN_TPH`, `MAX_TPH` |
| Functions | camelCase | `computeAgentPerformance()`, `deduplicateEmployees()` |
| Variables | camelCase | `agentId`, `performanceData` |
| Database columns | snake_case | `agent_name`, `report_date`, `created_at` |
| Env vars | UPPER_SNAKE_CASE | `CRON_SECRET`, `NEXT_PUBLIC_QA_ONLY` |
| Route params | [bracket] in path | `/agent/[agentId]/page.tsx` |

### API Naming

| Pattern | Purpose | Example |
|---------|---------|---------|
| `GET /api/{resource}` | Fetch list/single | `GET /api/dialedin/agents?limit=50` |
| `POST /api/{resource}` | Create | `POST /api/pitch-points/redeem` |
| `PUT /api/{resource}/{id}` | Update | `PUT /api/hr/schedule/{id}` |
| `DELETE /api/{resource}/{id}` | Delete | `DELETE /api/qa/delete-calls` |
| `GET /api/cron/{task}` | Scheduled job | `GET /api/cron/slack-sync` |
| `POST /api/webhooks/{system}` | External callback | `POST /api/slack/events` |

---

## Import Path Aliases

**Configured in `tsconfig.json`:**
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**Usage:**
```typescript
// Instead of: import { supabaseAdmin } from '../../../lib/supabase-admin';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Instead of: import { EmployeeTable } from '../../../components/hr/EmployeeTable';
import { EmployeeTable } from '@/components/hr/EmployeeTable';

// Instead of: import { useAuth } from '../../../context/AuthContext';
import { useAuth } from '@/context/AuthContext';
```

---

## Environment Variables

### Build-Time Variables (Next.js)

**Prefix with `NEXT_PUBLIC_` to expose to client:**
```
NEXT_PUBLIC_QA_ONLY=false              # QA lockdown mode
NEXT_PUBLIC_SUPABASE_URL=...           # Supabase API URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=...      # Anon key (client-side)
```

### Server-Only Variables

```
SUPABASE_SERVICE_ROLE_KEY=...          # Service role (server-side only)
FIREBASE_PROJECT_ID=...                # Firebase config
FIREBASE_PRIVATE_KEY=...               # Private key
CRON_SECRET=...                        # Authorization for cron jobs
SLACK_BOT_TOKEN=...                    # Slack API token
N8N_API_KEY=...                        # n8n webhook API key
DOCUSEAL_API_KEY=...                   # DocuSeal signing service
SMTP_USER=...                          # Google Workspace email
SMTP_PASSWORD=...                      # App password (not regular password)
AWS_ACCESS_KEY_ID=...                  # S3 credentials
AWS_SECRET_ACCESS_KEY=...
OPENROUTER_API_KEY=...                 # OpenRouter (DeepSeek V3)
```

### Configuration

**Set in `.env.local` (dev) or Vercel environment (prod):**
```
# Defaults from code (can override):
REVENUE_RATE_ACA=10.50                 # $/call (ACA)
REVENUE_RATE_MEDICARE=7.00             # $/call (Medicare)
BREAK_EVEN_TPH_ACA=2.5                 # Transfers/hour
BREAK_EVEN_TPH_MEDICARE=3.5
```

---

## Key Files Size & Complexity

| File | Lines | Complexity | Purpose |
|------|-------|-----------|---------|
| `dialedin-kpi.ts` | 1,062 | High | Core KPI computation engine |
| `dialedin-parser.ts` | 617 | High | XLS parsing + column mapping |
| `dialedin-types.ts` | 1,083 | Medium | Type definitions (15+ interfaces) |
| `retreaver-ingest.ts` | 680 | High | Multi-signal deduplication |
| `qa-utils.ts` | 413 | Medium | Compliance scoring logic |
| `hr-utils.ts` | 427 | Medium | HR deduplication + name matching |
| `pitch-points-utils.ts` | 317 | Medium | Rewards accrual logic |
| `(protected)/layout.tsx` | 94 | Medium | Auth enforcement + role checks |
| `auth/login/route.ts` | 189 | Medium | Firebase → Supabase sync |
| `cron/slack-sync/route.ts` | 300+ | High | Daily Slack reconciliation |

---

## Summary: Dependency Graph

```
User Interaction
    ↓
React Components (client-side)
    ├─ Context (AuthProvider, QAProvider, etc.)
    ├─ Hooks (useAuth, useIntradayData, etc.)
    └─ Utility Modules (dialedin-kpi.ts, qa-utils.ts)
    ↓
API Routes (server-side)
    ├─ Auth validation (FirebaseUID → Supabase user)
    ├─ Supabase queries (service role key)
    └─ Service logic (utils modules)
    ↓
Supabase Database
    ├─ 25+ tables
    ├─ Migrations + triggers
    └─ Storage (employee_documents, recordings)
    ↓
External Systems
    ├─ Slack API (reconciliation, events)
    ├─ DialedIn IMAP (daily report ingestion)
    ├─ Retreaver webhooks (revenue tracking)
    ├─ n8n API (QA pipeline orchestration)
    ├─ DocuSeal API (contract signing)
    ├─ Firebase Auth (login)
    ├─ Google Sheets API (schedule sync)
    └─ Replicate API (WhisperX transcription)
```

---

## Quick Navigation Tips

**Find a specific route:**
```bash
# /api/dialedin/agents → src/app/api/dialedin/agents/route.ts
# /hr/schedule → src/app/(protected)/hr/schedule/page.tsx
```

**Find a component:**
```bash
# EmployeeTable → src/components/hr/EmployeeTable.tsx
# KPICard → src/components/dashboard/KPICard.tsx or src/components/dialedin/KPICard.tsx
```

**Find business logic:**
```bash
# KPI computation → src/utils/dialedin-kpi.ts
# Auto-fail detection → src/utils/qa-utils.ts
# HR deduplication → src/utils/hr-utils.ts
# Revenue calculation → src/utils/dialedin-revenue.ts or dialedin-kpi.ts
```

**Find configuration:**
```bash
# Campaign managers → src/lib/campaign-config.ts
# Slack channels → src/lib/slack-config.ts
# Pitch Health blocklist → scripts/pitch-health-blocklist.json
```

**Find types:**
```bash
# DialedIn types → src/types/dialedin-types.ts
# QA types → src/types/qa-types.ts
# Pitch Points types → src/types/pitch-points-types.ts
```

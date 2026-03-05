# PitchVision Web - Architecture Overview

## Overall Pattern: Next.js 16 App Router + Supabase Backend

This is a Next.js 16 application using the App Router pattern (server and client components) with Supabase as the primary database backend. The app is deployed on Vercel with containerized cron jobs running on separate infrastructure (Alpine Docker for IMAP/n8n tasks).

**Key Tech Stack:**
- **Framework:** Next.js 16.1.0 (App Router, Standalone output)
- **UI:** React 19.2.3 + Tailwind CSS 4 + Radix UI primitives
- **Database:** Supabase (PostgreSQL + Storage)
- **Auth:** Firebase Authentication (client) → Supabase user sync (server)
- **Charting:** Recharts 3.6.0
- **External APIs:** Slack, DialedIn (SMTP/IMAP), Retreaver, n8n, DocuSeal, Google Sheets
- **Server Tasks:** IMAP ingestion, n8n pipeline orchestration, cron jobs

---

## Route Structure

### Top-Level Routes

```
/ (root)
  ├── /login — Public login page (Firebase Auth)
  ├── /auth/setup — Post-login setup wizard
  ├── /onboarding — Public onboarding portal (invitation flow)
  ├── /onboarding/complete — Thank-you page (portal access disabled)
  ├── /qa — Public QA dashboard (locked behind NEXT_PUBLIC_QA_ONLY env flag)
  │   └── /?view=aura — Aura AI chat interface
  ├── /admin — Admin employee management (invite/bulk upload)
  └── /(protected)/* — Authenticated routes (see below)
```

### Protected Routes (under `src/app/(protected)/`)

Wrapped by `ProtectedLayout` which enforces:
- User authentication (Firebase → Supabase user lookup)
- Role-based route access (client-side checks)
- Portal access toggles for agents
- Admin override (miki@pitchperfectsolutions.net)

**Protected Sections by Role:**

#### `/agent` (Agent Portal)
- `/agent/education` — Course library + certificate generation
- `/agent/education/[courseId]` — Individual course page
- `/agent/resources` — Learning materials
- `/agent/rewards` — Pitch Points redemption interface
- `/agent/rewards/leaderboard` — Team rankings
- `/agent/rewards/store` — Rewards catalog
- `/agent/rewards/history` — Transaction history

#### `/hr` (HR Operations)
- `/hr/directory` — Employee roster, photos, roles
- `/hr/schedule` — Agent schedule management (Agent Schedule sheet sync)
- `/hr/attendance` — Daily attendance tracking + Slack alerts
- `/hr/calendar` — Calendar view of schedules/availability
- `/hr/analytics` — HR metrics (hiring, terminations, new-hires by month)
- `/hr/onboarding` — Onboarding portal checklist (country-specific: USA vs Canada)
- `/hr/pitch-points` — Pitch Points admin (rules, store, adjustments)
- `/hr/reports` — Weekly/monthly HR reports
- `/hr/launch` — Slack channel launch wizard

#### `/executive` (Leadership Dashboard)
- `/executive` — Main executive dashboard (live KPIs, revenue, labor cost)
- `/executive/dialedin` — DialedIn data upload + processing
- `/executive/dialedin/upload` — Bulk XLS upload interface
- `/executive/analytics` — Advanced analytics (trends, forecasts, anomalies)
- `/executive/pnl` — Profit & Loss statement (revenue - labor - costs)
- `/executive/revenue` — Retreaver revenue ticker + analytics
- `/executive/roster` — Agent roster + hiring pipeline
- `/executive/operations` — Operational alerts + health checks
- `/executive/expenses` — Cost tracking + budget management

#### `/qa` (Quality Assurance) — _Protected or Public (via QA_ONLY mode)_
- `/qa` — QA dashboard (call transcripts, compliance scoring, auto-fails)
- `/qa/?view=aura` — Aura AI coach (Gemini Live chat)

#### `/manager` (Team Managers)
- `/manager/pitch-points` — Team Pitch Points analytics

#### `/partner` (Partner/Affiliate Portal)
- (Limited, future expansion)

---

## API Layer Design

### Architecture Pattern

All API routes follow a **server-action pattern**:
1. **Route handler** (`route.ts`) receives request
2. **Validates auth** (Bearer token for crons, user context for authenticated routes)
3. **Supabase admin client** executes queries (uses service role key)
4. **Returns JSON response** (or error with 4xx/5xx status)

### Route Organization

```
src/app/api/
├── /auth/* — Authentication flows
│   ├── /login — Firebase UID → Supabase user sync + role mapping
│   ├── /signup — New user registration
│   ├── /verify-invitation — Onboarding invitation tokens
│   └── /complete-registration — Onboarding form submission
│
├── /cron/* — Scheduled background jobs (CRON_SECRET auth)
│   ├── /slack-sync — Daily employee directory reconciliation (11 AM UTC)
│   ├── /dialedin-ingest — DialedIn report ingestion + KPI aggregation
│   ├── /dialedin-intraday — Intraday performance snapshots
│   ├── /retreaver-ingest — Retreaver CSV sync (9 PM ET)
│   ├── /directory-audit — Slack/employee_directory diff + backfill
│   ├── /sync-health — Health check (HR sheets + DialedIn freshness)
│   └── /sam-alerts — Quality metrics alerts (daily digest)
│
├── /dialedin/* — DialedIn KPI queries + analytics
│   ├── /kpis — Time-series daily KPIs
│   ├── /agents — Agent list + live stats
│   ├── /agent-stats — Per-agent metrics (TPH, SLA, revenue)
│   ├── /agent-live — Real-time agent activity (via DialedIn webhook)
│   ├── /live — Live dashboard aggregates
│   ├── /revenue — Campaign-level revenue aggregates
│   ├── /intraday — Per-agent intraday snapshots (6-hourly)
│   ├── /forecast — Revenue forecast (trend extrapolation)
│   ├── /anomalies — Performance anomaly detection
│   ├── /coaching — Coaching impact metrics
│   ├── /skills — Skill-based metrics (call control, objection handling, etc.)
│   ├── /upload — Bulk DialedIn XLS import (validated, deduplicated)
│   └── /webhook/* — DialedIn real-time event callbacks
│
├── /retreaver/* — Retreaver call revenue tracking
│   ├── /revenue — Revenue aggregates by date/campaign/agent
│   ├── /live — Today's live ticker (10s polling)
│   ├── /sync — S3 CSV backfill
│   └── /upload (typo: /reatrever/upload) — Ping webhook receiver
│
├── /qa/* — Quality assurance (call transcript storage, compliance)
│   ├── /aura-chat — Gemini Live streaming (AI coach)
│   ├── /aura-query — Vector search on call transcripts
│   ├── /aura-keys — API key management
│   ├── /aura-voice — Voice input processing
│   ├── /upload-recording — S3 audio upload
│   ├── /delete-calls — Bulk transcript deletion
│   ├── /manual-auto-fail — Manual auto-fail marking
│   ├── /update-score — Compliance score override
│   ├── /update-status — Disposition update (e.g., "reviewed")
│   ├── /send-report-email — Email QA reports
│   └── /slack-history — Slack compliance channel history
│
├── /hr/* — HR operations
│   ├── /schedule — Agent schedule fetch/update (synced from Google Sheets)
│   ├── /qa-sheet-sync — QA results sync (from n8n pipeline)
│   ├── /employee-notes — Notes/flags on employees
│   ├── /terminate-employee — Termination workflow (updates status, Slack notify)
│   ├── /performance-summary — Agent performance aggregates
│   ├── /performance-bulk — Bulk performance uploads
│   └── /webhook — HR system webhooks (e.g., from DocuSeal)
│
├── /executive/* — Executive-specific analytics
│   ├── /costs — Executive cost config (salary, subscriptions, dialer)
│   ├── /pnl — Profit & Loss aggregates
│   └── /roster — Hiring pipeline + team analytics
│
├── /docuseal/* — Contract signing integration
│   ├── /send-contract — Create DocuSeal submission + send email
│   ├── /send-attestation — Attestation letter generation
│   ├── /check-status — Poll DocuSeal submission status
│   └── /webhook — DocuSeal completion callbacks
│
├── /pitch-points/* — Employee rewards system
│   ├── /balance — Get agent Pitch Points balance
│   ├── /leaderboard — Team rankings
│   ├── /transactions — Transaction history
│   ├── /redeem — Redemption submission
│   ├── /store — Rewards catalog
│   ├── /admin/* — Admin adjustments + rules
│   ├── /manager/* — Manager team view
│   └── /cron/* — Automated point accrual (SLA, QA, attendance)
│
├── /slack/* — Slack event/interaction webhooks
│   ├── /events — Slack event subscriptions (message, user_change, etc.)
│   ├── /interactions — Button clicks, modal submissions
│   ├── /attendance-events — Attendance request workflow
│   ├── /send-dm — Send Slack DM to user
│   ├── /reconcile — Sync Slack user list to employee_directory
│   └── /backfill-names — Infer missing names from Slack profiles
│
├── /education/* — Onboarding course management
│   ├── /progress — Course completion tracking
│   └── /certificate — Certificate PDF generation
│
├── /email/* — Email delivery
│   └── /send — Send email (via Resend or Google SMTP)
│
├── /user/* — User profile
│   └── /profile — Get/update user profile
│
├── /upload/* — File uploads
│   ├── /avatar — Avatar image upload to Supabase Storage
│   └── (via S3 for DialedIn/QA files)
│
├── /onboarding/* — Onboarding workflows
│   ├── /progress — Fetch checklist progress
│   ├── /bulk-invite — Invite multiple employees
│   └── /access-toggle — Enable/disable agent portal
│
├── /fx-rate — Currency conversion (CAD → USD live rate)
├── /health — Vercel health check endpoint
├── /n8n-proxy — n8n API pass-through (rate-limited)
└── /debug/* — Development/debugging tools
    └── /processing-jobs — n8n pipeline job status
```

### API Response Patterns

**Success Response:**
```json
{
  "success": true,
  "data": { /* ... */ }
}
```

**Error Response:**
```json
{
  "error": "Human-readable error message",
  "status": 400
}
```

**Cron Job Response:**
```json
{
  "success": true,
  "results": {
    "processed": 1234,
    "errors": ["Row 5: Missing phone number"],
    "timestamp": "2026-03-05T12:00:00Z"
  }
}
```

---

## Data Flow

### User Authentication Flow

```
1. Firebase Client (login page)
   ↓ (sign in with email/password or Google OAuth)
2. Firebase Auth returns UID
   ↓ (POST /api/auth/login with UID + email)
3. Backend Supabase Sync
   a. Look up user by firebase_uid in `users` table
   b. If not found, check `employee_directory` by email (smart enrollment)
   c. Map directory role (Owner → executive, HR → hr, etc.)
   d. Create user record with role + avatar
   e. Return {user, redirectTo} to client
4. Frontend Router
   ↓ (redirect based on response)
5. AuthProvider Updates
   ↓ (stores user + profile in context)
6. Protected Layout Checks
   - Enforces role-based route access
   - Verifies portal_access for agents
```

### DialedIn Ingestion (Daily Cron)

```
1. IMAP Ingestion (cron job in Docker container)
   ↓ (fetch daily XLS emails from reports@pitchperfectsolutions.net)
2. XLS Parser (dialedin-parser.ts)
   ↓ (parse 12 report types: Agent Summary, Agent Analysis, Subcampaign Summary, etc.)
3. Data Extraction
   ├─ Agent performance metrics (TPH, AHT, SLA, cost)
   ├─ Campaign-level metrics
   ├─ Pause breakdowns
   └─ Raw performance snapshots
4. Deduplication (delete_existing node in DB)
   ↓ (triple-key: agent_name + phone + call_date + call_time)
5. Supabase INSERT
   ├─ dialedin_agent_performance (daily agent metrics)
   ├─ dialedin_daily_kpis (team-level aggregates)
   ├─ dialedin_reports (raw upload tracking)
   └─ dialedin_agent_snapshots (intraday 6-hourly snapshots)
6. KPI Computation (dialedin-kpi.ts)
   ↓ (compute adjusted TPH, cost, break-even, new-hire exclusions)
7. Intraday Snapshots (dialedin-intraday cron)
   ↓ (1:30 PM ET, sync latest agent activity to snapshots table for live dashboard)
```

### DialedIn Revenue Computation

```
Daily performance + campaign revenue rates
↓
adjustedTph = transfers / ((loggedIn - pause - wrap + 30) / 60)
↓
dailyRevenue = adjustedTph × (revenue_rate: $10.50 ACA or $7.00 Medicare)
↓
monthlyRevenue = SUM(dailyRevenue)
↓
labourCost = hours × avg_wage (from employee_directory)
↓
netRevenue = monthlyRevenue - labourCost
```

### Slack Event Sync (Daily Cron)

```
1. Slack API calls
   ├─ Get all workspace members (users.list)
   ├─ Get campaign channel members (conversations.members)
   └─ Get user profiles (users.info per user, batched)
2. Directory Reconciliation
   ├─ Match by email (case-insensitive)
   ├─ Match by name (fuzzy: Levenshtein distance < 2)
   ├─ Create new employees (with Slack UID + email + timezone)
   ├─ Update campaign assignments (from campaign channels)
   └─ Reactivate terminated agents if re-hired
3. Photo Backfill
   ├─ Download Slack avatars from CDN
   └─ Upload to Supabase Storage (employee_documents bucket)
4. Pitch Health Exclusion
   └─ Check against pitch-health-blocklist.json (115 names)
```

### QA Pipeline (n8n Orchestration)

```
1. Audio Upload
   ↓ (POST /api/qa/upload-recording with agent_name, phone, call_date)
2. Format Validation
   ├─ Detect mono vs stereo (ffprobe)
   ├─ Trim to 10 minutes max
   └─ Convert to WAV
3. Transcription (WhisperX via Replicate)
   ↓ (async: webhook callback to n8n)
4. Merge Transcript (v5.13 normalization)
   ├─ Correct WhisperX errors (e.g., "recorded mind" → "recorded line")
   ├─ Assign channels (Ch0=Agent, Ch1=Customer, auto-swap detection)
   └─ Apply speaker diarization for mono calls
5. AI Analysis (3 parallel agents: ACA, Medicare, WhatIF)
   ├─ Extract metadata (product type, disposition, DNC status)
   ├─ Auto-Fail detection (12 codes: AF-01 through AF-12)
   ├─ Language assessment (tone, clarity, empathy)
   ├─ Compliance scoring
   └─ Return JSON with confidence levels + reasoning
6. Extract JSON (v9.1 3-tier parsing)
   ├─ Tier 1: Brace counting
   ├─ Tier 2: Mechanical repair
   └─ Tier 3: AI-assisted (DeepSeek via OpenRouter)
7. Confidence Gating (v2.2)
   ├─ Validate AI output (7 layers)
   ├─ Classify AFs: HIGH (≥80, score=0), MEDIUM (40-79, review), LOW (<40, warning)
   ├─ Second-pass AI for MEDIUM tiers (DeepSeek V3)
   └─ Promote/demote based on second pass
8. Store Payload (v7.10 tiered confidence)
   ├─ HIGH-tier AFs: score = 0 (auto-fail triggered)
   ├─ MEDIUM-tier AFs: preserve score + flag for review + tag='manual_review'
   └─ LOW-tier AFs: warning only
   ↓ (INSERT qa_results + qa_auto_fails + qa_language_assessments)
9. Disposition Sync (to HR)
   ├─ Sync compliance_score to employee_directory.qa_score (SLA penalty)
   └─ Trigger Slack notifications for failures
```

### Onboarding Portal Flow (New Hires)

```
1. HR invites employee (bulk or manual)
   ↓ (creates employee_directory record + generates invitation token)
2. Email sent to new hire
   ↓ (verification link: /onboarding?token=...)
3. New hire lands on portal
   ├─ Verifies token + email
   └─ Shown country-specific checklist (USA vs Canada items)
4. Checklist Completion
   ├─ Employment contract (DocuSeal submission)
   ├─ Onboarding materials (PDF upload to employee_documents)
   ├─ Resume (PDF upload)
   ├─ Photo ID (PDF upload)
   ├─ SSN/SIN (encrypted upload)
   ├─ Direct deposit / void cheque (upload)
   ├─ Zoom training (attendance link)
   ├─ First supervised call (timestamp)
   ├─ Portal training (module completion)
   ├─ Slack setup (manual confirmation)
   ├─ Payworks integration (pending phase 1)
   └─ Country-specific items (USA: SSN + direct deposit, Canada: SIN + void cheque)
5. All items complete
   ├─ Record completion timestamp
   └─ Enable agent portal access (portal_access = true)
6. New hire accesses /agent portal
   ├─ Pitch Points dashboard
   ├─ Education courses
   └─ Performance analytics
```

---

## Key Abstractions & Shared Utilities

### Context Providers (Global State)

| Provider | Purpose | Location |
|----------|---------|----------|
| `AuthContext` | User identity + role | `src/context/AuthContext.tsx` (47 lines) |
| `QAContext` | QA dashboard filters | `src/context/QAContext.tsx` (22 lines) |
| `VoiceContext` | ElevenLabs speech synthesis | `src/context/VoiceContext.tsx` (37 lines) |
| `ExecutiveFilterContext` | Date range + metric filters | `src/context/ExecutiveFilterContext.tsx` (144 lines) |

### Supabase Clients

| Client | Auth Level | Location | Use Case |
|--------|-----------|----------|----------|
| `supabaseAdmin` | Service Role Key | `src/lib/supabase-admin.ts` (18 lines) | Server-side API routes, cron jobs, admin operations |
| `supabaseClient` | User Auth Token | `src/lib/supabase-client.ts` (15 lines) | Client-side queries (real-time subscriptions) |
| `supabase` | Auto-detect | `src/lib/supabase.ts` (8 lines) | Universal export (server-safe) |

### Utility Modules (500+ lines each)

| Module | Purpose | Lines | Key Exports |
|--------|---------|-------|------------|
| `dialedin-kpi.ts` | DialedIn metrics computation | 1,062 | `computeAgentPerformance()`, `computeTeamKPIs()`, `getBreakAllowanceMin()`, `getBreakEvenTPH()` |
| `dialedin-parser.ts` | XLS parsing + column mapping | 617 | `parseDialedInReport()`, `deduplicatePerformance()` |
| `dialedin-store.ts` | DialedIn data persistence | 428 | `storePerformanceData()`, `syncIntraday()` |
| `qa-utils.ts` | QA scoring + compliance logic | 413 | `computeComplianceScore()`, `mapAutoFailCodes()`, `validateAutoFails()` |
| `pitch-points-utils.ts` | Rewards accrual logic | 317 | `calculatePointsEarned()`, `applyRedemption()` |
| `retreaver-ingest.ts` | Retreaver revenue sync | 680 | `syncRetreaveriFromCSV()`, `enrichWithPhoneData()` |
| `hr-utils.ts` | HR roster deduplication | 427 | `deduplicateEmployees()`, `matchNames()`, `formatScheduleKey()` |

### Config Files

| File | Purpose | Location |
|------|---------|----------|
| `campaign-config.ts` | Campaign-to-manager mapping | `src/lib/campaign-config.ts` |
| `slack-config.ts` | Slack channel IDs + workspace config | `src/lib/slack-config.ts` |
| `pitch-health-blocklist.json` | Pitch Health agent names to exclude | `scripts/pitch-health-blocklist.json` |

### UI Component Library

**Base UI Components** (`src/components/ui/`): 23 components
- Button, Card, Checkbox, Dialog, Dropdown, Input, Label, etc. (Radix UI + Tailwind)

**Feature Components** by domain:
- `components/dialedin/` — KPI cards, agent tables, heatmaps, revenue widgets
- `components/hr/` — Roster, schedule, onboarding checklist, attendance
- `components/qa/` — Transcript viewer, auto-fail markers, compliance score
- `components/pitch-points/` — Leaderboard, store, redemption form
- `components/layout/` — Navigation, sidebars, headers
- `components/roster/` — Hiring pipeline, team org chart

---

## Authentication Flow (Detailed)

### Login → Profile Sync

1. **Client** (Firebase Auth)
   ```
   user clicks Google OAuth or Email/Password login
   → Firebase returns UID, email, photoUrl
   ```

2. **Backend** (POST /api/auth/login)
   ```
   check users table by firebase_uid

   if not found:
       try to match by email (case-insensitive)
       if not found:
           look up employee_directory by email
           extract role (Owner→executive, HR→hr, QA→qa, etc.)

   create user record with directory role + avatar
   → return {user, redirectTo} based on profile_completed + portal_access
   ```

3. **Frontend** (AuthProvider + Protected Layout)
   ```
   useAuth() hook fetches current user from /api/user/profile
   ProtectedLayout enforces:
   - role-based route access (e.g., /hr for hr role only)
   - portal_access check for agents (redirect to /onboarding/complete if blocked)
   - admin override (miki@pitchperfectsolutions.net can access any route)

   redirect to /{role} if profile_completed=true
   else redirect to /onboarding
   ```

### API Route Authentication

**Public Routes:**
- `/login`, `/signup`, `/onboarding`, `/qa` (if QA_ONLY mode)

**Cron Routes** (Bearer token required):
```typescript
const authHeader = request.headers.get('Authorization');
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**User Routes** (Supabase middleware):
```typescript
// Client-side queries use user's session token (via @supabase/supabase-js)
// Server-side queries use service role key (supabaseAdmin)
```

---

## Entry Points

### Client Entry Points

1. **Root Layout** (`src/app/layout.tsx`, 47 lines)
   - Configures fonts, metadata
   - Wraps with AuthProvider + VoiceProvider
   - Forces dynamic rendering (avoid SSG issues)

2. **Protected Layout** (`src/app/(protected)/layout.tsx`, 94 lines)
   - Enforces authentication + role checks
   - Redirects to /login if not authenticated
   - Wraps with QAProvider for QA routes

3. **Role-Specific Layouts** (e.g., `/hr/layout.tsx`)
   - Define navigation + sidebars per section
   - Set breadcrumbs, role-specific UI elements

### Server Entry Points

1. **Middleware** (`src/middleware.ts`, 48 lines)
   - QA Lockdown mode (NEXT_PUBLIC_QA_ONLY=true)
   - Redirects to /qa if locked, blocks other routes
   - Allows API routes + static files

2. **Cron Routes** (daily automated tasks)
   - `/api/cron/slack-sync` — 11 AM UTC
   - `/api/cron/dialedin-ingest` — After report delivery (9 PM ET)
   - `/api/cron/dialedin-intraday` — 1:30 PM ET
   - `/api/cron/retreaver-ingest` — 9 PM ET
   - `/api/cron/sync-health` — Every 2 hours

3. **Webhook Routes** (real-time callbacks)
   - `/api/slack/events` — Slack message/user changes
   - `/api/dialedin/webhook/events` — DialedIn agent activity
   - `/api/docuseal/webhook` — Contract signing completion
   - `/api/hr/webhook` — HR system callbacks

---

## Key Architectural Patterns

### 1. **Service Layer Pattern**
- Utility modules (dialedin-kpi.ts, qa-utils.ts) compute domain logic
- API routes call service functions, return JSON
- Decouples business logic from HTTP handlers

### 2. **Three-Tier Deployment**
- **Vercel (Next.js):** Web app + API routes (stateless)
- **Docker containers:** IMAP ingestion, n8n cron jobs (state + long-running tasks)
- **Supabase:** Database + Storage (persistent state)

### 3. **Real-Time + Batch Patterns**
- **Real-time:** DialedIn webhook → agent activity → live dashboard (10s latency)
- **Batch:** DialedIn daily report → cron ingestion → KPI aggregation (delay: end-of-day)
- **Hybrid:** Intraday snapshots bridge the gap (6-hourly sync)

### 4. **Deduplication Pattern**
- **DialedIn:** Triple-key (agent_name + phone + call_date + call_time)
- **Slack:** Email match + fuzzy name match + Slack UID
- **QA Results:** (agent_name + phone + call_date) unique constraint in DB

### 5. **Confidence Tiering (QA)**
- **HIGH (≥80):** Auto-fail triggered, compliance score = 0
- **MEDIUM (40-79):** Flag for manual review, preserve score
- **LOW (<40):** Warning only, no impact on compliance
- Second-pass AI on MEDIUM tier for confirmation

### 6. **Currency Conversion**
- Live rate fetching: CAD → USD via `open.er-api.com`
- 24-hour cache (to avoid rate limits)
- Fallback rate: 0.72
- Applied at map-build time in P&L routes

### 7. **Time-Series Data Strategy**
- **Daily snapshots** (`dialedin_agent_performance`) for historical analysis
- **Hourly aggregates** (`dialedin_daily_kpis`) for trend charts
- **Intraday snapshots** (6-hourly `dialedin_agent_snapshots`) for live dashboard
- **Pagination** (1000 rows/page) prevents Supabase silent caps

---

## Error Handling & Resilience

### API Error Responses
- **400 Bad Request:** Invalid input (missing required fields)
- **401 Unauthorized:** Missing/invalid CRON_SECRET or auth token
- **404 Not Found:** Resource doesn't exist
- **500 Internal Server Error:** DB or service failure
- All errors logged to console + Vercel error tracking

### Data Validation
- `zod` schemas on API inputs
- Supabase constraint enforcement (unique, not null, etc.)
- HTML template validation (DocuSeal signatures)

### Retry Logic
- **Cron jobs:** No automatic retry (manual re-trigger via Vercel dashboard)
- **Slack API:** Exponential backoff on rate limits
- **n8n pipeline:** Built-in retry nodes per step
- **Supabase queries:** Connection pooling + automatic reconnection

### Health Checks
- `/api/health` — Vercel liveness probe
- `/api/cron/sync-health` — HR sheets + DialedIn freshness (sends alert email if stale >36 hours on weekdays)

---

## Performance Considerations

### Optimization Strategies

1. **Query Optimization**
   - `.range()` pagination (1000 rows/page) for large tables
   - `.select()` specific columns, not `*`
   - `.maybeSingle()` for nullable lookups (avoids 406 error)

2. **Caching**
   - New hire set: 5-minute cache in Redis/memory
   - DialedIn cache layer: Daily KPI aggregation caching
   - FX rate: 24-hour cache

3. **Component Optimization**
   - Recharts for large datasets (optimized rendering)
   - Virtual scrolling for long agent lists
   - Suspense boundaries for async pages

4. **Build Optimization**
   - `output: 'standalone'` in next.config.ts (reduces image size)
   - `typescript.ignoreBuildErrors: true` (allows type errors to not block deploy)
   - Server components by default, client components only where needed

---

## Summary: Data Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SYSTEMS                              │
├──────────────────┬──────────────────┬──────────────────────────┤
│ Slack API        │ DialedIn IMAP    │ Retreaver Webhooks       │
│ Firebase Auth    │ n8n Orchestration│ Google Sheets API        │
│ DocuSeal         │ Google SMTP      │ Replicate (WhisperX)     │
└──────────────────┴──────────────────┴──────────────────────────┘
                              ↓
                    ┌─────────────────┐
                    │  API Routes     │
                    │ (42+ endpoints) │
                    └─────────────────┘
                              ↓
                    ┌─────────────────────────┐
                    │  Service Layer Utils    │
                    │ (dialedin-kpi, qa, etc)│
                    └─────────────────────────┘
                              ↓
                    ┌─────────────────────────┐
                    │  Supabase Database      │
                    │ (25+ tables)            │
                    └─────────────────────────┘
                              ↓
                    ┌─────────────────────────┐
                    │  Frontend Components    │
                    │ (React + Recharts)      │
                    └─────────────────────────┘
```

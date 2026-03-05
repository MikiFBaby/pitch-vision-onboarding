# External Integrations - Pitch Vision Web

## Database & Data Storage

### Supabase (PostgreSQL + Auth + Storage)
- **Client**: @supabase/supabase-js 2.89.0
- **Endpoints**:
  - URL: `https://eyrxkirpubylgkkvcrlh.supabase.co`
  - Anon Key: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Service Role Key: `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- **Usage**:
  - Authentication (custom user registration, invite verification)
  - PostgreSQL database (all business logic tables)
  - Row-Level Security (RLS) policies for multi-tenant data isolation
  - Realtime subscriptions (live agent status, intraday updates)
  - PostgREST API (REST access to tables)
- **Key Tables** (121+ migrations):
  - `employee_directory` (agents, HR staff)
  - `dialedin_agent_performance` (daily KPI data, paginated 1000/page)
  - `dialedin_reports` (campaign metrics, file receipts)
  - `qa_results` (QA pipeline outputs, compliance scores, auto-fail status)
  - `employee_documents` (onboarding contracts, photo IDs, SINs)
  - `attendance_events` (shift events, breaks, absences)
  - `pitch_points_*` (leaderboard, transactions, store items)
  - `automation_logs` (audit trail for HR sheets sync)
  - `processing_jobs` (async job tracking)
  - `executive_cost_config` (salary, dialer cost, subscription tracking)
- **Storage Buckets**:
  - `employee_documents` (signed contracts, photo IDs, payroll docs)

### Firebase (Authentication + Storage)
- **Config**:
  - Project ID: `pitchvision-444b0`
  - API Key: `NEXT_PUBLIC_FIREBASE_API_KEY`
  - Auth Domain: `pitchvision-444b0.firebaseapp.com`
  - Storage Bucket: `pitchvision-444b0.firebasestorage.app`
- **Usage**: Alternate auth/storage (some agents use Firebase login)
- **Not primary** — Supabase is main database

## Authentication & User Management

### Supabase Auth
- **Signup**: `POST /api/auth/signup` (custom registration form)
- **Login**: `POST /api/auth/login`
- **Invitation Flow**: `POST /api/auth/verify-invitation` (invite tokens)
- **Completion**: `POST /api/auth/complete-registration`
- **Session Management**: JWT tokens, refresh tokens

### Firebase Auth
- **Fallback auth** for agents, secondary system
- **Used for**: Storage access, some agent portal features

## Email & Communication

### SMTP (Google Workspace)
- **Provider**: Google Workspace (Google Workspace account)
- **Host**: `smtp.gmail.com:465` (SSL)
- **Account**: `reports@pitchperfectsolutions.net` (App Password auth)
- **Usage**:
  - Invitation emails
  - HR notifications
  - Attendance alerts
  - Digest emails
- **Routes**: `POST /api/email/*` (custom email service)

### Resend (Transactional Email)
- **API Key**: `RESEND_API_KEY`
- **From Email**: `RESEND_FROM_EMAIL` (Pitch Vision HR <hr@pitchvision.io>)
- **Usage**: Alternative/backup email delivery (higher deliverability)
- **Import**: `import { Resend } from 'resend'`

## Digital Document Signing

### DocuSeal (HTML-based Contract Signing)
- **URL**: `https://api.docuseal.com`
- **API Key**: `DOCUSEAL_API_KEY`
- **Workflow**:
  1. `POST /templates/html` → Upload HTML template
  2. `POST /submissions` → Send contract to signer
  3. Webhook → Receive signed status (`sent`, `opened`, `signed`, `declined`)
- **Usage**:
  - Employment contracts (country-specific: USA/Canada)
  - Attestation forms
  - Onboarding checklists
- **Routes**:
  - `POST /api/docuseal/send-contract` (generate + send contract)
  - `POST /api/docuseal/send-attestation`
  - `GET /api/docuseal/check-status`
  - `POST /api/docuseal/webhook` (status callbacks)
- **HTML Elements**: `<signature-field>`, `<text-field>`, `<date-field>` required in templates

## Slack Integration

### Slack Bot (Multiple Workspaces & Tokens)

#### Primary Bot (Hires/Terminations)
- **Bot Token**: `SLACK_BOT_TOKEN` (set in env)
- **Signing Secret**: `SLACK_SIGNING_SECRET`
- **Hires Channel**: `SLACK_HIRES_CHANNEL_ID` (C031F6MCS9W) → `#important-managers-announcements-only`
- **Usage**: Post new hire/termination announcements
- **Routes**:
  - `POST /api/slack/events` (Events API webhook, signature verification)
  - `POST /api/slack/interactions` (Button/select interactions)
  - `POST /api/slack/send-dm` (Direct messages)

#### Attendance Bot (Separate App)
- **Bot Token**: `SLACK_ATTENDANCE_BOT_TOKEN`
- **Signing Secret**: `SLACK_ATTENDANCE_SIGNING_SECRET`
- **Authorized Users**: `SLACK_ATTENDANCE_AUTHORIZED_USERS` (U0A7PFWU83A)
- **Usage**: Shift tracking, attendance updates, break management
- **Routes**:
  - `POST /api/slack/attendance-events`
  - `POST /api/slack/attendance-interactions`
  - `POST /api/slack/attendance-process`

#### Onboarding Bot (Third App)
- **Bot Token**: `SLACK_ONBOARDING_BOT_TOKEN`
- **Channel**: `SLACK_ONBOARDING_CHANNEL_ID` (C0AGDHZTLJD)
- **Usage**: Onboarding portal updates, contract signing status

#### Campaign Channels (Team Segregation)
- **Channel IDs** (8 campaigns):
  - Medicare: C0A896J4JEM
  - ACA: C07A07ANCAG
  - Medicare WhatIF: C06CDFV4ECR
  - Home Care Michigan: C0A3AH1K56E
  - Home Care PA: C09JRPT6HME
  - Hospital: C0AE4E14S8M
  - Pitch Meals: C0AEWM51U90
  - Home Care New York: (additional, not listed in enum)
- **Manager**: C0AEWM51U90 (alternative for some operations)

### Slack Event Verification
- **x-slack-signature** + **x-slack-request-timestamp** validation
- **Signature Algorithm**: HMAC-SHA256 with signing secret
- **Retry Handling**: Ignores `x-slack-retry-num` retries

## DialedIn (Call Center Analytics Platform)

### DialedIn Portal API (Web Scraping via Playwright)
- **User**: `DIALEDIN_PORTAL_USER` (reports@pitchperfectsolutions.net)
- **Password**: `DIALEDIN_PORTAL_PASS`
- **Usage**: Auto-scrape daily/real-time reports from web dashboard
- **Routes**:
  - `POST /api/dialedin/ingest` (IMAP + CSV parse + Supabase insert)
  - `POST /api/dialedin/webhook` (Chase Data Corp real-time webhook)

### DialedIn Webhook (Real-Time Updates)
- **Webhook Secret**: `DIALEDIN_WEBHOOK_SECRET` (38c6842c-cdae-4005-85a8-97d3364d8519)
- **Payload**: Agent metrics, status, KPIs (real-time)
- **Routes**:
  - `POST /api/dialedin/webhook` (main ingest)
  - `POST /api/dialedin/webhook/events` (event stream)
  - `POST /api/dialedin/webhook/retry` (retry logic)

### DialedIn Ingest API (Outbound)
- **API Key**: `DIALEDIN_INGEST_API_KEY` (8d2a62d1580f33e32c70e0c6baa22d8ac8a5a0b14ba9870...)
- **Usage**: Send data back to DialedIn (optional)
- **Authentication**: API key in Authorization header

### ETL Pipeline
- **Trigger**: `POST /api/cron/dialedin-ingest` (cron job, daily)
- **Process**:
  1. IMAP fetch from reports@pitchperfectsolutions.net
  2. Parse XLS reports (12 report types)
  3. Extract metrics (TPH, cost, revenue, SLA)
  4. Compute KPIs, break allowances, FX conversions (CAD→USD)
  5. Dedup + insert into `dialedin_agent_performance`, `dialedin_reports`
  6. Trigger `computeAgentPerformance()` for dashboards

## Retreaver (Call Revenue Platform)

### Retreaver S3 Upload Webhook
- **API Key**: `REATREVER_API_KEY` (fb38eab1ae65795e9826f102206583b957cf3f5bae0977f650...)
- **Route**: `POST /api/reatrever/upload` (webhook from Retreaver ping)
- **Payload**: Phone, revenue, campaign, state (sparse)

### Retreaver IMAP Ingestion
- **User**: `RETREAVER_IMAP_USER` (miki@pitchperfectsolutions.net)
- **Password**: `RETREAVER_IMAP_PASS` (App Password)
- **Email Labels**: Monitored for daily CSV exports
- **Trigger**: `POST /api/cron/retreaver-ingest` (9 PM ET, daily, 3-day lookback)
- **Process**:
  1. IMAP fetch detailed CSVs (102+ columns)
  2. Match to pings via multi-signal (phone + timestamp + campaign)
  3. Store in `retreaver_events` table
  4. Enrich with agent_name (only in detailed CSVs, not pings)

### S3 Bucket for Retreaver
- **Bucket**: `reatrever-data` (typo intentional)
- **Region**: `AWS_REGION` (us-east-1)
- **Access**: AWS SDK credentials ([REDACTED])
- **Usage**: Archive + backfill historical Retreaver calls

### Retreaver Revenue API
- **Routes**:
  - `GET /api/retreaver/revenue` (period aggregation)
  - `GET /api/retreaver/live` (today's ticker, 10s polling)
  - `POST /api/retreaver/sync` (S3 CSV sync + backfill)

## n8n (Workflow Automation / QA Pipeline)

### n8n Instance
- **URL**: `https://n8n.pitchvision.io`
- **API Key**: `N8N_API_KEY` (JWT token)
- **Hosted**: Self-hosted on EC2 alongside Pitch Vision

### QA Pipeline (Orchestrated Workflows)
- **Main Orchestrator** (pXsXeajgkUU4tRnY): Routes calls through QA workflows
- **Audio Processing** (9wipkyWPDvqnRhXO): WhisperX transcription, mono detection
- **Submit Transcription** (H72pFXMslQAzi4rI): Format transcript, normalization
- **AI Analysis** (AhPORSIrn7Ygyadn): 3 AI agents (ACA/Medicare/WhatIF)
- **Error Handler** (6KYZ8iIlZa0J35bt): Failure recovery
- **Webhook Receiver** (oSeZ4uL50OeP4yPo): Incoming call trigger

### QA Integrations Within n8n
- **WhisperX** (Replicate API): Async transcription with webhook callback
- **OpenRouter**: DeepSeek V3 for confidence gate, language assessment
- **DeepSeek V3**: Via OpenRouter for 2nd-pass AF validation
- **Supabase**: Insert `qa_results`, update compliance scores

### Deployment Wrapper
- **Script**: `scripts/n8n-deploy.py`
- **Features**:
  - Pre-deploy syntax validation (Node.js --check)
  - Auto-snapshot to `.n8n-snapshots/`
  - Post-deploy verification + auto-rollback

### API Proxy Route
- `POST /api/n8n-proxy` (client-side call submission to n8n)

## AI Language Models

### Google Gemini (Generative AI)
- **API Key**: `GEMINI_API_KEY`
- **Libraries**: `@google/generative-ai` 0.24.1, `@google/genai` 1.34.0
- **Usage**: Text analysis, compliance scoring (fallback)

### OpenRouter (AI Model Aggregator)
- **API Key**: `OPENROUTER_API_KEY` (sk-or-v1-...)
- **Models**:
  - DeepSeek V3 (`deepseek/deepseek-chat-v3-0324`) — QA confidence gate
  - Multiple other models available (OpenAI-compatible)
- **Usage**: QA pipeline AI agents, confidence validation

### ElevenLabs (Voice Generation)
- **API Key**: `ELEVENLABS_API_KEY`
- **Agent ID**: `ELEVENLABS_AGENT_ID` (for voice avatar)
- **Component**: @elevenlabs/react 0.13.0
- **Usage**: Voice training agent, agent education portals

## AWS S3 (Object Storage)

### Credentials
- **Access Key**: `AWS_ACCESS_KEY_ID` ([REDACTED])
- **Secret Key**: `AWS_SECRET_ACCESS_KEY`
- **Region**: `AWS_REGION` (us-east-1)
- **SDK**: @aws-sdk/client-s3 3.993.0

### Buckets
- **reatrever-data**: Retreaver call archives, CSV backfill
- **Usage**: `S3Client` with `ListObjectsV2Command`, `GetObjectCommand`, `PutObjectCommand`

## Google Services

### Google Workspace SMTP
- **Host**: smtp.gmail.com:465 (SSL)
- **User**: reports@pitchperfectsolutions.net
- **Auth**: App Password (2FA enabled)
- **Library**: nodemailer 7.0.12

### Google Sheets Webhook
- **URL**: `GOOGLE_SHEETS_WEBHOOK_URL` (Apps Script macro)
- **Usage**: HR sheets sync trigger (when pasted/imported/edited)
- **Direction**: Google Sheets → Supabase (V3 enhanced script)

### Google Gemini API
- **Alternative AI**: Used for compliance analysis

## Webhooks (Inbound)

### Slack Events API
- **Path**: `POST /api/slack/events`
- **Signature**: HMAC-SHA256 (x-slack-signature + x-slack-request-timestamp)
- **Events**: member_joined_channel, app_mention, etc.

### Slack Interactions
- **Path**: `POST /api/slack/interactions`
- **Payload**: Button clicks, select menu choices, modals

### DialedIn Real-Time Webhook
- **Path**: `POST /api/dialedin/webhook`
- **Secret**: DIALEDIN_WEBHOOK_SECRET (header/body validation)
- **Payload**: Agent metrics (TPH, SLA, cost, etc.)

### Retreaver Ping Webhook
- **Path**: `POST /api/reatrever/upload`
- **Payload**: Call info (phone, revenue, campaign, state)

### DocuSeal Status Webhook
- **Path**: `POST /api/docuseal/webhook`
- **Payload**: Contract status (sent, opened, signed, declined)

### Google Sheets Webhook (Outbound from Apps Script)
- **Target**: Custom endpoint (two-way sync)

### n8n Workflow Callbacks
- **Path**: Webhook URLs embedded in n8n nodes
- **Usage**: WhisperX async completion, workflow status updates

## Cron Jobs (Background Tasks)

### Cron Service
- **Docker Container**: `Dockerfile.cron` (separate service)
- **Dependency**: Requires main app to be healthy
- **Triggering**: n8n scheduled workflows + Vercel cron routes

### Routes (via HTTP POST with CRON_SECRET header)
- `POST /api/cron/dialedin-ingest` → DialedIn ETL (daily, auto-scrape + parse)
- `POST /api/cron/retreaver-ingest` → Retreaver CSV fetch (9 PM ET daily)
- `POST /api/cron/slack-sync` → Directory audit + Slack member sync
- `POST /api/cron/directory-audit` → Active agent validation
- `POST /api/cron/sam-alerts` → SAM threshold violations
- `POST /api/cron/sam-weekly-digest` → Weekly QA digest
- `POST /api/cron/sync-health` → Health check (HR + DialedIn freshness)
- `POST /api/health` → Liveness probe (Docker healthcheck)

### Secret Verification
- **Header**: `CRON_SECRET` (c69fb96691f916d02e09e723d71002e1c90b70157c8f7e93cfc3f74c05eab8c9)
- **Prevents**: Unauthorized cron invocations

## Attendance & Shift Management

### Attendance Webhook (Google Workspace)
- **URL**: `GOOGLE_SHEETS_WEBHOOK_URL` (also triggers for attendance)
- **Payload**: Attendance events (break start/end, shift out, late arrival)
- **Processing**: `POST /api/slack/attendance-process`

### Teams (Microsoft Teams)
- **Webhook**: `TEAMS_ATTENDANCE_WEBHOOK_URL` (optional, not currently used)
- **Status**: Placeholder for future Microsoft integration

## External Verification

### IMAP (Email Ingestion)
- **Library**: imapflow 1.2.10
- **Parser**: mailparser 3.9.3
- **Usage**:
  - Retreaver report CSVs from Gmail
  - DialedIn auto-ingest backups
- **Credentials**: Stored in env vars (IMAP_USER + IMAP_PASS)

## FX Rate (Currency Conversion)

### Open Exchange Rates API
- **URL**: https://open.er-api.com
- **Purpose**: CAD → USD conversion (for Canadian agent wages)
- **Route**: `GET /api/fx-rate`
- **Caching**: 24-hour client-side cache

## Configuration Management

### Vercel OIDC Token
- **Purpose**: Secure deployment authentication
- **Token**: `VERCEL_OIDC_TOKEN` (JWT with scope/ownership metadata)
- **Usage**: CI/CD, automated deployments

### Environment Files
- **.env.local** (development) — All secrets, local overrides
- **.env.production** (production) — Vercel deployment, Docker containers
- **.env.production.template** (reference) — Required vars documented

## Summary by Integration Type

| Type | Count | Key Examples |
|------|-------|--------------|
| **Databases** | 2 | Supabase (primary), Firebase (secondary) |
| **Communication** | 2 | SMTP (Google), Resend (transactional) |
| **Call Center** | 2 | DialedIn, Retreaver |
| **Signing** | 1 | DocuSeal |
| **Collaboration** | 1 | Slack (3 bot apps) |
| **Workflow** | 1 | n8n |
| **AI/LLM** | 3 | Gemini, OpenRouter, ElevenLabs |
| **Storage** | 2 | Supabase Storage, AWS S3 |
| **Email** | 2 | SMTP, Resend |
| **Google** | 3 | Sheets, Workspace, Gemini |
| **Total Routes** | 121+ | Covering auth, HR, QA, DialedIn, Slack, etc. |

## Architecture Notes
- **Multi-tenant**: Supabase RLS policies isolate agent/manager/HR data
- **Real-time**: Supabase subscriptions + n8n webhooks enable live updates
- **Async Processing**: n8n workflows + Vercel cron for heavy ETL
- **Error Handling**: Retry logic on webhook failures, auto-rollback on deploy
- **Security**: API key validation, signature verification, OIDC tokens

# Sam Bot — Operational Readiness Checklist

## Status Legend
- [ ] Not done
- [x] Done

---

## 1. Environment Variables (Vercel Dashboard)

These must be set in **Vercel → Project Settings → Environment Variables** (not just `.env.local`).

### Critical — Bot Won't Function Without These
- [x] `SLACK_ATTENDANCE_BOT_TOKEN` — Sam's bot OAuth token
- [x] `SLACK_ATTENDANCE_SIGNING_SECRET` — Sam's Slack app signing secret
- [x] `ATTENDANCE_WEBHOOK_SECRET` — Shared secret (dispatcher → processor → Google Sheets)
- [x] `OPENROUTER_API_KEY` — AI intent classification + attendance parsing
- [x] `GOOGLE_SHEETS_WEBHOOK_URL` — Google Apps Script web app deployment URL

### Critical — Features Broken Without These
- [ ] `ATTENDANCE_DRY_RUN` — **Currently `true`**. Must be set to `false` (or removed) for attendance to actually write to Google Sheets. While `true`, confirm buttons say "dry run" and nothing is saved.
- [ ] `SLACK_ATTENDANCE_CHANNEL_ID` — **Currently empty**. Set to the Slack channel ID where attendance summaries should post (e.g., `#hr-attendance`). Without this, confirm/undo summaries and the weekly digest have nowhere to post.
- [ ] `CRON_SECRET` — **Not set**. Required for cron endpoints (NCNS alerts + weekly digest) to work in production. Generate a random string (e.g., `openssl rand -hex 32`) and set in both Vercel env vars and Vercel project settings. Vercel automatically sends `Authorization: Bearer {CRON_SECRET}` to cron endpoints.
- [ ] `SLACK_ATTENDANCE_AUTHORIZED_USERS` — **Currently only `U0A7PFWU83A`** (Miki). Add Slack user IDs of all HR managers/team leads who should use Sam, comma-separated. This also determines who receives NCNS alert DMs from the cron.

### Optional — Nice to Have
- [ ] `TEAMS_ATTENDANCE_WEBHOOK_URL` — **Currently empty**. If the team uses Microsoft Teams, set this to an Incoming Webhook URL for the Teams attendance channel. Attendance summaries and the weekly digest will mirror there. Silently skipped if empty.

---

## 2. Slack App Configuration

These must be configured in the **Slack API Dashboard** (api.slack.com → Your Apps → Sam Attendance app).

### OAuth Scopes (Bot Token Scopes)
Verify Sam has ALL of these scopes. If any are missing, add them and reinstall the app to the workspace.

- [x] `chat:write` — Post messages (DM replies, channel summaries)
- [x] `im:history` — Read DM history (receive DMs)
- [x] `im:write` — Open DM conversations
- [x] `im:read` — Read DM metadata
- [x] `channels:read` — List channels, get channel info
- [x] `channels:manage` — Kick/invite users, join channels
- [x] `channels:history` — Read channel messages
- [x] `users:read` — Fetch user profiles
- [x] `users:read.email` — Fetch user email addresses
- [ ] `channels:join` — **MISSING**. Required for Sam to self-join public channels before kicking users. Without this, channel management (`remove X from channel`, `bulk cleanup`) fails with `channel_not_found`. Add this scope and reinstall the app.

### Event Subscriptions
- [x] **Enable Events**: ON
- [x] **Request URL**: `https://www.pitchvision.io/api/slack/attendance-events`
- [x] **Subscribe to bot events**: `message.im`

### Interactivity & Shortcuts
- [x] **Interactivity**: ON
- [x] **Request URL**: `https://www.pitchvision.io/api/slack/attendance-interactions`

### App Home
- [ ] **Home Tab**: Optional but recommended. Currently not implemented.
- [x] **Messages Tab**: Must be enabled (allows DMs to the bot)

### Manual Setup
- [ ] **Add Sam to channels**: Go to `#important-managers-announcements-only` → Integrations → Add Apps → Add "Sam Attendance". This is a **manual one-time step** needed because Sam is missing `channels:join` scope. Once the scope is added, Sam can self-join.

---

## 3. Google Sheets Setup

### Apps Script Deployment
- [x] `attendance-writer-dopost.js` script deployed as web app
- [x] Spreadsheet ID `1kHR-j7RsxiyUyL952It1vCEDaTyYxtnsEOSKsRZv7kg` configured in script
- [x] Webhook secret stored in Script Properties (matches `ATTENDANCE_WEBHOOK_SECRET`)

### Sheet Tabs Required
- [x] `"Non Booked Days Off "` tab exists (note trailing space — legacy naming)
- [ ] `"Attendance Events"` tab exists with correct columns. Verify this tab has headers: `Agent Name | Event Type | Date | Minutes | Reason | Shift Start | Campaign | Reported By | Reported At`. If missing, the Apps Script will fail silently on lates/early leaves/no-shows.
- [x] `"Booked Days Off"` tab exists (read-only by Sam, written by HR)
- [x] `"Agent Schedule"` tab exists (read-only by Sam, synced from HR sheets)

---

## 4. Supabase Database

### Tables Required
- [x] `employee_directory` — Core employee data
- [x] `attendance_pending_confirmations` — Staging table for confirm/cancel flow
- [x] `"Booked Days Off"` — Synced from Google Sheets
- [x] `"Non Booked Days Off"` — Synced from Google Sheets
- [x] `"Attendance Events"` — Synced from Google Sheets (requires sync script to include this tab)
- [x] `"Agent Schedule"` — Synced from Google Sheets
- [x] `"HR Hired"` — Campaign enrichment (synced)
- [x] `onboarding_new_hires` — For onboarding status queries
- [x] `onboarding_checklist_items` — For onboarding status queries
- [x] `onboarding_progress` — For onboarding status queries
- [x] `QA Results` — For QA score lookups

### Sync Script
- [ ] Verify `scripts/sheets-to-supabase-sync.js` (Google Apps Script) includes `"Attendance Events"` in its sync list. If this table isn't synced, Sam will be reading stale data for "who's out" and "attendance history" queries.

---

## 5. Vercel Configuration

### Cron Jobs
- [x] `vercel.json` has `sam-alerts` cron (`0 14 * * 1-5`)
- [x] `vercel.json` has `sam-weekly-digest` cron (`0 13 * * 1`)
- [ ] Verify crons are visible in Vercel dashboard (Settings → Crons) after deploy. May require Vercel Pro plan for cron jobs.

### Deployment
- [x] All files committed and pushed
- [ ] Verify Vercel deployment succeeded without build errors
- [ ] Verify environment variables are set in Vercel (not just `.env.local`)

---

## 6. Testing Checklist

Test each feature by DMing Sam directly in Slack:

### Core Attendance (Existing — Should Still Work)
- [ ] `Sarah called out sick today` → Parses, shows confirmation, writes to Sheets on confirm
- [ ] `John was 15 min late` → Same flow
- [ ] `NCNS for David Brown` → Same flow
- [ ] `undo` → Finds last confirmed entry, offers undo
- [ ] Confirm expiry → Wait 30+ min, buttons should show expired

### New Features
- [ ] `who is Sarah?` → Shows employee profile (name, role, status, campaign, country, email, phone, hire date)
- [ ] `who's out today?` → Lists all absences from all 3 tables, grouped by type
- [ ] `who's out tomorrow?` → Same, for tomorrow
- [ ] `attendance for Sarah this week` → Chronological list of events
- [ ] `who's working today?` → Agents grouped by shift time
- [ ] `what's Sarah's schedule?` → Mon-Sun grid with today marker
- [ ] `Sarah's QA score?` → Latest score, auto-fail status, avg of last 5
- [ ] `John's onboarding?` → Progress bar, pending items
- [ ] `remove all terminated employees` → Preview list with confirm/cancel buttons
- [ ] `update John's phone to 555-1234` → Confirms update with old → new value
- [ ] `who can cover for Sarah tomorrow?` → OFF agents, same-campaign first
- [ ] `help` → Full feature list by category
- [ ] `hey Sam!` → Friendly greeting response
- [ ] `what's the weather?` → Polite redirect to `help`

### Channel Management (Requires `channels:join` scope + channel membership)
- [ ] `remove John Smith from the channel` → Finds user, kicks them
- [ ] `add John Smith to the channel` → Explains Slack ID requirement

### Cron Jobs (Test Manually First)
- [ ] Hit `/api/cron/sam-alerts` with `Authorization: Bearer {CRON_SECRET}` → Should DM authorized users with unreported agents list (or "all accounted for")
- [ ] Hit `/api/cron/sam-weekly-digest` with `Authorization: Bearer {CRON_SECRET}` → Should post summary to attendance channel

---

## 7. Priority Action Items (Sorted by Impact)

### P0 — Must Fix Before Go-Live
1. **Set `ATTENDANCE_DRY_RUN=false`** in Vercel env vars (currently `true` — nothing writes to Sheets)
2. **Set `SLACK_ATTENDANCE_CHANNEL_ID`** — Create or pick an HR attendance channel, copy its ID
3. **Set `CRON_SECRET`** in Vercel — Run `openssl rand -hex 32`, set in Vercel env vars
4. **Add `channels:join` scope** to Sam's Slack app, reinstall to workspace
5. **Add Sam to `#important-managers-announcements-only`** via Slack UI (until scope is added)

### P1 — Should Fix Soon
6. **Add more authorized users** to `SLACK_ATTENDANCE_AUTHORIZED_USERS` — all HR managers who will use Sam
7. **Verify `"Attendance Events"` sheet tab** exists in the HR Tracker spreadsheet with correct headers
8. **Verify Supabase sync** includes `"Attendance Events"` table
9. **Verify Vercel crons** appear in dashboard

### P2 — Nice to Have
10. **Set `TEAMS_ATTENDANCE_WEBHOOK_URL`** if Teams mirroring is desired
11. **Create Slack App Home tab** with feature documentation
12. **Add Sam bot to more channels** if channel management should work across multiple channels

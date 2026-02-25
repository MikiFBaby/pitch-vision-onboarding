# Sam Bot — Standard Operating Procedure (SOP)

## For HR Managers & Team Leads

---

## What is Sam?

Sam is Pitch Perfect's Slack-based HR assistant. You interact with Sam by sending **direct messages** (DMs) in Slack. Sam understands natural language — just type what you need like you're talking to a coworker.

Sam can:
- Track attendance (absences, lates, early leaves, no-shows)
- Look up employee information
- Check schedules and find coverage
- View QA scores and onboarding progress
- Manage Slack channel membership
- Update employee directory entries
- Send you daily NCNS alerts and weekly attendance digests

---

## How to Start

1. Open Slack
2. In the sidebar, find **Sam Attendance** under Apps (or search "Sam Attendance")
3. Click to open a DM
4. Type your message naturally

Sam responds only to **authorized users**. If Sam says you're not authorized, contact IT to have your Slack user ID added.

---

## Feature Guide

### 1. Report Attendance

Tell Sam about absences, lates, early leaves, or no-shows in plain language.

**Examples:**
| What you type | What Sam does |
|---|---|
| `Sarah called out sick today` | Records Sarah as absent today with reason "sick" |
| `John was 15 min late` | Records John as 15 min late today |
| `Mike left early — doctor appointment` | Records Mike as early leave with reason |
| `NCNS for David Brown` | Records David as no-call no-show |
| `Sarah and John both called out sick` | Records both in one message |
| `Maria was absent yesterday` | Records Maria absent for yesterday's date |

**What happens next:**
1. Sam shows you a confirmation card with the parsed events
2. Review the details (names, dates, event types)
3. Click **Confirm** to save, or **Cancel** to discard
4. Once confirmed, the entry is written to the HR Tracker spreadsheet
5. A summary is posted to the HR attendance channel

**Tips:**
- You can report multiple people in one message
- Sam understands "today", "yesterday", "tomorrow", and specific dates
- If Sam gets a name wrong, cancel and try again with the full name
- For unusual spellings, use the exact name from the employee directory

### 2. Undo an Entry

If you made a mistake, undo within 15 minutes:

| What you type | What Sam does |
|---|---|
| `undo` | Shows your last confirmed entry with an Undo button |
| `undo last` | Same |

Click **Undo** to remove the entry from the spreadsheet. This can only undo the most recent confirmed entry within 15 minutes.

### 3. Who's Out?

Check who's absent on any given day.

| What you type | What Sam does |
|---|---|
| `who's out today?` | Shows everyone absent/late/off today |
| `who's out tomorrow?` | Shows who's out tomorrow |
| `who's off on 2026-02-20?` | Shows absences for a specific date |

**Sam checks 3 sources:**
- Booked Days Off (PTO/vacation)
- Unplanned Absences (sick, personal)
- Attendance Events (lates, early leaves, no-shows)

Results are grouped by type with counts.

### 4. Attendance History

View an individual's attendance record over a time period.

| What you type | What Sam does |
|---|---|
| `attendance for Sarah this week` | Shows Sarah's events this week |
| `John's absences this month` | Shows John's events this month |
| `how has Mike's attendance been?` | Defaults to this week |

Shows a chronological timeline with dates, event types, and reasons.

### 5. Employee Lookup

Look up employee information from the directory.

| What you type | What Sam does |
|---|---|
| `who is Sarah?` | Shows Sarah's profile |
| `look up John Smith` | Shows full employee details |
| `tell me about Mike` | Same |

**Information shown:** Name, status (Active/Terminated/Pending), role, campaign, country, email, phone, hire date, Slack link.

### 6. Schedule Lookup

Check who's working or view individual schedules.

| What you type | What Sam does |
|---|---|
| `who's working today?` | Lists all agents on shift today, grouped by shift time |
| `who's working tomorrow?` | Same for tomorrow |
| `what's Sarah's schedule?` | Shows Sarah's full Mon-Sun weekly schedule |

The "who's working" view only includes Active Agents with a matching schedule entry.

### 7. Coverage Finder

When someone calls out, find who can cover.

| What you type | What Sam does |
|---|---|
| `who can cover for Sarah?` | Agents who are OFF today |
| `who can cover for Sarah tomorrow?` | Agents who are OFF tomorrow |
| `Sarah called out — who's available?` | Same |

**Results are prioritized:**
1. Same campaign agents (shown first with a star)
2. Other campaign agents (shown with their campaign name)

### 8. QA Score Lookup

Check an agent's latest QA evaluation results.

| What you type | What Sam does |
|---|---|
| `Sarah's QA score?` | Latest QA results |
| `how did John do on QA?` | Same |
| `QA results for Mike` | Same |

**Information shown:** Latest compliance score (out of 100), auto-fail status, call date, product type, summary, and average score over last 5 evaluations.

### 9. Onboarding Status

Check a new hire's onboarding progress.

| What you type | What Sam does |
|---|---|
| `how's John's onboarding?` | Shows progress with checklist |
| `onboarding status for Sarah` | Same |

**Information shown:** Progress bar (percentage), overall status, contract status, start date, and list of pending checklist items.

### 10. Channel Management

Manage the `#important-managers-announcements-only` Slack channel.

| What you type | What Sam does |
|---|---|
| `remove John Smith from the channel` | Finds and removes the user |
| `kick THE GRINCH` | Same (case-insensitive name matching) |
| `remove all terminated employees` | Shows a preview list with Confirm/Cancel |

**Bulk cleanup:** Sam cross-references the channel members against the employee directory. Terminated employees still in the channel are listed. Click **Remove All** to kick them all at once, or **Cancel** to abort.

### 11. Directory Updates

Update basic employee information.

| What you type | What Sam does |
|---|---|
| `update John's phone to 555-1234` | Updates phone number |
| `change Sarah's email to sarah@new.com` | Updates email |
| `update Mike's campaign to Medicare` | Updates campaign |

**Fields you can update:** phone, email, campaign, country, role

Sam shows the old value → new value for verification.

### 12. Help

| What you type | What Sam does |
|---|---|
| `help` | Shows all available commands with examples |
| `what can you do?` | Same |

---

## Automated Alerts

### NCNS Alert (Daily at 2 PM ET, Weekdays)

Sam automatically checks for agents who are scheduled to work but have no attendance record (no absence reported, no PTO). If any are found, Sam DMs all authorized HR managers with a list of unreported agents.

**What to do when you receive an NCNS alert:**
1. Review the list of unreported agents
2. Check if they're actually at work (they may just not have any issues)
3. For any true NCNS, report it to Sam: `NCNS for [Agent Name]`

### Weekly Digest (Monday at 1 PM ET)

Every Monday, Sam posts a weekly attendance summary to the HR attendance channel. Includes:
- Total absences, lates, early leaves, no-shows for the previous week
- Daily breakdown
- Top absentees
- Posted to both Slack and Teams (if configured)

---

## Tips & Best Practices

### Naming
- Use the employee's **full name** when possible: `Sarah Jones called out sick`
- Sam fuzzy-matches names, but full names are more reliable
- If Sam can't find someone, try their name exactly as it appears in the employee directory

### Timing
- **Attendance confirmations expire after 30 minutes.** If you see a confirmation card that's old, send the message again.
- **Undo is available for 15 minutes** after confirming. After that, you'll need to manually edit the spreadsheet.
- Report attendance events as they happen — don't batch them for end of day.

### Multiple Events
- You can report multiple people in one message: `Sarah and John both called out. Mike was 15 min late.`
- Sam will parse all events and show them together in one confirmation.

### Dates
- Sam understands: `today`, `yesterday`, `tomorrow`, specific dates like `February 20` or `2026-02-20`
- If you don't mention a date, Sam assumes **today**

### What Sam Can't Do
- Sam cannot change schedules — that's managed in the HR Tracker spreadsheet
- Sam cannot approve PTO — booked days off come from the spreadsheet
- Sam cannot access payroll data
- Sam cannot send messages to other people on your behalf
- Sam cannot modify past entries older than 15 minutes — edit the spreadsheet directly

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Sam says "you're not authorized" | Your Slack ID isn't in the authorized list | Contact IT to add your Slack user ID |
| Sam says "I couldn't find anyone named X" | Name doesn't match employee directory | Use full first + last name as it appears in the directory |
| Confirmation card says "dry run" | `ATTENDANCE_DRY_RUN` is enabled | Contact IT to set `ATTENDANCE_DRY_RUN=false` in Vercel |
| Channel management says "channel_not_found" | Sam isn't in the channel or missing scope | Have a Slack admin add Sam to the channel manually |
| Sam doesn't respond at all | Bot might be down or event subscription issue | Check that Sam Attendance app is installed and the Events URL is correct |
| Undo says "no entries found" | More than 15 minutes passed, or no confirmed entries | Edit the spreadsheet manually |
| Schedule shows "no schedule found" | Agent's name format differs between directory and schedule sheet | Name mismatch — about 120 employees have this issue |
| QA shows "no results found" | Agent hasn't been evaluated yet | Wait for their next QA evaluation |

---

## Quick Reference Card

| Task | What to Type |
|---|---|
| Report absence | `Sarah called out sick today` |
| Report late | `John was 15 min late` |
| Report NCNS | `NCNS for David Brown` |
| Report early leave | `Mike left early — doctor appointment` |
| Undo last entry | `undo` |
| Who's absent today | `who's out today?` |
| Attendance history | `attendance for Sarah this week` |
| Look up employee | `who is Sarah?` |
| Who's on shift | `who's working today?` |
| View schedule | `what's Sarah's schedule?` |
| Find coverage | `who can cover for Sarah tomorrow?` |
| QA results | `Sarah's QA score?` |
| Onboarding progress | `John's onboarding status?` |
| Remove from channel | `remove John Smith from the channel` |
| Bulk cleanup | `remove all terminated employees` |
| Update directory | `update John's phone to 555-1234` |
| See all commands | `help` |

# Pitch Vision Web - Technical Debt & Concerns

## Summary
This document catalogs technical debt, security concerns, performance issues, and fragile areas across the Pitch Vision codebase. The codebase is mature and functional, but contains several areas that should be addressed for reliability, maintainability, and security.

---

## CRITICAL CONCERNS

### 1. Placeholder & Mock Environment Variables (SECURITY RISK)

**Files Affected:**
- `/src/lib/supabase.ts` (lines 3-4)
- `/src/lib/supabase-client.ts` (lines 3-4)
- `/src/lib/supabase-admin.ts` (lines 3-4)
- `/src/lib/firebase.ts` (lines 6-11)

**Issue:**
Multiple core libraries use fallback placeholder/mock values for critical configuration:
```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "mock_key",
  // ... more mock values
}
```

**Risk:**
- If environment variables are missing during build or runtime, the app silently uses placeholders
- Service role key fallback ('placeholder') could allow unauthorized access if ever passed to Supabase
- Firebase will fail silently with mock credentials, creating hard-to-debug issues
- Build-safe fallbacks are present but not comprehensive enough

**Remediation:**
- Add explicit startup checks that fail fast if critical env vars are missing
- Remove placeholder values; use proper error messages instead
- Never allow service role keys to have fallback values (this is critical)
- Add a boot-time validation function that runs before any API calls

**Related Memory:**
Memory notes safety fallbacks were added in Feb 2026 commits, but placeholder values remain risky.

---

### 2. `.single()` Calls Without Proper Error Handling

**Files Affected:**
- `/src/app/api/auth/login/route.ts` (lines 44, 118)
- `/src/app/api/user/profile/route.ts` (line 42)
- `/src/app/api/auth/verify-invitation/route.ts` (line 17)
- `/src/app/api/auth/complete-registration/route.ts` (lines 17, 38)
- `/src/app/api/auth/signup/route.ts` (lines 17, 89)
- `/src/app/api/executive/costs/route.ts` (lines 40, 58)

**Issue:**
```typescript
const { data: invitation, error: invError } = await supabaseAdmin
  .from('invitations')
  .select()
  .single(); // Throws 406 if 0 rows, 409 if 2+ rows
```

The memory recommends `.maybeSingle()` for lookups that might return 0 rows, but multiple auth routes still use `.single()` which throws errors on:
- **0 rows:** HTTP 406 PGRST116 error
- **2+ rows:** HTTP 409 PGRST121 error

These errors surface to clients as 500 Internal Server Errors if not caught.

**Risk:**
- Race conditions during sign-up could trigger 409 errors
- Missing invitation tokens return 406 instead of user-friendly 404
- Unhandled errors cascade to clients with generic 500 messages
- Auth flows may fail silently

**Remediation:**
- Replace `.single()` with `.maybeSingle()` for all read operations
- Add explicit error checking for both 0 and multiple row cases
- Return proper HTTP status codes (400/404) with user-friendly messages

---

### 3. Missing Email System Implementation

**File:** `/src/app/api/admin/invite-employee/route.ts` (line 39)

**Issue:**
```typescript
// 3. Send invitation email (TODO: Switch to Resend)
// const emailResult = await sendInvitationEmail(email, token, role, firstName);
console.log(`Mock Invite Sent to ${email} with token ${token}`);

const emailResult = { success: true, error: null };
```

The invitation email flow is **completely mocked**. No invitations are actually sent. The TODO comment suggests switching to Resend, but the integration is incomplete.

**Risk:**
- New employees don't receive invitation links, blocking onboarding
- Security tokens are generated but never delivered
- Invitations appear successful but fail silently
- Manual token sharing is required as a workaround

**Remediation:**
- Implement Resend email service (already in package.json)
- Or use SMTP fallback (available in Aura chat route)
- Add retry logic for failed sends
- Log all sent invitations for audit trail

**Related:** SMTP configuration exists in `/src/app/api/qa/aura-chat/route.ts` but not reused for invitations.

---

### 4. Incomplete SMS Integration

**File:** `/src/app/api/qa/aura-chat/route.ts` (lines 143-146)

**Issue:**
```typescript
async function sendSMS(to: string, message: string) {
    // TODO: Integrate Twilio or similar
    console.log(`[Aura SMS] Sending to ${to}: ${message}`);
    return { success: true, simulated: true, message: "SMS queued for delivery" };
}
```

SMS is completely unimplemented despite being called from the Aura chat system.

**Risk:**
- Notifications to users appear to succeed but are never sent
- Users miss critical alerts and chat updates
- Simulated responses hide the missing integration

**Remediation:**
- Implement Twilio (or chosen SMS provider)
- Add proper error handling and retry logic
- Log SMS state separately from successful responses
- Consider rate limiting to avoid SMS spam

---

## HIGH-PRIORITY CONCERNS

### 5. Pagination Issues in Large Data Fetches

**File:** `/src/app/api/dialedin/intraday/route.ts` (lines 363-382)

**Issue:**
The intraday endpoint correctly implements pagination with `.range()`:
```typescript
const PAGE_SIZE = 1000;
let offset = 0;
let hasMore = true;

while (hasMore) {
  const { data: page } = await supabaseAdmin
    .from('dialedin_intraday_snapshots')
    .select(trendCols)
    .range(offset, offset + PAGE_SIZE - 1);

  if (!page || page.length === 0) break;
  allTrendRows.push(...page);
  hasMore = page.length === PAGE_SIZE;
  offset += PAGE_SIZE;
}
```

**But:** Other routes may not implement this correctly:

**Files to Audit:**
- `/src/app/api/executive/pnl/route.ts` - Handles performance data but pagination not visible in excerpt
- `/src/utils/slack-attendance.ts` (line 591) - Uses `.limit(2000)` which may hit Supabase cap
- Various DialedIn routes that fetch agent data

**Risk:**
- Silent data truncation when query results > 1000 rows
- Incomplete P&L reports showing ~9% of actual labor costs (as noted in memory)
- Dashboard metrics underreporting team performance
- Month-end reports missing 30-50% of actual activity

**Remediation:**
- Audit all `supabaseAdmin.from()` queries for pagination
- Implement `.range()` pagination consistently
- Add assertions to verify row counts match expectations
- Log warnings when truncation is detected

---

### 6. AWS S3 Credentials in Client Code

**File:** `/src/app/api/retreaver/sync/route.ts` (lines 9-15)

**Issue:**
```typescript
const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});
```

AWS credentials are stored as environment variables without encryption. While this is server-side only (good), the empty-string fallback (`|| ''`) is problematic.

**Risk:**
- Empty credentials silently fail instead of throwing clear errors
- No validation that credentials are actually set
- If env vars leak, S3 bucket is fully compromised
- Credentials rotation is manual and error-prone

**Remediation:**
- Remove empty-string fallbacks; fail fast if env vars missing
- Consider using IAM roles instead of long-lived credentials
- Implement credential rotation strategy
- Add audit logging for all S3 operations
- Use S3 bucket policies to restrict access (least privilege)

---

### 7. Unvalidated JSON Parsing

**Files Affected:**
- `/src/hooks/useGeminiLive.ts` (lines 229-231)
- `/src/utils/slack-attendance.ts` (lines 216, 948)

**Issue:**
```typescript
if (event.data instanceof Blob) {
    data = JSON.parse(await event.data.text());
} else {
    data = JSON.parse(event.data);  // Unsafe parse
}
```

Direct `JSON.parse()` without try-catch can crash if data is malformed.

**Risk:**
- Malformed WebSocket messages crash the entire hook
- Malicious payloads can DoS the client
- Browser console fills with unhandled errors
- User interface becomes unresponsive

**Remediation:**
- Wrap all `JSON.parse()` in try-catch
- Add validation schemas (zod, yup) for parsed data
- Log parse errors for debugging
- Implement graceful fallbacks

---

## MEDIUM-PRIORITY CONCERNS

### 8. Type Safety: Excessive Use of `any`

**File:** `/src/lib/hr-utils.ts` (multiple instances)

**Issue:**
```typescript
export function calculateWeeklyHours(agent: Record<string, any>, includeWeekends: boolean = false): number
export function isFullTime(agent: Record<string, any>): boolean
export function deduplicateRows<T = any>(rows: T[], keyFn: (row: T) => string): T[]
export function deduplicateFired(rows: any[]): any[]
```

Heavy use of `any` type in critical HR utilities removes TypeScript safety.

**Risk:**
- Misspelled property names cause silent failures
- Type narrowing is impossible
- Refactoring breaks silently
- IDE intellisense is useless

**Remediation:**
- Define proper interfaces for HR row types (Agent, FiredEmployee, BookedDayOff, etc.)
- Use `Record<string, unknown>` instead of `Record<string, any>`
- Add runtime validation with zod or similar
- Enable `strict: true` in tsconfig.json

---

### 9. Hardcoded Magic Numbers

**Files Affected:**
- `/src/app/api/dialedin/intraday/route.ts` (lines 29-30): `FULL_BREAK_ALLOWANCE_MIN = 69.6`, `BREAK_ALLOWANCE_RATIO = 0.145`
- `/src/utils/dialedin-kpi.ts`: Similar magic numbers (based on memory)
- `/src/app/api/slack-attendance.ts` (line 591): `.limit(2000)`
- `/src/app/api/qa/aura-chat/route.ts` (line 118): `.limit(100)`

**Issue:**
Magic numbers are scattered across multiple files, making it hard to update business logic consistently.

**Example:**
```typescript
const FULL_BREAK_ALLOWANCE_MIN = 69.6; // 1.16 hours hardcoded
const BREAK_ALLOWANCE_RATIO = 0.145;    // 14.5% of logged-in time

// Same logic likely duplicated elsewhere
```

**Risk:**
- Changing break allowance calculations requires updating 3+ files
- Inconsistent formulas across services
- Memory shows this was recently fixed (Jan 2026) but scattered duplication remains
- Environment-variable overrides not everywhere

**Remediation:**
- Create `/src/utils/constants.ts` with all business logic constants
- Export as `BREAK_ALLOWANCE_CONFIG`, `PAGINATION_PAGE_SIZE`, etc.
- Use env var overrides for production configuration
- Document rationale (e.g., why 69.6 minutes, why 14.5%)

---

### 10. Missing Input Validation on API Routes

**Files Affected:**
- `/src/app/api/retreaver/sync/route.ts`: No validation of S3 response structure
- `/src/app/api/admin/invite-employee/route.ts`: Minimal email validation
- `/src/app/api/cron/` routes: No authentication/authorization checks

**Issue:**
Most API routes trust incoming data without schema validation.

```typescript
export async function POST(req: Request) {
    try {
        const { email, role, firstName, lastName, teamId } = await req.json();

        if (!email || !role || !firstName || !lastName) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }
        // No validation: email format, role enum, etc.
    } catch (error) {
        // Generic error handling
    }
}
```

**Risk:**
- Invalid data silently accepted (e.g., invalid email format)
- CSV parsing may accept malformed rows
- Cron endpoints are publicly accessible (no auth check)
- SQL injection via poorly sanitized inputs

**Remediation:**
- Implement request validation schema (zod)
- Add environment-based route authentication
- Validate all CSV/JSON structure before processing
- Add rate limiting to cron endpoints
- Log all invalid requests for security auditing

---

### 11. Error Handling Gaps

**Files Affected:**
- `/src/app/api/retreaver/sync/route.ts` (lines 271-273): Promise.all with no error aggregation
- `/src/app/api/slack/events/route.ts`: Likely missing signature verification error handling
- `/src/app/api/cron/dialedin-ingest/route.ts`: Missing transaction rollback logic

**Issue:**
Error handling is inconsistent across routes:
```typescript
await Promise.all(
  batch.map(async (file) => {
    try {
      // ... file processing
    } catch {
      errors++;
    }
  })
);
```

This catches errors but doesn't distinguish types or retry.

**Risk:**
- Transient errors aren't retried
- Permanent errors aren't escalated
- Partial failures go unnoticed
- No correlation IDs for debugging

**Remediation:**
- Implement proper error classification (transient vs. permanent)
- Add exponential backoff retry logic for transient errors
- Log error context with correlation IDs
- Send alerts for permanent failures
- Implement circuit breaker for external service calls

---

### 12. Missing Slack Signature Verification

**File:** `/src/app/api/slack/events/route.ts` - Verify implementation

**Issue:**
The memory mentions Slack Events API signature verification with `x-slack-signature` + `x-slack-request-timestamp`, but implementation should be audited.

**Risk:**
- Man-in-the-middle attacks possible if signature verification is weak
- Replay attacks if timestamp validation missing
- Unauthorized commands executed

**Remediation:**
- Verify implementation uses `SLACK_SIGNING_SECRET`
- Check timestamp is within 5 minutes (prevent replay)
- Use constant-time comparison for signature
- Reject malformed requests early

---

## PERFORMANCE CONCERNS

### 13. Inefficient Data Processing

**File:** `/src/app/api/dialedin/intraday/route.ts` (lines 128-165)

**Issue:**
Team inference loop for null-team agents is O(n*m) complexity:
```typescript
for (const emp of empCampaigns) {
  // ... build campaignLookup
}

for (const row of nullTeamAgents) {
  const key = row.agent_name.toLowerCase().trim();
  const inferred = campaignLookup.get(key);  // Map lookup is O(1), but loop is O(n)
  if (inferred) {
    (row as { team: string | null }).team = inferred;
  }
}
```

This is actually okay (Map lookups are O(1)), but there's repeated string manipulation.

**Real Issue:**
Multiple passes over data to filter, aggregate, and transform:
```typescript
const allAgents = latestRows
  .filter((r) => r.hours_worked > 0 || r.transfers > 0)
  .map((r) => { ... })
  .sort((a, b) => b.adjusted_sla_hr - a.adjusted_sla_hr);

if (includeRank) {
  allAgents.forEach((a, i) => { a.rank = i + 1; });  // Second pass
}

// ... later, more filtering and aggregation
```

**Risk:**
- With 1000+ agents, multiple passes add latency
- Memory usage for intermediate arrays
- Not observable performance impact yet, but scales poorly

**Remediation:**
- Combine filter/map/sort in single pass where possible
- Use object pools for repeated calculations
- Add request timeout to prevent slow queries
- Consider pagination in the API response

---

### 14. Timezone Handling is Fragile

**File:** `/src/app/api/dialedin/intraday/route.ts` (lines 406-408, 431-432)

**Issue:**
```typescript
const etHour = parseInt(
  new Date(time).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }),
);
```

Using `toLocaleString()` for timezone conversion is slow and locale-dependent. Should use date library.

**Risk:**
- Hardcoded timezone (what if user is in different region?)
- Slow operation repeated in loops
- Browser/Node.js timezone database inconsistency
- DST transitions may cause off-by-one errors

**Remediation:**
- Use `date-fns` library (already in package.json)
- Store all timestamps in UTC
- Convert timezone at display layer only
- Add timezone parameter to API

---

## SECURITY CONCERNS

### 15. Exposed Sensitive Information in Logs

**Files Affected:**
Multiple routes log request/response data without sanitization.

**Risk:**
- API keys logged when errors occur
- Password reset tokens in console.log
- User email addresses exposed in error messages
- S3 file paths reveal bucket structure

**Remediation:**
- Create safe logging utility that masks sensitive fields
- Use structured logging (Winston, Pino)
- Never log raw request bodies
- Implement log redaction rules

---

### 16. Environment Variable Exposure

**Issue:**
Multiple places access `process.env` without checking if they're in browser context:
- Some components may be calling API routes that expose env vars

**Risk:**
- NEXT_PUBLIC_* vars are visible to clients (intended)
- But if secret vars accidentally prefixed NEXT_PUBLIC_, they leak
- No mechanism to prevent this mistake

**Remediation:**
- Use `server-only` package (already in dependencies) consistently
- Add linting rules to prevent env var leaks
- Audit all server-side files for client-side env access

---

## FRAGILE PATTERNS

### 17. Brittle CSV/XLS Parsing

**File:** `/src/utils/dialedin-parser.ts` (referenced in memory)

**Issue:**
Memory mentions DialedIn export has shifted columns requiring workarounds:
```
SubcampaignSummary column shift: DialedIn export has extra "S-L-A Rate Value" column at position 0 that shifts all headers by 1.
```

**Risk:**
- Vendor changes column order → parser breaks silently
- Different export formats cause incorrect data mapping
- Deleted columns leave gaps in data
- Hard to debug data quality issues

**Remediation:**
- Use column name mapping instead of positional indices
- Add schema validation before parsing
- Implement change detection to alert on format changes
- Add sample row inspection tool

---

### 18. Tightly Coupled Components

**File:** `/src/components/hr/onboarding/AddNewHireModal.tsx` & `/src/app/(protected)/executive/page.tsx`

**Issue:**
Components directly import and use utilities, API routes, and database queries. Changes to shared logic break multiple components.

**Example:**
```typescript
import { deduplicateFired, deduplicateHired, deduplicateBookedOff } from '@/lib/hr-utils';
```

10+ HR components import these same utilities, so any change requires coordination.

**Risk:**
- Feature changes require updating multiple components
- Testing one component requires mocking many dependencies
- Code reuse is high but fragility is also high
- Refactoring is risky

**Remediation:**
- Introduce service layer between utilities and components
- Use dependency injection or context for shared logic
- Add integration tests that verify all consumers still work
- Create adapter layers for data transformation

---

## DOCUMENTATION GAPS

### 19. Complex Business Logic Not Documented

**Files Affected:**
- Break allowance calculation (69.6 min, 14.5% ratio)
- SLA/hour adjusted formula (logged_in - wrap - pause + break_allowance)
- Transfer detection patterns (50 patterns for initiation, 40 for LA intro)
- Auto-fail confidence tiers (HIGH ≥80, MEDIUM 40-79, LOW <40)

**Risk:**
- Future maintainers don't understand why values exist
- Changes break subtle dependencies
- Rationale lost when original author leaves

**Remediation:**
- Add comments explaining the "why" for magic numbers
- Create `.planning/business-logic.md` documenting key formulas
- Link to external documentation (requirements, specs)
- Include examples with expected values

---

## DEPENDENCY RISKS

### 20. Outdated/Pinned Versions

**File:** `/package.json`

**Issue:**
Most dependencies use `^` (caret) allowing minor/patch updates, but some are pinned:
```json
"next": "16.1.0",
"react": "19.2.3",
"typescript": "^5"
```

Next.js and React are pinned; TypeScript is loose. This creates inconsistency.

**Risk:**
- Next.js patches may contain critical security fixes but require manual update
- React patches break with pinned version
- TypeScript loose version may introduce breaking changes
- Transitive dependency vulnerabilities

**Remediation:**
- Move to consistent versioning strategy
- Use `npm audit` regularly
- Implement dependabot or renovate for automated updates
- Pin major versions only, allow minor/patch flexibility

---

## MISSING FEATURES / INCOMPLETE WORK

### 21. Payworks Integration Pending

**Status:** Discovery phase (as per memory)

**Issue:**
Integration is partially stubbed but not complete:
- Checklist items defined (12 total)
- No actual API route (`POST /api/payworks/create-employee`)
- `payworks_employee_id` column not yet added to schema
- Data mapping logic exists but not integrated

**Risk:**
- Onboarding portal shows payroll UI but doesn't actually sync
- Users think payroll is configured when it isn't
- Data in onboarding portal is lost (not sent to Payworks)

**Remediation:**
- Complete the integration per phases in memory
- Add feature flag to hide incomplete UI
- Create integration tests before enabling
- Document Payworks API requirements

---

### 22. QA Pipeline Complexity (High, but Well-Documented)

**Status:** Mature but fragile

The QA pipeline has significant complexity with 12+ AF codes, 3 AI agents, confidence tiers, and numerous edge cases.

**Memory Documents:** Full architecture in `qa-pipeline-architecture.md`

**Concerns:**
- 40+ n8n snapshots for rollback (Feb-Mar 2026)
- Confidence tier system v2.2 recently added (Mar 2026)
- Multiple prompt iterations suggest iterative fixes rather than upfront design
- Edge cases discovered and patched rather than designed upfront

**Remediation:**
- Continue current snapshot/rollback strategy
- Add automated regression tests for known edge cases
- Document decision rationale in commit messages
- Consider v3.0 redesign once current system stabilizes

---

## KNOWN WORKAROUNDS & HACKS

### 23. DialedIn Date Mapping Offset

**File:** Multiple DialedIn routes

**Memory:**
```
DialedIn date mapping (CRITICAL): dialedin_agent_performance.report_date
= extractDateRange(filename).end = the **file/delivery date**, NOT the work date.
The actual work date = date_range_start = report_date - 1 day.
```

**Concern:**
This offset exists due to a past bug and is now baked into all queries. If removed, all DialedIn analytics will shift by 1 day.

**Risk:**
- Permanent dependency on this offset
- Future developers don't understand why it exists
- Migration to new data source will be complex

**Remediation:**
- Document this as a critical constant
- Consider deprecating in favor of proper UTC timestamps
- Add test case that verifies offset is consistent

---

### 24. Pitch Health Department Filter

**Files:** Multiple routes filtering by `'pitch health' in team.lower()`

**Memory:**
```
Pitch Health - Medicare is a separate department — NEVER add their agents to employee_directory
Blocklist: scripts/pitch-health-blocklist.json — 115 names (updated Mar 2026)
```

**Concern:**
Multiple filtering strategies scattered across codebase:
- Team name contains check
- Blocklist JSON file
- Excluded from sync logic

**Risk:**
- Inconsistent filters across services
- New code forgets to filter
- Blocklist goes out of sync

**Remediation:**
- Create utility function `isPitchHealthAgent(name, team)`
- Use consistently across all routes
- Sync blocklist from authoritative source

---

## TESTING & QA GAPS

### 25. No Automated Integration Tests

**Concern:**
Large codebases with 100+ API routes likely lack integration test coverage.

**Risk:**
- Breaking changes propagate silently
- Regressions discovered by users
- Deployment confidence is low

**Remediation:**
- Add integration tests for critical flows (auth, onboarding, sync)
- Use `jest` + `@testing-library` (already in package.json with playwright)
- Test with real Supabase instance (or emulator)
- Gate deploys on test results

---

### 26. Missing Health Check Monitoring

**File:** `/src/app/api/health/route.ts` (assumed to exist)

**Memory:** Unified health monitor added Mar 2026 checking:
- HR Sheets sync heartbeat
- DialedIn report freshness

**But:**
- No public visibility of system health
- Alerts may not reach right people
- No SLA tracking

**Remediation:**
- Create status page (StatusPage.io or internal)
- Add real-time dashboard for sync health
- Set up proper alerting (PagerDuty, etc.)
- Monitor API response times and error rates

---

## ARCHITECTURAL CONCERNS

### 27. No Request Correlation IDs

**Concern:**
API routes handle distributed operations (Supabase, n8n, S3, email, Slack) with no way to trace requests end-to-end.

**Risk:**
- Debugging production issues is very difficult
- Can't correlate user action → API call → side effects
- Performance profiling is impossible

**Remediation:**
- Generate UUID for each request
- Pass through all async operations
- Log with correlation ID
- Return to client for support reference

---

### 28. No Caching Strategy

**Concern:**
Most routes fetch fresh data on every request. No caching layer (Redis, in-memory, HTTP cache headers).

**Files:**
- `/src/app/api/dialedin/intraday/route.ts` does have caching imports but implementation unclear
- `/src/app/api/executive/pnl/route.ts` (line 9) has cache TTL constant

**Risk:**
- Repeated queries to Supabase
- Expensive calculations repeated
- High latency for users
- Database cost increases

**Remediation:**
- Implement Redis caching for expensive queries
- Add HTTP cache headers (max-age, etag)
- Use request deduplication for concurrent identical requests
- Cache strategy per endpoint (5min for dashboards, 1min for real-time)

---

## RECOMMENDATIONS PRIORITY MATRIX

| Priority | Category | Issue | Effort | Impact |
|----------|----------|-------|--------|--------|
| CRITICAL | Security | Placeholder env vars | Medium | High |
| CRITICAL | Functionality | Email system mocked | High | High |
| CRITICAL | Data | `.single()` without error handling | Low | High |
| HIGH | Data | Pagination gaps in large queries | Medium | High |
| HIGH | Functionality | SMS mocked | Medium | Medium |
| HIGH | Security | Input validation missing | High | High |
| HIGH | Error Handling | Unvalidated JSON parsing | Low | High |
| MEDIUM | Type Safety | Excessive `any` types | High | Low |
| MEDIUM | Performance | Inefficient data processing | Medium | Low |
| MEDIUM | Patterns | Brittle CSV parsing | Medium | Medium |
| LOW | Documentation | Magic numbers undocumented | Low | Low |
| LOW | Architecture | No correlation IDs | Medium | Low |
| LOW | Caching | No caching strategy | High | Medium |

---

## Next Steps

1. **Immediate (This Week):**
   - Fix placeholder env vars to fail-fast
   - Replace `.single()` with `.maybeSingle()`
   - Add input validation to all POST routes

2. **Short-term (This Month):**
   - Complete email system with Resend
   - Implement SMS with Twilio
   - Add comprehensive error handling

3. **Medium-term (Next Quarter):**
   - Audit all pagination queries
   - Add zod schema validation everywhere
   - Implement Redis caching layer
   - Add integration test suite

4. **Long-term:**
   - Reduce `any` types through TypeScript strictness
   - Refactor tightly coupled HR components
   - Build feature flag system for incomplete features
   - Implement observability (correlation IDs, structured logging)


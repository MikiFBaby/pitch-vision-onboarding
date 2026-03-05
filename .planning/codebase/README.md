# Codebase Documentation Index

This directory contains comprehensive documentation about the Pitch Vision Web codebase architecture, conventions, integrations, testing strategy, and technical concerns.

## Documents

### CONCERNS.md (870 lines)
**Primary focus: Technical debt, bugs, security issues, and fragile areas**

Comprehensive analysis of:
- **28 distinct concerns** across 4 severity levels
- Critical security issues (placeholder env vars, unhandled errors, mocked features)
- High-priority data and error handling issues
- Medium-priority code quality and performance concerns
- Missing features and incomplete work
- Known workarounds and hacks
- Dependency risks and documentation gaps

Includes:
- Detailed issue descriptions with file locations and line numbers
- Risk assessment for each issue
- Concrete remediation guidance
- Priority action matrix
- Recommended execution roadmap (Week 1, Month 1, Quarter 1)

**Start here if:** You're investigating a bug, planning a refactor, or assessing code quality.

### CONCERNS-SUMMARY.txt (209 lines)
**Quick reference: One-page summary of all concerns with priority ranking**

Organized by severity:
- Critical issues (4 items) requiring immediate attention
- High-priority issues (4 items) for next sprint
- Medium-priority issues (4 items) for ongoing work
- Code quality, documentation, and dependency concerns
- Priority action items with checkboxes

**Start here if:** You need a quick overview or dashboard view of technical debt.

### ARCHITECTURE.md (680 lines)
**System design, data flow, and component relationships**

Covers:
- Next.js App Router structure (protected routes, API routes)
- Database schema and relationships
- External service integrations (Supabase, Firebase, n8n, DialedIn, Retreaver)
- QA pipeline architecture (6 n8n workflows, 12 auto-fail codes)
- Data flow for key features (onboarding, HR sync, DialedIn ingestion)
- ER diagram relationships

**Start here if:** You're new to the codebase or need to understand how systems interact.

### CONVENTIONS.md (565 lines)
**Code style, patterns, and best practices**

Documents:
- TypeScript conventions and patterns
- React component patterns
- Database query patterns
- Error handling conventions
- API route patterns
- Naming conventions
- File structure guidelines

**Start here if:** You're contributing code or reviewing a PR.

### INTEGRATIONS.md (394 lines)
**Third-party service integrations and API documentation**

Covers:
- Supabase (database, storage, auth)
- Firebase (alternative auth)
- n8n (QA pipeline workflows)
- DialedIn (sales analytics)
- Retreaver (revenue pipeline)
- DocuSeal (contract signing)
- Slack APIs
- Google Workspace / Apps Script
- SendGrid / Resend (email)

**Start here if:** You're integrating a new service or debugging an integration issue.

### STACK.md (132 lines)
**Tech stack overview and version information**

Quick reference for:
- Frontend: React 19, Next.js 16, Tailwind CSS 4
- Backend: Node.js, TypeScript
- Database: Supabase (PostgreSQL)
- Infrastructure: Vercel
- Key packages and their versions

**Start here if:** You need to understand the tech stack quickly.

### TESTING.md (419 lines)
**Testing strategy, frameworks, and test coverage**

Covers:
- Unit testing approach
- Integration testing setup
- E2E testing with Playwright
- Test organization and naming
- Key test scenarios per module
- Current test coverage gaps
- Testing best practices

**Start here if:** You're writing tests or setting up CI/CD.

---

## Quick Navigation

**I want to...**

- **Fix a bug** → CONCERNS.md (find the issue) → ARCHITECTURE.md (understand system) → CONVENTIONS.md (follow patterns)
- **Add a feature** → ARCHITECTURE.md (design) → CONVENTIONS.md (code) → TESTING.md (test)
- **Review a PR** → CONVENTIONS.md (check style) → TESTING.md (verify coverage) → CONCERNS.md (check known issues)
- **Refactor code** → CONCERNS.md (identify tech debt) → ARCHITECTURE.md (understand impact)
- **Onboard to codebase** → STACK.md (overview) → ARCHITECTURE.md (deep dive) → CONVENTIONS.md (learn patterns)
- **Debug integration issue** → INTEGRATIONS.md (API details) → ARCHITECTURE.md (data flow)
- **Improve test coverage** → TESTING.md (current gaps) → CONVENTIONS.md (patterns)

---

## Key Metrics

| Document | Lines | Issues | Coverage |
|----------|-------|--------|----------|
| CONCERNS.md | 870 | 28 concerns | Full codebase |
| ARCHITECTURE.md | 680 | N/A | Complete architecture |
| CONVENTIONS.md | 565 | N/A | TypeScript, React, Database, API |
| INTEGRATIONS.md | 394 | N/A | 10+ external services |
| TESTING.md | 419 | N/A | All test types |
| STACK.md | 132 | N/A | Tech stack overview |

**Total Documentation:** 3,269 lines covering all aspects of the codebase

---

## Top Critical Issues (See CONCERNS.md for details)

1. **Placeholder environment variables** (security risk)
2. **Unhandled .single() database calls** (causes 500 errors)
3. **Email system not implemented** (onboarding broken)
4. **SMS integration mocked** (alerts not sent)
5. **Pagination gaps** (data silently truncated)

See CONCERNS.md for complete analysis and remediation steps.

---

## Maintenance

These documents should be updated:
- **CONCERNS.md:** Monthly (new issues found, fixed issues removed)
- **ARCHITECTURE.md:** When major systems change
- **CONVENTIONS.md:** When new patterns are adopted
- **INTEGRATIONS.md:** When services are added/updated
- **TESTING.md:** When test framework changes

Last Updated: March 5, 2026
Generated by: Codebase Analysis Tool

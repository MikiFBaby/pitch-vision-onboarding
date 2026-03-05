# Pitch Vision Web - Testing Documentation

## Summary: No Testing Framework Currently Implemented

**Status**: ⚠️ **NO TEST FILES EXIST** in this codebase as of March 2026.

**Search Results**:
- ❌ No `*.test.ts` files found
- ❌ No `*.test.tsx` files found
- ❌ No `__tests__/` directory
- ❌ No `tests/` directory
- ❌ No Jest configuration (`jest.config.js`)
- ❌ No Vitest configuration (`vitest.config.ts`)

---

## Development Dependencies

**From `package.json`**:
```json
"devDependencies": {
  "playwright": "^1.58.2",  // E2E testing tool (installed but no tests found)
  "typescript": "^5",
  "eslint": "^9",
  "eslint-config-next": "16.1.0",
  "@types/react": "^19",
  "@types/react-dom": "^19",
  "@types/node": "^20",
  "tailwindcss": "^4",
  "@tailwindcss/postcss": "^4"
}
```

**Observation**: Playwright is installed but no test files (`.spec.ts`, `.e2e.ts`, etc.) were found anywhere in the codebase.

---

## NPM Scripts

**From `package.json`**:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint"
}
```

**Missing Scripts**:
- ❌ `test` — no test runner script
- ❌ `test:watch` — no watch mode
- ❌ `test:coverage` — no coverage reporting
- ❌ `e2e` — no E2E test runner (Playwright installed but unused)

---

## Code Coverage

**Current Coverage**: Unknown (no metrics collected)
- No coverage configuration file
- No baseline coverage targets
- No CI/CD coverage gates observed

---

## Linting Configuration

**Active**: ESLint is configured and functional.
```bash
npm run lint  # Runs eslint against codebase
```

**Config File**: `eslint.config.mjs`
```javascript
import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**"])
]);
```

**What's Checked**:
- TypeScript strict rules
- React best practices
- Next.js core-web-vitals
- Code style consistency

---

## Type Checking

**Active**: TypeScript strict mode enabled.
```bash
npm run build  # Implicitly runs tsc type checking
npx tsc --noEmit  # Manual type check
```

**Config**: `tsconfig.json`
```json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true
  }
}
```

---

## Testing Opportunities

### Unit Tests (High Priority)

1. **Utility Functions** — Easiest to test:
   - `lib/utils.ts` — `cn()` function (Tailwind merge)
   - `lib/hr-utils.ts` — HR data transformation
   - `lib/campaign-config.ts` — Campaign manager lookup
   - Date/time parsing utilities (scattered across codebase)

2. **Hooks** — Medium complexity:
   - `hooks/useIntradayData.ts` — Data fetching + realtime subscription
   - `hooks/useLiveData.ts` — Live metrics polling
   - Custom hooks in pages

3. **Context Providers** — Medium complexity:
   - `context/ExecutiveFilterContext.tsx` — Filter state management
   - `context/AuthContext.tsx` — Auth state
   - `context/QAContext.tsx` — QA state

### Integration Tests (Medium Priority)

1. **API Routes**:
   - `src/app/api/auth/login/route.ts` — User login/registration logic
   - `src/app/api/dialedin/kpis/route.ts` — KPI fetching with date ranges
   - `src/app/api/executive/pnl/route.ts` — P&L calculations (complex business logic)
   - Other data transformation routes

2. **Supabase Interactions**:
   - Query construction and error handling
   - `.maybeSingle()` vs `.single()` patterns
   - Pagination logic

### E2E Tests (Lower Priority)

1. **Critical User Flows**:
   - Login → redirect to correct dashboard based on role
   - QA analyst: Upload call recording → see analysis results
   - Executive: View P&L dashboard with date filters
   - Manager: Access team performance data

2. **Real Data**:
   - Use test/staging database
   - Verify Supabase Realtime updates
   - Test API pagination with large datasets

---

## Recommended Testing Strategy

### Phase 1: Unit Tests (Fastest ROI)
**Framework**: Jest or Vitest
**Target**: Utility functions, pure logic
**Example**:
```typescript
// tests/lib/utils.test.ts
import { cn } from '@/lib/utils';

describe('cn()', () => {
  it('merges Tailwind classes', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4'); // Tailwind merge priority
  });

  it('handles conditional classes', () => {
    expect(cn('base', true && 'active')).toBe('base active');
  });

  it('ignores falsy values', () => {
    expect(cn('base', false && 'ignore', null, undefined)).toBe('base');
  });
});
```

### Phase 2: Integration Tests
**Framework**: Jest with Supabase client mocking
**Target**: API routes, data fetching logic
**Example**:
```typescript
// tests/api/auth/login.test.ts
import { POST } from '@/app/api/auth/login/route';
import { supabaseAdmin } from '@/lib/supabase-admin';

jest.mock('@/lib/supabase-admin');

describe('POST /api/auth/login', () => {
  it('creates new user if not exists', async () => {
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ firebaseUid: '123', email: 'test@example.com' })
    });

    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.user.email).toBe('test@example.com');
  });
});
```

### Phase 3: E2E Tests (Playwrite)
**Framework**: Playwright (already installed)
**Target**: Critical user flows
**Example**:
```typescript
// tests/e2e/login.spec.ts
import { test, expect } from '@playwright/test';

test('agent can login and access portal', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.fill('input[type="email"]', 'agent@example.com');
  await page.fill('input[type="password"]', 'password');
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL('/agent');
});
```

---

## Configuration Template

### Jest Configuration
**File**: `jest.config.ts`
```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/?(*.)+(spec|test).ts?(x)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/app/**',
    '!src/components/ui/**',
  ],
};

export default config;
```

### Vitest Configuration (Alternative)
**File**: `vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### Playwright Configuration
**File**: `playwright.config.ts`
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## Test Structure Recommendations

```
tests/
├── unit/
│   ├── lib/
│   │   ├── utils.test.ts
│   │   ├── hr-utils.test.ts
│   │   └── campaign-config.test.ts
│   ├── hooks/
│   │   ├── useIntradayData.test.ts
│   │   └── useLiveData.test.ts
│   └── context/
│       ├── ExecutiveFilterContext.test.ts
│       └── AuthContext.test.ts
├── integration/
│   ├── api/
│   │   ├── auth/login.test.ts
│   │   ├── dialedin/kpis.test.ts
│   │   └── executive/pnl.test.ts
│   └── supabase/
│       └── queries.test.ts
├── e2e/
│   ├── auth.spec.ts
│   ├── qa-dashboard.spec.ts
│   └── executive-dashboard.spec.ts
├── setup.ts
└── fixtures/
    ├── mock-data.ts
    └── supabase-mock.ts
```

---

## CI/CD Integration

**Recommended GitHub Actions Workflow**:
```yaml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - run: npm ci
      - run: npm run lint
      - run: npm run type-check  # Or: npx tsc --noEmit
      - run: npm test
      - run: npm run test:coverage
      - run: npm run e2e
      - uses: codecov/codecov-action@v3
        if: always()
```

---

## Current Quality Measures

### What's Working
1. **TypeScript Strict Mode** — Compile-time type safety
2. **ESLint** — Code style + best practices
3. **Build Process** — `npm run build` validates code

### What's Missing
1. ❌ **Runtime unit tests** — No assertion framework active
2. ❌ **Integration tests** — No API contract validation
3. ❌ **E2E tests** — User flows not automated
4. ❌ **Coverage reporting** — No metrics baseline
5. ❌ **Test CI/CD gates** — Tests don't block deploys

---

## Notes for Development

1. **Playwright Already Installed**: Consider starting with E2E tests for critical paths
2. **Type Safety as Fallback**: TypeScript strict mode catches many bugs that tests would catch
3. **High Test Burden Areas**:
   - Complex date/range calculations in P&L route
   - Supabase query pagination logic
   - DialedIn data transformations
   - Auth user role mapping

4. **Low Priority for Testing**:
   - UI component rendering (Tailwind-heavy)
   - Visual/animation components
   - Simple form submissions

---

## Conclusion

This codebase relies entirely on TypeScript type safety and ESLint for quality assurance. While this is valid for early-stage projects, a testing framework should be introduced before:
- Critical business logic is deployed
- Multiple developers work on the same features
- Legacy code needs refactoring
- API contracts need validation

**Recommended first step**: Add Jest for unit tests of utility functions and hooks (lowest barrier to entry, highest value).

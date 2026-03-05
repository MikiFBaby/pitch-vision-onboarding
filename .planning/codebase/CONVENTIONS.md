# Pitch Vision Web - Code Conventions

## TypeScript Configuration

**Strict Mode Enabled**: `"strict": true` in `tsconfig.json`
- Full type safety enforced (no implicit `any`)
- `noImplicitAny`: true
- `strictNullChecks`: true
- `strictFunctionTypes`: true
- `allowJs`: true (allows gradual migration)

**Target & Module System**:
- `target: "ES2017"` (modern JS, async/await native)
- `module: "esnext"` with `moduleResolution: "bundler"`
- `jsx: "react-jsx"` (Next.js 13+ JSX transform)
- Path aliases: `@/*` → `src/*`

**Lib Configuration**:
- `lib: ["dom", "dom.iterable", "esnext"]`
- `isolatedModules: true` (files are modules, independent compilation)
- `skipLibCheck: true` (faster builds, skip node_modules type checking)

---

## Naming Conventions

### Files
- **Components**: PascalCase (e.g., `CallAnalyzer.tsx`, `EmployeeTable.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useIntradayData.ts`, `useLiveData.ts`)
- **Utilities/Libs**: camelCase (e.g., `supabase-admin.ts`, `hr-utils.ts`, `dialedin-cache.ts`)
- **Types**: camelCase (e.g., `qa-types.ts`, `dialedin-types.ts`)
- **API Routes**: kebab-case directories, `route.ts` per endpoint (e.g., `api/auth/login/route.ts`)
- **Config**: camelCase (e.g., `campaign-config.ts`, `slack-config.ts`)

### Variables & Functions
- **Functions**: camelCase (e.g., `fetchData()`, `buildUrl()`, `handleRetry()`)
- **React Components**: PascalCase (e.g., `CallAnalyzer`, `StatMetric`)
- **Constants**: UPPER_SNAKE_CASE or camelCase (context-dependent)
  - Global immutable: `MAX_FILE_SIZE_MB`, `AVERAGE_PROCESSING_TIME_MS`
  - Config objects: `MILESTONE_CONFIG`, `CAMPAIGN_MANAGERS` (exported consts may use upper case)
- **React Hooks**: `use` prefix with PascalCase (e.g., `useIntradayData`, `useLiveData`)
- **Context**: PascalCase (e.g., `ExecutiveFilterContext`)
- **Types/Interfaces**: PascalCase (e.g., `CallData`, `FileState`, `DatabaseCallRow`)
- **Enums**: PascalCase members (e.g., `CallStatus.CONSENT`)

---

## Import Organization

**Standard Pattern** (observed across codebase):
```typescript
// 1. External packages (React, Next.js, third-party)
import React, { useState, useEffect } from 'react';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 2. Internal aliases (@/)
import { supabaseAdmin } from '@/lib/supabase-admin';
import { CallData } from '@/types/qa-types';
import { cn } from '@/lib/utils';

// 3. Relative imports (rare, mostly reserved for co-located files)
import { PitchVisionLogo } from '@/components/ui/pitch-vision-logo';
```

**Key Pattern**:
- Prefer absolute imports with `@/` alias over relative (`../../../`)
- Consistent ordering: external → internal → relative
- No circular imports observed; tree structure is respected

---

## Component Patterns

### Client vs Server Components
**"use client" directive**:
- Required for any component using React hooks (`useState`, `useEffect`, `useContext`)
- Required for event handlers and interactivity
- Used consistently throughout (e.g., `CallAnalyzer.tsx`, `ExecutiveFilterContext.tsx`)
- Example:
  ```typescript
  "use client";

  import { useState, useEffect } from 'react';

  export const CallAnalyzer: React.FC<CallAnalyzerProps> = ({ isOpen, onClose }) => {
    const [fileStates, setFileStates] = useState<FileState[]>([]);
    // ...
  };
  ```

**Server Components**:
- Default in Next.js 13+ App Router
- API routes are inherently server-only (`src/app/api/*/route.ts`)
- Used for data fetching at page level
- Example: Executive page layout with filters

### Component Structure
**Typed Props Interface**:
```typescript
interface CallAnalyzerProps {
  isOpen: boolean;
  onClose: () => void;
  onAnalysisComplete: (data: CallData) => void;
  onUploadSuccess?: () => void;
}

export const CallAnalyzer: React.FC<CallAnalyzerProps> = ({ isOpen, onClose }) => {
  // Component body
};
```

**Typed State & Hooks**:
```typescript
interface FileState {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'analyzing' | 'completed' | 'error' | 'duplicate';
  errorMessage?: string;
}

const [fileStates, setFileStates] = useState<FileState[]>([]);
const [status, setStatus] = useState<'idle' | 'processing' | 'success'>('idle');
```

**forwardRef Pattern** (for UI primitives):
```typescript
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
```

### Styling
**Tailwind CSS with CVA**:
- `class-variance-authority` for component variants (see `Button.tsx`)
- `cn()` utility function (from `lib/utils.ts`) to merge Tailwind classes
- Pattern:
  ```typescript
  const buttonVariants = cva(
    "base-classes",
    {
      variants: {
        variant: { default: "...", destructive: "..." },
        size: { default: "...", sm: "...", lg: "..." }
      },
      defaultVariants: { variant: "default", size: "default" }
    }
  );
  ```

**Inline Styles**: Sparse; Tailwind + CSS-in-JS (styled-jsx) used in CallAnalyzer for animations
```typescript
<style jsx>{`
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  .animate-shimmer { animation: shimmer 2s infinite; }
`}</style>
```

---

## API Route Patterns

### Structure
**File**: `src/app/api/{feature}/{action}/route.ts`
**Export**: `export async function GET|POST|PUT|DELETE(request: Request)`

### Handler Pattern
```typescript
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs'; // Specify runtime if needed (e.g., for Edge)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const param = searchParams.get('param');

  try {
    // Supabase query with error handling
    const { data, error } = await supabaseAdmin
      .from('table')
      .select('*')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch' },
      { status: 500 }
    );
  }
}
```

### Supabase Query Patterns

**Error Handling**:
- Use `.maybeSingle()` for queries that might return 0 rows (avoids 406 error)
- Use `.single()` for queries guaranteed to return exactly 1 row
- Always destructure `{ data, error }`
- Check error before using data

**Pattern**:
```typescript
// Correct: might return null
const { data: user, error } = await supabase
  .from('users')
  .select('*')
  .eq('id', id)
  .maybeSingle();

// Correct: guaranteed to exist
const { data: user, error } = await supabase
  .from('users')
  .select('*')
  .eq('id', id)
  .single(); // Throws 406 if not found

// Correct: multiple rows
const { data: users, error } = await supabase
  .from('users')
  .select('*')
  .eq('role', 'agent');
```

### Response Patterns
```typescript
// Success
return NextResponse.json({ data: result });
return NextResponse.json({ success: true, user: { id, email, role } });

// Error
return NextResponse.json({ error: 'message' }, { status: 400 });
return NextResponse.json({ error: 'Database error', message: err.message }, { status: 500 });
```

---

## State Management

### React Context (Observed Pattern)
**Location**: `src/context/`
**Pattern**:
```typescript
"use client";

import { createContext, useContext, useState, useCallback } from 'react';

interface FilterState {
  dateRange: string;
  campaign: string | null;
}

interface FilterActions {
  setDateRange: (range: string) => void;
  setCampaign: (campaign: string | null) => void;
}

type FilterContextType = FilterState & FilterActions;

const FilterContext = createContext<FilterContextType | null>(null);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [dateRange, setDateRange] = useState('7d');
  const [campaign, setCampaign] = useState<string | null>(null);

  return (
    <FilterContext.Provider value={{ dateRange, campaign, setDateRange, setCampaign }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilters must be used inside FilterProvider');
  return ctx;
}
```

### Hooks for Data Fetching
**Observed Pattern** (`useIntradayData.ts`):
```typescript
"use client";

interface UseIntradayDataOptions {
  agent?: string;
  enabled?: boolean;
  interval?: number;
}

interface UseIntradayDataReturn {
  data: IntradayData | null;
  loading: boolean;
  refetch: () => void;
}

export function useIntradayData(options: UseIntradayDataOptions = {}): UseIntradayDataReturn {
  const [data, setData] = useState<IntradayData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    // Fetch logic
  }, [/* dependencies */]);

  // Initial fetch
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    fetchData();
  }, [enabled, fetchData]);

  // Realtime subscription
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase.channel('topic').on('event', handleUpdate).subscribe();
    return () => supabase.removeChannel(channel);
  }, [enabled]);

  // Fallback polling
  useEffect(() => {
    if (!enabled || interval <= 0) return;
    const id = setInterval(fetchData, interval);
    return () => clearInterval(id);
  }, [enabled, interval, fetchData]);

  return { data, loading, refetch: fetchData };
}
```

**Key Patterns**:
- Manage refs for timers: `useRef<ReturnType<typeof setTimeout> | null>(null)`
- Cleanup subscriptions in return of useEffect
- Combine Realtime (primary) + polling (fallback)
- Use `useCallback` to memoize fetch functions to prevent infinite loops

---

## Error Handling

### Try-Catch Blocks (API Routes)
```typescript
try {
  const { data, error } = await supabaseAdmin.from('table').select('*');
  if (error) throw error;
  return NextResponse.json({ data });
} catch (err) {
  console.error('Context:', err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : 'Failed' },
    { status: 500 }
  );
}
```

### Supabase Error Handling
```typescript
const { data, error } = await supabase.from('table').select('*');
if (error) {
  console.error('Supabase error:', error);
  return NextResponse.json({ error: error.message }, { status: 500 });
}
```

### Null Checks (Defensive)
```typescript
// Always check optional fields before use
if (directoryMatch?.user_image || photoUrl || null);

// Check instanceof for type narrowing
if (err instanceof Error ? err.message : 'Generic error'
```

---

## Common Utilities & Patterns

### `lib/utils.ts` — `cn()` Function
**Purpose**: Merge Tailwind CSS classes, handling conflicts
```typescript
import { cn } from "@/lib/utils";

// Merge base + conditional classes
<div className={cn("base-class", isActive && "active-class")} />

// Used with CVA variants
className={cn(buttonVariants({ variant, size, className }))}
```

### Supabase Client Initialization
**Admin Client** (`lib/supabase-admin.ts`):
```typescript
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
// Server-only, used in API routes
```

**Client** (`lib/supabase-client.ts`):
```typescript
const supabase = createClient(supabaseUrl, supabasePublicKey);
// Client-side, used in "use client" components & browser
```

### Date/Time Utilities
**Pattern** (observed in Executive page, P&L route):
```typescript
const now = new Date();
const end = now.toISOString().split('T')[0]; // YYYY-MM-DD

// Calculate date ranges
const d = new Date(now);
d.setDate(d.getDate() - days);
const start = d.toISOString().split('T')[0];

// Month-to-date
const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
```

### Pagination Pattern (Supabase)
**Observed in P&L route** (avoiding 1000-row default limit):
```typescript
async function fetchAllPerfData(startDate: string, endDate: string) {
  const allData: PerfRow[] = [];
  let from = 0, to = 999;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('dialedin_agent_performance')
      .select('*')
      .range(from, to);

    if (!data || data.length === 0) break;
    allData.push(...data);
    from += 1000;
    to += 1000;
  }

  return allData;
}
```

### Parallel Fetches
**Pattern**:
```typescript
const [result1, result2, result3] = await Promise.all([
  fetch('/api/endpoint1'),
  fetch('/api/endpoint2'),
  fetch('/api/endpoint3')
]);
```

---

## Type Definitions

### Location: `src/types/`
**Files**:
- `qa-types.ts` — QA/compliance data structures
- `dialedin-types.ts` — DialedIn performance & metrics
- Others: product-specific (coaching, HR, etc.)

### Pattern
```typescript
// Enum
export enum CallStatus {
  CONSENT = 'Consent Received',
  NO_CONSENT = 'No Consent',
  REVIEW = 'Needs Review',
}

// Union types
export type QAStatus = 'pending' | 'approved' | 'rejected' | 'escalated';

// Interface with optional fields
export interface CallData {
  id: string;
  agentName: string;
  checklist: ChecklistItem[];
  violations?: string[]; // Optional
  metadata?: Record<string, unknown>; // For flexible data
}

// Database row interface (snake_case to match schema)
export interface DatabaseCallRow {
  id: number;
  created_at: string;
  call_id: string | null;
  checklist: any | null; // JSONB
}
```

---

## ESLint Configuration

**Config**: `eslint.config.mjs` (ESLint 9+ flat config)
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

**Rules Applied**:
- Next.js core-web-vitals (LCP, CLS, FID)
- TypeScript strict checks
- React best practices

**Notable Directives** (observed in code):
```typescript
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-line react-hooks/exhaustive-deps
```

---

## Key Architectural Decisions

1. **Supabase as Primary DB**: Realtime subscriptions + REST API
2. **Next.js App Router**: `(protected)` layout for auth gating
3. **Context + Hooks**: State management (no Redux/Zustand)
4. **"use client" Selective**: Only on interactive/stateful components
5. **Tailwind + CVA**: Styling for consistency and variants
6. **Absolute Imports**: `@/` alias throughout for maintainability
7. **TypeScript Strict**: Full type safety, no implicit `any`
8. **Server-Side Admin Queries**: `supabaseAdmin` never exported to client
9. **Pagination for Large Tables**: Explicit `.range()` to bypass 1000-row limit
10. **Realtime Primary + Polling Fallback**: Hybrid approach for live data

---

## Notable Patterns

- **Defensive null checks**: Use `?.` optional chaining and `?? fallback` pattern
- **Error instanceof narrowing**: `err instanceof Error ? err.message : 'generic'`
- **FormData for file uploads**: Used in QA call analyzer
- **Supabase Realtime cleanup**: Always `removeChannel()` in useEffect return
- **URL date formatting**: `toISOString().split('T')[0]` for YYYY-MM-DD
- **Environment variables**: `process.env.NEXT_PUBLIC_*` for client, `process.env.*` for server

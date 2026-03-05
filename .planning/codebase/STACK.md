# Technology Stack - Pitch Vision Web

## Language & Runtime
- **Runtime**: Node.js 20-alpine (Docker), Node.js 20+ required
- **Language**: TypeScript 5.x
- **Target**: ES2017 (ECMAScript 2017)
- **Module System**: ESNext modules
- **JSX/TSX**: React 19.2.3 with react-jsx compiler

## Core Framework
- **Framework**: Next.js 16.1.0
- **Output Mode**: Standalone (minimal Docker image, self-contained)
- **App Router**: Yes (file-based routing in `/src/app`)
- **Protected Routes**: Layout-based at `(protected)` directory

## Frontend Framework & UI
- **React**: 19.2.3 with React DOM 19.2.3
- **Styling**: Tailwind CSS 4.x + PostCSS 4
- **Component Library**: Radix UI (label, scroll-area, slot, tabs)
- **Icons**:
  - Tabler Icons (React) 3.36.0
  - Radix UI Icons 1.3.2
  - Lucide React 0.562.0
- **Animation**:
  - Framer Motion 12.23.26
  - Motion 12.23.26
  - GSAP 3.14.2 with React support
- **3D Graphics**: Three.js 0.182.0 with React Three Fiber 9.4.2 and Drei 10.7.7

## Calendar & Scheduling
- **FullCalendar**: 6.1.20
  - Core, React wrapper, daygrid plugin, timegrid plugin, interaction plugin

## Charts & Data Visualization
- **Recharts**: 3.6.0 (React chart library)

## Database & Data Fetching
- **Supabase JS Client**: 2.89.0 (PostgreSQL-based DB, Auth, Storage)
- **Firebase**: 12.7.0 (Auth, Storage, Firestore)

## File & Document Handling
- **File Operations**:
  - file-saver 2.0.5
  - XLSX 0.18.5 (Excel parsing)
  - JSDoc 3.0.4 + jspdf-autotable 5.0.2 (PDF generation)
- **Digital Signing**: @docuseal/react 1.0.71 (HTML form-based contract signing)

## Email & Communication
- **SMTP**: Nodemailer 7.0.12 (Google Workspace SMTP + App Passwords)
- **Email Service**: Resend 6.9.2 (transactional email API)

## Cloud & Storage
- **AWS S3**: @aws-sdk/client-s3 3.993.0 (object storage for Retreaver files)

## AI & Language Models
- **Google Gemini**: @google/genai 1.34.0, @google/generative-ai 0.24.1
- **ElevenLabs**: @elevenlabs/react 0.13.0 (voice generation)
- **OpenRouter**: Supported via OPENROUTER_API_KEY env var (OpenAI-compatible API for multiple models)

## Email Ingestion
- **IMAP**: imapflow 1.2.10 (parse Retreaver/DialedIn reports from Gmail)
- **Mail Parsing**: mailparser 3.9.3

## Utilities
- **Date/Time**: date-fns 4.1.0
- **UI Utilities**:
  - clsx 2.1.1 (conditional classnames)
  - tailwind-merge 3.4.0
  - class-variance-authority 0.7.1 (type-safe component variants)
- **Type Safety**: prop-types 15.8.1
- **3D Math**: maath 0.10.8

## Deployment & CLI
- **Hosting**: Vercel (platform)
- **Vercel Functions**: @vercel/functions 3.4.2
- **Vercel CLI**: vercel 50.4.5
- **Server-only**: server-only 0.0.1 (prevents server code in client bundles)

## Development & Build Tools
- **Bundler**: Next.js internal (Webpack-based)
- **TypeScript Compiler**: typescript 5.x
- **Linter**: ESLint 9.x with eslint-config-next 16.1.0
- **E2E Testing**: Playwright 1.58.2 (browser automation)
- **Tailwind CSS PostCSS**: @tailwindcss/postcss 4
- **Node Types**: @types/node 20
- **React Types**: @types/react 19, @types/react-dom 19

## Build Configuration

### TypeScript (`tsconfig.json`)
- Strict mode enabled
- Module resolution: bundler
- Path alias: `@/*` → `./src/*`
- Isolated modules for Next.js
- Incremental builds enabled

### Next.js (`next.config.ts`)
- Output: `standalone` (minimal Docker image)
- Skip trailing slash redirect
- Image remotes: Unsplash, i.ibb.co, Supabase CDN
- TypeScript: `ignoreBuildErrors` (allows type errors in production)

### PostCSS (`postcss.config.mjs`)
- Tailwind CSS 4 (built-in PostCSS)

### ESLint (`eslint.config.mjs`)
- Next.js preset (disabled some React rules for Next.js compatibility)

## Docker & Containerization
- **Base Image**: node:20-alpine
- **Multi-stage Build**: deps → builder → runner
- **Minimal Size**: Standalone output in runner stage (only public files + .next/standalone)
- **User Isolation**: Non-root user (nodejs:1001)
- **Healthcheck**: Node-based (avoids Alpine wget dependency)
- **Cron Service**: Separate Dockerfile.cron for background jobs

## Environment Variables (Build-Time)
Baked into client bundle during Docker build:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_FIREBASE_*` (API key, auth domain, project ID, storage bucket, sender ID, app ID)
- `NEXT_PUBLIC_APP_URL`

## Key Dependencies Summary
- **23 direct dependencies** in package.json
- **7 dev dependencies**
- **Total install**: node_modules/ (~668 files at 668 dirs)
- **Primary patterns**:
  - Supabase + Firebase dual auth/storage
  - Tailwind + Radix UI + GSAP for rich UI
  - Next.js App Router with server + client components
  - API routes for webhooks, cron, integrations (121+ routes total)

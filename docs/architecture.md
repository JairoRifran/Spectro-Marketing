# Architecture

M01 uses Next.js App Router on Vercel and Supabase for Auth, Postgres, Storage, and future Realtime. Server Components read user-scoped data through RLS. Route Handlers validate mutations with Zod. Only the internal dispatcher uses the service role.

```mermaid
flowchart TD
  U[Authenticated user] --> UI[Next.js App Router]
  UI --> RLS[Supabase Auth + RLS]
  RLS --> PG[(PostgreSQL source of truth)]
  CRON[Supabase Cron] -->|Bearer CRON_SECRET| D[Bounded dispatcher]
  D --> S[Materialize due schedules]
  S --> E[Persistent events]
  D --> EC[Claim events: SKIP LOCKED]
  EC --> T[Idempotent tasks]
  D --> TC[Claim tasks: SKIP LOCKED]
  TC --> AR[AgentRuntime]
  AR --> P[MockProvider]
  P --> R[Result + delegated tasks]
  R --> A[Approval policy]
  R --> L[Activity + memory]
  A --> PG
  L --> PG
```

PostgreSQL owns state; workers are bounded; locks prevent duplicate claims; unique organization-scoped keys prevent duplicate intent; leases repair interrupted work; approvals and autonomy are deterministic; providers cannot override policy.

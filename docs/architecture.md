# Architecture

Spectro uses Next.js App Router on Vercel and Supabase for Auth, Postgres, Storage, and future Realtime. Server Components read user-scoped data through RLS. An HttpOnly organization-context cookie selects one of the authenticated user's memberships and is revalidated on every request. Route Handlers validate mutations with Zod. The bounded worker and authenticated Campaign Brain service keep the service role server-only.

```mermaid
flowchart TD
  U[Authenticated user] --> UI[Next.js App Router]
  UI --> RLS[Supabase Auth + RLS]
  RLS --> PG[(PostgreSQL source of truth)]
  UI -->|Explicit Run Campaign Brain| MR[Scoped manual runner]
  MR -->|Claim only campaign_id| TC
  CRON[Supabase Cron] -->|Bearer CRON_SECRET| D[Bounded dispatcher]
  D --> S[Materialize due schedules]
  S --> E[Persistent events]
  D --> EC[Claim events: SKIP LOCKED]
  EC --> T[Idempotent tasks]
  D --> TC[Claim tasks: SKIP LOCKED]
  TC --> AR[AgentRuntime]
  AR --> P[MockProvider]
  P --> R[Result + delegated tasks]
  R --> CB[Versioned campaign artifacts]
  R --> A[Approval policy]
  R --> L[Activity + memory]
  A --> PG
  L --> PG
  CB --> PG
```

PostgreSQL owns state; workers are bounded; locks prevent duplicate claims; unique organization-scoped keys prevent duplicate intent; leases repair interrupted work; approvals and autonomy are deterministic; providers cannot override policy.

M01.1 adds defense in depth: sensitive configuration writes are owner/admin-only, notification rows are user-private, cross-organization foreign references are rejected by triggers, approval decisions use an audited RPC, and the last owner cannot be removed. `AUTOMATION_ENABLED` is a server-only kill switch; preview and test environments remain disabled even if the flag is accidentally true.

M02.1 extends the same runtime rather than adding a workflow engine. The campaign-scoped claim function is unavailable to `anon` and `authenticated`; an authorized Route Handler validates membership and role before the server-only runner uses it. Each provider result is Zod-validated and persisted by task type. Research, channels, pillars, angles, messaging and strategy snapshots retain `organization_id`, `campaign_id` and `strategy_version`. The final task runs deterministic brand guardrails, marks the campaign `ready`, and creates an approval. Approval never publishes or enables automation.

M02.2B Content Factory sits between Campaign Brain and Content Intelligence. An approved campaign strategy becomes editorial concepts, native per-platform variants and a creative review, persisted across `content_concepts`, `content_items`, `content_variants`, `content_reviews` and `content_versions`. It runs on the same task engine, reuses the M01 approval engine, and enforces its lifecycle both in TypeScript and in a database trigger. It has no scheduled entry point: production content is only ever produced by an explicit human action that first verifies the strategy was approved. Nothing is published and no external network is contacted.

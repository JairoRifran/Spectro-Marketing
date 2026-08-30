<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Spectro validation

- Preserve applied migrations; add corrective migrations with a new timestamp.
- Never run remote fixture cleanup unless `TEST_ENVIRONMENT=true`, and never against production.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only and autonomous execution disabled by default.
- Before milestone closeout run lint, typecheck, unit/integration tests, build, and Playwright; PASS requires real Supabase and Vercel evidence. Cron must remain inactive for M02.1.

# Where the project actually is

Before changing anything, read `docs/project-state.md`. It records what runs on a real model,
what is built but never executed, the sixty-second constraint that shapes every design here, and
the failure modes that have already cost days -- each one found in production, none of them
guessable from the code.

# Spectro engineering guide

Spectro is a multi-tenant marketing operating system. PostgreSQL is the source of truth. Autonomous behavior uses persistent events, schedules, tasks, short workers, leases, retries, and idempotency—not permanent Node processes. The bounded Vercel dispatcher is awakened externally.

## Commands

- `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`.

## Architecture and conventions

Domain code lives in `src/server`; product data/use cases in `src/features`; UI in `src/components`; routes in `src/app`. Supabase clients are split into browser, SSR user, and server-only admin clients. Never import the admin client into client code. Keep decisions deterministic and tested. Use Zod at HTTP boundaries. Every organization-owned row has `organization_id` and relies on RLS. Activity contains summaries/correlation IDs, never prompts, credentials, or secrets.

Migrations in `supabase/migrations` are forward-only after production use. Test them on an isolated project. The service role is server-only. Cron uses a timing-safe comparison with `CRON_SECRET`.

## Extension recipes

- Agent: add a stable role, capabilities, provider-neutral instructions, and tests; never key logic on display name.
- Event: add a namespaced type, deterministic handler, and idempotency key.
- Provider: implement `AgentProvider` and map failures to typed errors; never invent vendor APIs.
- Task type: add a namespaced type, input/output validation, risk policy, handler behavior, and tests.

## Campaign Brain boundaries

- Campaign Brain starts from an Objective and ends at a versioned Campaign Brief; it does not produce or publish social posts.
- `Run Campaign Brain` is an explicit authenticated action. It may reuse the task runtime while `AUTOMATION_ENABLED=false`; it must never claim unrelated queued work.
- Brand forbidden words/claims are validated deterministically before `ready`. Research must identify `knowledge_based` versus `external` and expose assumptions and external research gaps.
- Prompt definitions live under `src/server/campaigns`, provider outputs are validated with Zod, and mock results must remain clearly distinguishable from real-provider output.
- Every campaign artifact keeps `organization_id`, `campaign_id`, `strategy_version`, RLS and an audited activity trail.

## Done

RLS/idempotency remain intact; migrations are forward-only; relevant tests exist; lint, typecheck, tests, and build pass; docs and `.env.example` stay accurate; no secrets or fabricated live metrics exist. Preserve demo/live separation. Real publishing, spend, external marketing integrations, and the Content Factory are outside M02.1.

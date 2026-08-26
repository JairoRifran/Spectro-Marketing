<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Spectro M01 engineering guide

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

## Done

RLS/idempotency remain intact; migrations are forward-only; relevant tests exist; lint, typecheck, tests, and build pass; docs and `.env.example` stay accurate; no secrets or fabricated live metrics exist. Preserve demo/live separation. Real publishing, spend, and external marketing integrations are outside M01.

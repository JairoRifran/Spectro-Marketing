# Spectro — M01 Foundation

Spectro is the foundation of an autonomous marketing department operated by specialized AI agents. M01 focuses on the operating system: multi-tenancy, durable work, events, schedules, approvals, auditability, and a provider-neutral runtime.

## Run locally

1. `pnpm install`
2. Copy `.env.example` to `.env.local`. For an interface-only preview set both demo flags to `true`.
3. Apply `supabase/migrations` in order. Run `supabase/seed.sql` only in a disposable local project.
4. `pnpm dev`

Demo data is clearly labeled and never queried in live mode. Live mode uses authenticated Supabase queries protected by RLS.

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Remote tests require an isolated migrated Supabase project, all `SUPABASE_TEST_*` variables, and the explicit destructive-test guard `TEST_ENVIRONMENT=true`. They refuse production environments. Live Playwright additionally requires the app Supabase variables to point to that same test project and `AUTOMATION_ENABLED=true`.

Autonomous execution is disabled by default. `AUTOMATION_ENABLED=true` enables it only outside preview/test environments; Vercel Preview is always blocked. `/api/health` exposes only app/database readiness. See [production validation](docs/production-validation.md) for the repeatable closeout procedure.

See [architecture](docs/architecture.md), [agent runtime](docs/agent-runtime.md), [task engine](docs/task-engine.md), [event engine](docs/event-engine.md), [approvals](docs/approvals.md), [security](docs/security.md), [deployment](docs/deployment.md), [production validation](docs/production-validation.md), and [closeout](docs/m01-closeout.md).

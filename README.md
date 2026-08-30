# Spectro — M02.1 Campaign Brain

Spectro is a multi-tenant marketing operating system operated by specialized AI agents. M01 provides durable work, events, approvals, auditability and a provider-neutral runtime. M02.1 adds Campaign Brain: an objective-first workflow that produces research, audience, messaging, channel strategy, content pillars, creative angles and a versioned Campaign Brief.

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

Campaign Brain is invoked only by an authenticated human action. Its manual runner reuses the task runtime but claims only tasks related to the selected campaign. It does not require Cron and never publishes, schedules social posts, spends budget or calls social APIs. With `AI_PROVIDER=mock`, its output is deterministic and labeled as mock-derived.

See [Campaign Brain](docs/campaign-brain.md), [architecture](docs/architecture.md), [agent runtime](docs/agent-runtime.md), [task engine](docs/task-engine.md), [approvals](docs/approvals.md), [security](docs/security.md), [credential encryption](docs/credential-encryption.md), [deployment](docs/deployment.md), [M02.1 closeout](docs/m02-1-closeout.md), [Content Factory](docs/content-factory.md), and [M02.2B closeout](docs/m02-2b-closeout.md).

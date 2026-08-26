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

Postgres integration tests require `SUPABASE_TEST_URL` and `SUPABASE_TEST_SERVICE_KEY` for an isolated project. Auth E2E requires `E2E_SUPABASE_CONFIGURED=1`.

See [architecture](docs/architecture.md), [agent runtime](docs/agent-runtime.md), [task engine](docs/task-engine.md), [event engine](docs/event-engine.md), [approvals](docs/approvals.md), [security](docs/security.md), [deployment](docs/deployment.md), and [closeout](docs/m01-closeout.md).

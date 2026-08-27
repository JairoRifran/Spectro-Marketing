# M01 production validation

Use an isolated Supabase project first. Never point the remote suites at production.

## 1. Environment safety

Set `TEST_ENVIRONMENT=true`, `DEPLOYMENT_ENVIRONMENT=test`, `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, and `SUPABASE_TEST_SERVICE_KEY`. For live Playwright, point the normal Supabase URL/anon/service variables to the same test project, set a 24+ character `CRON_SECRET`, `AI_PROVIDER=mock`, and `AUTOMATION_ENABLED=true`. The test guard rejects production and rejects a URL that matches `SUPABASE_PRODUCTION_URL`.

## 2. Empty-database migration

Apply every file in `supabase/migrations` in filename order to an empty project. Confirm functions, triggers, constraints, indexes, enums, storage policies, and RLS are present. Do not apply `supabase/seed.sql` outside a disposable environment.

## 3. Automated database evidence

Run:

```bash
pnpm test:integration
pnpm test:e2e
```

The integration suites create prefixed fixtures and clean their organizations/Auth users. Expected evidence includes:

- Organization A cannot select/update Organization B rows across all M01 tenant tables.
- Viewer is read-only; member may operate knowledge but cannot administer brand/configuration; admin may.
- Three simultaneous claimers produce one claim.
- Invalid task transitions and circular dependencies fail.
- Duplicate task/event delivery produces one logical row.
- An expired lease is recovered and audited.
- Approval, dispatch, autonomous CMO delegation, Auth onboarding, session refresh, logout, and protected routes complete.

## 4. Dispatcher and batch

With automation enabled only in the isolated environment, verify missing/wrong secrets return the same 401 response. Submit the correct secret and confirm a bounded report. Queue 20 tasks with `DISPATCH_BATCH_SIZE=5`; each wake-up may claim at most five and subsequent calls drain the queue. Confirm retries include task-run history and both permanent failure and fail/fail/success cases.

## 5. Vercel and Cron

Deploy with demo flags false. Confirm `GET /api/health`, Auth redirect allowlists, all live pages, organization switching, and no client bundle contains the service role. Store `APP_URL` and `CRON_SECRET` in Supabase Vault. Configure pg_cron/pg_net to read those secrets at runtime and POST once per minute. Verify `worker_health` timestamps/counts and the complete chain:

```text
schedule → event → Sofía task → agent run → delegated Mateo task → agent run → completed → activity
```

## 6. Final regression

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e`. Record deployment URL, migration output, test counts, Cron job evidence, and timestamps in `docs/m01-closeout.md`. Only then change the status from PARTIAL to PASS.

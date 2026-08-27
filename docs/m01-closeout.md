# M01 closeout

## Status

`PARTIAL` — every credential-free gate passes, and the production stack (Vercel + Supabase + Vault + pg_cron) is now provisioned and verified. Production PASS is still withheld because the autonomous chain in `docs/production-validation.md` §3–§5 has never executed: the kill switch is deliberately off, the Cron job is deliberately inactive, and the database holds no tenant rows to prove the chain with.

## Verified locally on 2026-08-27 (`d83245a`)

- `pnpm lint` — pass.
- `pnpm typecheck` — pass.
- `pnpm test` — 31 passed, 9 skipped (11 files passed, 2 skipped).
- `pnpm build` — pass, 22 static pages generated.
- `pnpm test:e2e` — 4 demo passed, 4 live skipped by the `TEST_ENVIRONMENT` guard.
- Client bundle carries no service-role value: `service_role` appears 0 times in `.next/static`, no JWT is present. The single `SUPABASE_SERVICE_ROLE_KEY` match is the Zod env *schema* (variable names and lengths only); `createAdminClient` is imported solely by `src/server/workers/dispatcher.ts`.

## Verified in production on 2026-08-27

### Vercel

- Project `spectromarketing`, production URL `https://spectromarketing.vercel.app`, deployed from `d83245a`.
- `GET /api/health` → `200 {"status":"ok","app":true,"database":true}` at `2026-08-27T14:44:53Z`, confirming a real PostgreSQL round trip.
- `POST /api/internal/jobs/dispatch` → `503 automation_disabled` with no secret and with a wrong secret alike. The kill switch is evaluated before authentication, so this is the expected shape and it proves nothing about secret validity.
- `/` redirects to `/login?next=%2F`; the branded login renders.

### Supabase

- Project `Spectro Marketing`, ref `peyspqwrxashicmxorpl`, `sa-east-1`, status Healthy.
- Extensions present: `supabase_vault`, `pg_cron`, `pg_net`.
- 24 tables in `public`, **24 of them with RLS enabled** (full coverage).
- Vault holds `spectro_app_url` (35 chars) and `spectro_cron_secret` (64 chars, above the 24-char minimum), both created `2026-08-27T13:49:24Z`. Values were never printed or read back.
- `cron.job` holds one row: `spectro-dispatch-every-minute`, schedule `* * * * *`, **`active = false`**. Its command builds the header as `'Bearer ' || (select decrypted_secret from …)`, so the secret is resolved from Vault at run time; no literal secret or JWT is embedded in the job definition.

## Required before PASS

1. **The autonomous chain has never run.** `worker_health` has 0 rows, and `tasks` and `organizations` are both empty. The `schedule → event → Sofía task → agent run → delegated Mateo task → agent run → completed → activity` evidence in §5 does not exist yet.
2. **`CRON_SECRET` parity is unverified.** The value in Vercel Production and the value in `spectro_cron_secret` were written in separate sessions across several rotations, and the kill switch returns 503 before the secret is ever compared — so no observation to date distinguishes a matching pair from a mismatched one. Prove it functionally in the isolated project (dispatcher must answer 200, not 401) before activating the job in production.
3. **Migrations are not tracked.** `supabase_migrations.schema_migrations` does not exist and the dashboard reports "No migrations": the schema was applied outside the CLI. Reconcile the history so `supabase/migrations` remains the forward-only source of truth.
4. **§3 and §4 are outstanding.** Run `pnpm test:integration` and the four live Playwright cases against an isolated Supabase project with `TEST_ENVIRONMENT=true`, plus the dispatcher batch/retry evidence (20 tasks at `DISPATCH_BATCH_SIZE=5`, permanent failure, and fail/fail/success).

Only after those four items may `AUTOMATION_ENABLED` be turned on, the Cron job set to `active = true`, and this status changed from PARTIAL to PASS.

Real AI providers and all M02 marketing channels remain deliberately out of scope.

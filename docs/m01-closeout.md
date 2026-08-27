# M01 closeout

## Status

`PARTIAL` — the product path is now verified end to end against real infrastructure: a new
account reaches onboarding, onboarding provisions a real organization from Supabase data, and
Marketing HQ renders that organization's own rows. Production PASS is still withheld because
the autonomous chain in `docs/production-validation.md` §3–§5 has never executed. That is
deliberate: automation and the Cron job remain switched off, and no isolated Supabase project
exists to run the remote suites against.

## Verified locally on 2026-08-27 (`8f1b482`)

- `pnpm lint`, `pnpm typecheck`, `pnpm build` — pass.
- `pnpm test` — 51 passed, 13 skipped.
- `pnpm test:e2e` — 5 demo passed, 4 live skipped by the `TEST_ENVIRONMENT` guard.
- Client bundle carries no service-role value: `service_role` appears 0 times in `.next/static`
  and no JWT is present. The lone `SUPABASE_SERVICE_ROLE_KEY` match is the Zod env *schema*
  (names and lengths only); `createAdminClient` is imported solely by the dispatcher.

## Verified in production on 2026-08-27

Deployment `spectromarketing.vercel.app`; Supabase project `peyspqwrxashicmxorpl` (`sa-east-1`).

### Platform

- `GET /api/health` → `200 {"status":"ok","app":true,"database":true}`.
- `POST /api/internal/jobs/dispatch` → `503 automation_disabled`, with and without a secret
  alike. The kill switch precedes authentication, so this proves the switch, not the secret.
- Anonymous `/` and `/onboarding` → `307` to `/login`.
- 24 tables in `public`, all 24 with RLS enabled.
- Vault holds `spectro_app_url` and `spectro_cron_secret`; values were never read back.
- `cron.job` holds `spectro-dispatch-every-minute`, `* * * * *`, **`active = false`**. Its
  command resolves the secret from Vault at run time and embeds no literal.

### Product path

- A signed-in account with no membership is redirected from every page to `/onboarding`.
- Onboarding completed through the real five-step form. It provisioned one organization, one
  brand, one product, one persona, one objective, one schedule and **the eight M01 agents**:
  Sofía, Mateo, Valentina, Bruno, Clara, Emilia, Tomás and Vera.
- Marketing HQ shows the real organization in the sidebar, the objective under *Objetivo
  principal*, and every agent as `Idle` — honest, since automation is off.
- The sidebar approval badge and HQ's *Decisiones pendientes* both read from the same status
  and organization and both show zero. Neither is hardcoded any more.
- Tasks, Approvals and Knowledge render empty in production: no demo row leaks with
  `DEMO_MODE=false`.
- Organization context survives a reload.

## Defects found and fixed during this validation

- `complete_onboarding` listed twelve columns and supplied eleven values on the objectives
  insert, so it raised at every call. Onboarding had never completed in any environment.
- The proxy enforced authentication but not membership, so a new account landed on an empty
  Marketing HQ with no next action.
- The sidebar approval badge was the literal `"1"`; HQ's count was capped at one by its own
  query.
- Onboarding retried without an organization id created a second organization.
- `complete_onboarding` aborted on retry instead of converging.
- Comma-separated onboarding fields parsed each keystroke and rendered the parsed array back
  into the input, so every separator the user typed was eaten.
- The auth form displayed the raw message of any `Error`, so a config failure surfaced a Zod
  dump to the user.
- Public Supabase env reached Zod through `process.env` as a whole object, which Next.js does
  not inline, so browser auth never had credentials.

## Required before PASS

1. **The autonomous chain has never run.** `worker_health` is empty and `tasks` is zero. The
   `schedule → event → Sofía task → agent run → delegated Mateo task → agent run → completed →
   activity` evidence in §5 does not exist yet.
2. **`CRON_SECRET` parity is unverified.** The Vercel value and `spectro_cron_secret` were
   written in separate sessions, and the kill switch answers 503 before the secret is compared,
   so nothing observed so far separates a matching pair from a mismatched one.
3. **Migrations are not tracked.** `supabase_migrations.schema_migrations` does not exist; the
   schema was applied outside the CLI. Reconcile the history so `supabase/migrations` stays the
   forward-only source of truth.
4. **§3 and §4 are outstanding.** Run `pnpm test:integration` and the four live Playwright cases
   against an isolated Supabase project with `TEST_ENVIRONMENT=true`, plus the dispatcher batch
   and retry evidence.

All four are unblocked by one thing: an isolated Supabase project. None of them require
touching production, and none should be attempted there.

Real AI providers and all M02 marketing channels remain deliberately out of scope.

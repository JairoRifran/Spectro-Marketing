# M01 closeout

## Status

`PARTIAL` — local hardening and all credential-free gates pass. Production PASS is intentionally withheld because this workspace has no Supabase credentials, Vercel project link, deployed URL, or Cron configuration to execute the mandatory real-infrastructure evidence.

## Verified locally on 2026-08-26

- Clean baseline from `e4fcc05`.
- Lint, TypeScript, unit/contract tests, production build, and demo Playwright pass.
- Demo/live data separation is explicit; missing live configuration no longer fabricates live activity.
- Protected-route redirects, safe callback destinations, logout, selected organization context, server-side automation kill switch, minimal health endpoint, live Settings queries, and all specified Task filters are implemented.
- Service-role search finds usage only in the server env schema and `src/lib/supabase/admin.ts`, which imports `server-only`.
- Corrective migration `202608260004_m01_1_hardening.sql` preserves historical migrations and adds role tightening, last-owner protection, cross-tenant reference guards, audited approval decisions, and audited lease recovery.
- Remote suites are guarded by `TEST_ENVIRONMENT=true` and refuse production. Nine database cases prepare three-worker concurrency, state transitions, idempotency, leases, dependency ordering/cycles, batch limits, RLS A/B attacks, and the role matrix; four live E2E cases prepare autonomous dispatch/delegation, approval, and Auth/onboarding cleanup.

## Required before PASS

Execute `docs/production-validation.md` against an isolated Supabase project and a real Vercel deployment, retain command/test evidence, configure a Vault-backed Supabase Cron wake-up, and verify the live UI. No external result is marked PASS until it has actually run.

Real AI providers and all M02 marketing channels remain deliberately out of scope.

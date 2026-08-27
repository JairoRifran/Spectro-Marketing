# Deployment

1. Create Supabase and note URL, anon key, and server-only service role.
2. Apply migrations in filename order. Never run `seed.sql` in production.
3. Verify RLS and the private `brand-assets` bucket.
4. Import the Git repository into Vercel and set `.env.example` variables. Keep service role and Cron secret server-only.
5. Set canonical `APP_URL`, `AI_PROVIDER=mock`, demo flags false, and `DEPLOYMENT_ENVIRONMENT` to the matching environment.
6. Generate a random 32+ byte `CRON_SECRET`; store it in Vercel and Supabase Vault, never in SQL source.
7. Keep `AUTOMATION_ENABLED=false` through migration and smoke validation. Production may change it to `true` only after `/api/health`, Auth, RLS, and dispatcher-auth checks pass. Vercel Preview is blocked in code regardless of the flag.
8. Enable `pg_cron`, `pg_net`, and Vault. In Supabase SQL editor, store `APP_URL` and `CRON_SECRET` as Vault secrets, then create a one-minute job whose SQL reads both decrypted values at runtime and POSTs to `/api/internal/jobs/dispatch` with `Authorization: Bearer …`. Never place either value directly in a migration or job definition.
9. Invoke once; inspect `worker_health`, schedule event, task, runs, activity, and queued/running/stale counts.
10. Smoke-test signup → onboarding → HQ, refresh/logout, organization switching, and cross-organization isolation.

Environment policy:

| Vercel target | Supabase | `DEPLOYMENT_ENVIRONMENT` | `AUTOMATION_ENABLED` |
| --- | --- | --- | --- |
| Development | local/disposable | `development` | normally `false` |
| Preview | isolated non-production | `preview` | forced off by code |
| Production | production | `production` | explicit `true` only after validation |

Add the production site URL and `/auth/callback` URL to Supabase Auth redirect allowlists. Do not use Preview URLs in the production Cron job.

Manual smoke request, with local environment variables substituted:

```bash
curl -X POST "$APP_URL/api/internal/jobs/dispatch" -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{}'
```

This repository does not perform deployment or infrastructure mutation automatically. Follow `docs/production-validation.md` and retain its evidence before changing M01 to PASS.

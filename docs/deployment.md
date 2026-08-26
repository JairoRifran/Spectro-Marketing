# Deployment

1. Create Supabase and note URL, anon key, and server-only service role.
2. Apply migrations in filename order. Never run `seed.sql` in production.
3. Verify RLS and the private `brand-assets` bucket.
4. Import the Git repository into Vercel and set `.env.example` variables.
5. Set canonical `APP_URL`, `AI_PROVIDER=mock`, and demo flags false.
6. Generate a random 32+ byte `CRON_SECRET`; store it in Vercel and Supabase Vault, never in SQL source.
7. Enable `pg_cron`, `pg_net`, and Vault. In Supabase SQL editor, create a one-minute job that reads `APP_URL` and `CRON_SECRET` from Vault and POSTs to `/api/internal/jobs/dispatch` with `Authorization: Bearer …`.
8. Invoke once; inspect `worker_health`, schedule event, task, runs, and activity.
9. Smoke-test signup → onboarding → HQ and cross-organization isolation.

Manual smoke request, with local environment variables substituted:

```bash
curl -X POST "$APP_URL/api/internal/jobs/dispatch" -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{}'
```

This task performs no deployment or infrastructure mutation.

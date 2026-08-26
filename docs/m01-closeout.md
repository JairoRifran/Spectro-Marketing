# M01 closeout

Implemented: Next.js UI, Supabase Auth SSR clients, five-step onboarding, multi-tenant schema/RLS, eight agent roles, task state machine, dependencies, atomic claiming, event leases, schedules, retry/backoff, approvals, autonomy policy, provider-neutral runtime, deterministic autonomous/delegation loop, knowledge/memory schema and search, append-only activity, health, structured logs, demo/live separation, tests, and CI.

Manual validation still required against an isolated Supabase project: apply migrations, execute Postgres/RLS integration tests, configure Vault-backed Cron, and run credentialed auth E2E. Real AI providers and marketing integrations are intentionally outside M01.

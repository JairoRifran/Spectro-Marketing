# M02.1 closeout

## Scope delivered

- Persistent campaign, audience, research, messaging, channel, pillar, angle and strategy-version models.
- Controlled lifecycle, organization isolation, cross-tenant reference triggers, RLS, indexes and campaign-scoped task relations.
- Manual Sofía → Mateo → Valentina → Bruno → Sofía chain on the existing task runtime.
- Deterministic MockProvider, structured Zod outputs, prompt versioning, provider usage metadata and brand guardrails.
- Campaign list, objective-first creation, detail tabs, explainability, activity, approval/rejection and Marketing HQ summary.
- No content production, publishing, social APIs, spend, Cron dependency or background automation.

## Validation record

Populate the final evidence after running the complete closeout:

```text
lint: PASS
typecheck: PASS
unit/integration: 55 passed, 14 safely skipped without an isolated test project
build: PASS (Next.js 16.3.3)
playwright: 7 passed, 4 live tests safely skipped
Supabase migration: PASS in production; 8 campaign tables report RLS=true
Vercel production health: pending
```

Production acceptance requires `GET /api/health` to return HTTP 200 with `app=true` and `database=true`, while `AUTOMATION_ENABLED=false` and the Supabase Cron job remains inactive.

Local migration reset could not be run because neither Supabase CLI nor Docker is installed on this host. No cloud staging project was created. The forward-only migration was applied as a transaction through the existing production project's SQL Editor after lint, typecheck, tests, build and demo E2E passed. The scoped claim function was verified as `anon=false`, `authenticated=false`, `service_role=true`.

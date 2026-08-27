# M02.1 closeout

## Scope delivered

- Persistent campaign, audience, research, messaging, channel, pillar, angle and strategy-version models.
- Controlled lifecycle, organization isolation, cross-tenant reference triggers, RLS, indexes and campaign-scoped task relations.
- Manual Sofía → Mateo → Valentina → Bruno → Sofía chain on the existing task runtime.
- Deterministic MockProvider, structured Zod outputs, prompt versioning, provider usage metadata and brand guardrails.
- Campaign list, objective-first creation, detail tabs, explainability, activity, approval/rejection and Marketing HQ summary.
- No content production, publishing, social APIs, spend, Cron dependency or background automation.

## Validation record

```text
lint: PASS
typecheck: PASS
unit/integration: 57 passed, 14 safely skipped without an isolated test project
build: PASS (Next.js 16.3.3)
playwright: 7 passed, 4 live tests safely skipped
Supabase migration: PASS in production; 8 campaign tables report RLS=true
Vercel production health: PASS (HTTP 200, app=true, database=true)
```

## Production acceptance evidence

- Deployment `G8XNzWGhsvF1VA7fkPhvWmSghGic` for commit `1335a66` reached `Ready` on Vercel.
- `GET https://spectromarketing.vercel.app/api/health` returned HTTP 200 with `app=true` and `database=true` on 2026-08-27.
- Campaign `5e329d3a-65a1-49a4-90b3-d50ee3eee1c6` completed strategy version 1 with status `ready`, confidence `0.76` and provider `mock`.
- The persistent task chain completed in order: Sofía strategy draft, Mateo research, Valentina channel strategy, Bruno content plan, and Sofía final strategy.
- The resulting approval was decided as `approved`; approval did not publish, schedule or spend.
- The production UI continued to report `AUTOMATION_ENABLED=false` and “Automatización detenida”.
- Supabase `cron.job` reports `spectro-dispatch-every-minute` with schedule `* * * * *` and `active=false`.
- A first audited validation campaign exposed an empty `AI_PROVIDER` value from the Vercel environment. Commits `74d21b2` and `1335a66` normalized empty worker settings and provider resolution, with regression coverage, before the successful acceptance run.

Local migration reset could not be run because neither Supabase CLI nor Docker is installed on this host. No cloud staging project was created. The forward-only migration was applied as a transaction through the existing production project's SQL Editor after lint, typecheck, tests, build and demo E2E passed. The scoped claim function was verified as `anon=false`, `authenticated=false`, `service_role=true`.

# M02.2B closeout

## Status

`READY FOR PRODUCTION VALIDATION` — the vertical slice is complete and green locally. Nothing has
been applied to production: migration `202608270005` is written and tested but **not applied**,
and the branch is not merged.

## Scope delivered

- Deterministic planning from the campaign's own pillar weights, channels, formats and cadence.
- Bruno, Clara and Emilia as three task types on the existing runtime, with contracts that make
  role boundaries structural rather than advisory.
- Five persisted entities with RLS, indexes, foreign keys, cross-organization triggers and a
  database-enforced lifecycle.
- Content Studio: `/content` with seven filters and pagination, `/content/[id]` as an editorial
  review table with native previews per production shape.
- Approve, reject and request-revision through the M01 approval engine, with versioning that
  never overwrites a reviewed artefact.
- Campaign content progress, Marketing HQ operational counters and navigation entry.

## Validation record

```text
lint             PASS
typecheck        PASS
build            PASS (Next.js 16.3.3)
unit/integration 214 passed, 22 safely skipped without an isolated test project
test:content     157 passed
playwright       18 passed, 4 live tests safely skipped
```

The 22 skipped tests are the remote suites: they require `TEST_ENVIRONMENT=true` and an isolated
Supabase project, and the guard refuses production. `tests/integration/content-factory.test.ts`
covers the persisted chain, approval, revision-to-v2, invalid transitions and organization
isolation, and has never been executed because no isolated project exists.

## What is proven locally

- The chain runs end to end in unit tests: an approved campaign's configuration produces
  concepts, native variants per platform, a creative review and a passing quality gate.
- Variants of one concept stay differentiated across platforms; the duplication check reports
  zero errors on generated sets.
- The SQL transition table is asserted identical to the TypeScript one, so the two cannot drift.
- Demo E2E covers list, detail, both preview shapes, quality reporting, the duplication warning,
  the revision form's feedback requirement, and that an unapproved campaign offers no generation.

## What is not proven

- No migration has run against any database. The SQL is reviewed and unit-asserted, not executed.
- The persisted chain, RLS isolation and the revision-to-v2 flow are covered by integration tests
  that cannot run without an isolated Supabase project.
- No production smoke test.

## Production safety

```text
AUTOMATION_ENABLED   unchanged (false)
Cron                 unchanged (spectro-dispatch-every-minute, active=false)
Production migration none applied
Content published    none
External API calls   none
Budget spent         none
main branch          untouched
```

The factory has no scheduled entry point. Its only trigger is an authenticated, authorised human
action that first verifies the campaign strategy was approved.

## Next step

One integration pass: merge review, apply `202608270005` to production using the transactional
SQL Editor procedure from M02.1, deploy, verify health, then run the manual smoke test.

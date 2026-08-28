# M02.2B closeout

## Status

`IN PRODUCTION` — migration `202608270005` is applied, the branch is merged to `main`, and the
Content Factory has been exercised against the production database by a real human operator.
Four defects were found by running it and each was fixed with a regression that fails without
the fix. One validation remains open and is named at the bottom.

## Production record

| Item | Value |
| --- | --- |
| Migration | `202608270005_m02_2b_content_factory.sql`, applied, forward-only |
| Campaign | Content Factory run against the approved production campaign |
| Pieces produced | 11 approved + 1 quality-blocked |
| Platforms exercised | instagram, linkedin, tiktok, youtube_shorts |
| Blocked piece | `6ccf1423-4ccd-44ae-9934-269a116f12a6` (instagram / reel) |
| Published | nothing |
| Budget spent | nothing |

## Defects found by running it in production

Every one of these was invisible to the local suite and surfaced only against real data. Each
fix ships with a test that was confirmed to fail when the defect is reintroduced.

### 1. LinkedIn planned a format it cannot produce

The planner offered `document_post`, the adapter produced a text post, and the shape check
rejected the mismatch. `resolveFormat` now takes the adapter's own producible set as the
preferred list, so an adapter can never be asked for a format it does not implement.

### 2. A content decision was rendered as the campaign's strategy decision

Content approvals carry `campaign_id`, so the campaign strategy query matched them. The panel
showed a content decision as the strategy decision, and its Approve button would have decided
the wrong artefact. The query now filters `content_item_id is null`. Fixed in `0f853a6`.

### 3. An Instagram reel shipped without video direction

The Instagram adapter described a carousel and a reel with identical fields, so a reel carried
no `videoDirection` and no duration. The quality gate blocked it — 26/27 checks,
`content.missing_video_direction` — which is the gate working correctly on a defect upstream of
it. The adapter now branches on the produced format. Fixed in `29c2c71`.

The regression for this one covers the whole class rather than the single case: it walks every
platform/format pair an adapter claims it can produce and asserts the draft clears the quality
gate. Any future adapter that omits a required field for one of its formats fails in tests.

### 4. A blocked piece had no way forward

A piece the quality gate sends back has no open approval, so `/api/content/[id]/decision`
answered `409 no_open_approval` and `/content/[id]` rendered no actions at all. `needs_revision`
and `rejected` were dead ends: the only exit was editing the database by hand.

A rewrite is the one outcome that does not require a pending decision, so it no longer demands
one. Approve and reject still go through the M01 approval engine untouched, and the UI hides
them where there is nothing to decide. Fixed in `e5377e9`.

## Corrections to earlier documentation

Two claims recorded earlier in this milestone were wrong and are corrected here.

**The synchronous runner does not prevent live progress.** It was previously stated that because
the Content Factory runs inside the request that triggers it, progress could not be observed
until the run finished. This is false and was disproven in production: the pipeline view polls
on an independent request, so stage transitions were visible while the run was still in flight.
Nothing about the runner architecture was changed to achieve this.

**YouTube was exercised in production.** It was previously stated that the `youtube` →
`youtube_shorts` channel-code mapping had not been covered by a production run. It was: the run
produced `youtube_shorts` pieces, so the mapping was exercised end to end against real campaign
configuration, in addition to its unit regression.

## Validation record

```text
lint             PASS
typecheck        PASS
build            PASS (Next.js 16.3.3)
unit/integration 234 passed, 22 safely skipped without an isolated test project
test:content     177 passed
playwright       21 passed, 4 live tests safely skipped
```

The 22 skipped tests are the remote suites: they require `TEST_ENVIRONMENT=true` and an isolated
Supabase project, and the guard refuses to run against production.

## Production safety

```text
AUTOMATION_ENABLED   unchanged (false)
Cron                 unchanged (spectro-dispatch-every-minute, active=false)
GET  /api/health     200, app=true, database=true
POST /api/internal/jobs/dispatch  503 automation_disabled
Content published    none
External API calls   none
Budget spent         none
Historical campaign  the campaign left in Researching is untouched
```

The factory still has no scheduled entry point. Its only trigger is an authenticated, authorised
human action that first verifies the campaign strategy was approved.

## Open

The revision chain — request revision → v2 → Emilia → quality gate → waiting_approval → approve
v2 — has not yet been walked in production. It is covered by integration tests that cannot run
without an isolated project. The fix in `e5377e9` makes the blocked Instagram reel the natural
subject: rewriting it exercises the full chain, and the corrected adapter should now clear the
gate that blocked v1.

# Project state, for whoever picks this up next

## Status

`LIVE ON A REAL MODEL` — Campaign Brain and the Content Factory both run against Claude in
production. One campaign has been produced end to end by a person pressing buttons: five
strategy stages, a content plan, eight LinkedIn pieces, images, and a human approval. Nothing has
ever been published to a social network, because no channel is connected yet.

Read `AGENTS.md` first for the rules. This file is the other half: where the code actually is,
what is half-built, and the failure modes that cost hours today and would cost them again.

## What runs, and on what

| Layer | State | Notes |
| --- | --- | --- |
| Campaign Brain | Real model | Five stages, chained, resumable |
| Content Factory | Real model | Plan is deterministic on purpose; copy and review are the model |
| Images | Real, free provider | One per request, keyless |
| Voice and music | Real, ElevenLabs | Behind the spend ceiling |
| Social publishing | Code exists, never run | No channel connected, no credentials |
| Autonomous execution | Off | `AUTOMATION_ENABLED=false`, cron inactive. Not negotiable |

`AI_PROVIDER=anthropic` in production. `/api/health` reports the deployed commit and the
configured provider — use it before debugging anything, because half of "it does not work" is a
deploy that has not landed.

## The constraint that shapes everything

Vercel Hobby gives a function sixty seconds. Every design decision below follows from that, and a
change that ignores it will look correct and fail in production only.

- **One stage per HTTP request.** Both the campaign chain and the factory used to attempt their
  whole pipeline in one call, which was invisible while a deterministic provider answered in
  milliseconds. With a model it is twenty-five paid calls inside a function that stops at sixty
  seconds. `stepsPerCall()` returns 1 when a real provider is configured.
- **The screen drives the loop.** The endpoint advances what it can and returns `done` and
  `nextAttemptAt`; the button asks again, waiting out retries. It also resumes on mount, because
  the loop lives in the page and a reload used to abandon a run.
- **Effort is turned down, and that is a trade, not a tuning.** Only `campaign.strategy.draft`
  and `content.copy` run above `low`. Everything else timed out at `medium` or `high`. Pillars
  and angles are genuine judgement and currently get less thought than they deserve. **On a plan
  with longer functions, raising these back is a three-line change and the first thing to do.**
- Per-stage `max_tokens` matter more than effort for wall-clock: adaptive thinking spends from
  the same budget, so a flat 16k let a stage with a dozen short lists think to the deadline.

## Traps that already cost a day

Every one of these was found by running it in production, and each has a regression test.

**Structured outputs compile a grammar, and it can be too large.** The full variant schema
carries all five production shapes at once and the API refused it outright:
`"The compiled grammar is too large"`. The writer is now asked for only the shape its platform
and format resolve to, taken from the deterministic adapter rather than a mapping restated in the
provider. Halving the schema fixed it. If another agent's schema grows, this is the first suspect.

**The API strips constraints it cannot enforce.** `maxLength`, `maxItems` and `minimum` become
description text, so the model can return twenty-five items where the schema allows twenty and
the API accepts it — the SDK then rejects it client-side when `parsed_output` is read. That read
must stay inside the try block; it used to sit after it and threw a bare ZodError past every
translation.

**A bare `Error` reaching the boundary destroys the diagnosis.** `publicError` turns anything
that is not a `DomainError` into `internal_error / No pudimos completar la operación`, which fits
every failure and identifies none. Diagnosing one production failure cost four deploys because of
this. Persistence helpers and the dispatcher now throw `DomainError` carrying the database's own
code. **Do not add a bare throw to any path a task runs through.**

**Leases were computed and never read.** `claim_campaign_task` only claimed `queued`, so a task
whose worker was killed stayed `running` forever and the campaign reported itself busy with no
way out. The general dispatcher had recovered expired leases correctly all along; the campaign
path simply never got it. Fixed in `202608290001`.

**Both run tables are unique on (task, attempt).** Re-running an attempt collides with `23505`.
Both `task_runs` and `agent_runs` upsert now. Fixing only one moved the same failure one line
down and looked like no progress at all.

**`has_org_role` takes `public.organization_role[]`.** An uncast array literal is `text[]` and the
policy fails at create time. Every policy in the schema casts it; a test now asserts new ones do.

**A `Success. No rows returned` in the SQL editor is not proof.** An insert whose `from org, (...)`
cross join found no organization looks identical to one that worked. DDL is different — there
`Success` is conclusive.

**CSS can hide a working feature.** The generated image rendered correctly into the DOM and was
invisible for an hour: `.mock-post.is-text .mock-media{display:none}`, written when a text post
never had media. No error, no gap, just an absence that looked like a decision.

**The pipeline called a queued task "Trabajando ahora".** Nothing drains the queue on its own, so
that turned "nobody pressed the button" into "this has hung" and sent two people looking for a
fault instead of a button.

## Where the integrations stand

`Configuración → Integración` exists, with two gates that move independently:
`content_approval_mode` (`human` | `automatic`) and `publishing_mode` (`human_review` |
`autonomous`). Both default to the safe value **in the database**, and an unreadable value reads
as the safe one. Relaxing either asks for a typed word; restoring is one press.

When content approval is automatic, a piece that passes the deterministic gate is marked approved
and recorded as `content.approved_by_policy`. **Never write it as an ordinary approval** — that
would file a piece nobody read alongside a piece someone signed.

LinkedIn is the furthest along and is the right one to finish first: fastest review, and the only
channel with content already produced.

- OAuth start and callback: **built**. State is signed and expiring; the callback trusts nothing
  in the query string but the code.
- Tokens: `social_tokens`, RLS enabled with **no policy**, service role only. Same for
  `social_app_credentials`, which lets an organization bring its own developer app — the normal
  path is one platform-wide app and a customer who enters nothing.
- Publisher: **built and never executed**. Request shape read from LinkedIn's current Posts API
  docs. Two things memory would have got wrong: the `Linkedin-Version` header is dated and
  versions are sunset on a schedule (202508 died 17 Aug 2026), and the created post id comes back
  in the `x-restli-id` header, not the body.
- Publication records: `content_publications`, reserved before the call under a partial unique
  index over successes. Publishing is not idempotent at LinkedIn — the same text twice is two
  posts — so the guarantee is the database's, not a check in code.

### What is missing to publish for real

1. A LinkedIn developer app, created by a person, with `w_organization_social` granted. Nothing
   in this repository can do this.
2. `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` as server environment variables.
3. The company page's numeric id, stored as `social_integrations.external_account_id`. There is a
   field for it on the channel card; it is the number in `linkedin.com/company/<id>/admin`.
4. Nothing else. The publish button is on every approved LinkedIn piece, it names the page in its
   confirmation, and it shows the live post once one exists.

## Standing constraints

These come from the product owner and are not open for optimisation.

- `AUTOMATION_ENABLED=false` and cron inactive. Autonomous execution stays off.
- Never delete the historical campaign left in `Researching`.
- Migrations are forward-only. Correct with a new timestamp; never edit an applied one.
- Credentials never appear in the repository, in a chat, or in a response body.
- Do not merge over unreviewed work from another agent.

## The honest weak points

Named because a handover that only lists achievements is a handover that hides the work.

- **Strategy quality is capped by the plan, not by the prompts.** Three of five stages run at
  `low` effort to fit sixty seconds.
- **Nothing has been published, ever.** The publisher is untested against the real API. Treat the
  first real call as an experiment, on a piece you would not mind seeing on the page.
- **The two legal pages exist but are not reviewed.** They are required to submit a Meta or
  LinkedIn app and they state facts accurately, but nobody qualified has read them.
- **The M02.2B revision chain has still never been walked in production.**
- **Credential encryption is implemented but still needs production cutover evidence.** New app
  secrets and social tokens are encrypted with server-side AES-256-GCM before they reach Supabase;
  historical plaintext is rewritten on first protected read. Production still needs
  `CREDENTIAL_ENCRYPTION_KEY` configured and every existing integration exercised before anyone
  can claim that all historical rows are encrypted. See `docs/credential-encryption.md`.

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

## Campaign knowledge fidelity

Campaign Brain now receives the actual content of the tenant's latest knowledge items, plus the
full brand, product, and persona records. The earlier implementation passed only names and titles;
that made the knowledge screen look complete while leaving the model to infer almost everything.
Knowledge content is capped per item and by item count so later stages still retain their upstream
outputs within the provider's context bound.

Spectro's managed product knowledge states the current positioning as **governed end-to-end
automation**: the workflow can run from objective through strategy and production to a configured
publisher, while content approval and publishing remain independent controls. This describes a
capability, not a fabricated production result. Cron remains off, no channel is connected, and no
real social publication has happened yet.

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
- **Effort is turned down, and that is a trade, not a tuning.** Every strategic stage now runs at
  `low`; only `content.copy` and `content.creative_review` are above it, at `medium`. Each one was
  lowered after it timed out, the draft last of all — six attempts out of six on a campaign whose
  input had grown by a paragraph. There is no headroom left on this plan. Pillars, angles and
  positioning are genuine judgement and currently get the least thought the platform allows.
  **On a plan with longer functions, raising these back is a three-line change and the first
  thing to do.**
- **A timeout is our own deadline, so it gets three attempts and not six.** Re-asking an unchanged
  request that already ran long buys the same answer again and charges for it. Every other kind of
  failure keeps its full budget: a rate limit or an unreachable vendor is worth waiting out.
- Per-stage `max_tokens` matter more than effort for wall-clock: adaptive thinking spends from
  the same budget, so a flat 16k let a stage with a dozen short lists think to the deadline.

## Spending less

The question that produced this section was "can we use a local model instead". It is the right
question with a measured answer, and the answer is mostly no — but not entirely.

**What was measured**, on the development machine (Intel Iris Xe, no discrete GPU, 16 GB):

| | Result |
| --- | --- |
| Free generation, `qwen2.5:3b` | ~11–13 tokens/s |
| Prompt reading | under 40 tokens/s |
| A real research stage, full schema | **did not finish in ten minutes** |
| A small schema, short prompt | 503 tokens in 44 s — fine |
| Factual quality | invented a market size and two institutions, one of which does not exist in Uruguay |

That last row is the one that decides it. Asked about a market it knows nothing about, and under
this project's own "do not invent figures" rule, the small model did not decline — it fabricated,
with named sources. Fabricated numbers wearing a source are the exact failure this product exists
to prevent, and `campaign.research` is where the temptation peaks. So research is escalated to the
paid model in `hybrid`, alongside the draft and the copy.

**`AI_PROVIDER=ollama` and `hybrid` exist and work.** The provider is real, tested, and streams
(it must: unstreamed, Node stops waiting for headers at five minutes and the failure looks exactly
like a refused connection). What it is genuinely good for today is development and end-to-end
tests — a stage that takes minutes is fine when nobody is waiting, and it costs nothing. On a
machine with a real GPU and a 30B-class model, `hybrid` becomes a serious option; the split is
already written down in `src/server/agents/provider.ts` and overridable with `AI_JUDGEMENT_TASKS`.

**A local model cannot serve production here anyway.** Vercel functions cannot reach a model on
somebody's laptop. Running the chain locally against the production database is possible — the
dispatcher is a function of (database, provider), and the whole design already assumes it is
awakened from outside — but then campaigns only advance while that machine is awake.

**What was done about the cost, and what it bought.** Three changes, in the order they matter:

1. **Every run now records what it cost.** `agent_runs` carries `input_tokens`, `output_tokens`,
   `cache_read_tokens`, `cache_write_tokens` and `cost_usd`, and the campaign page shows the
   total next to what the same calls would have cost with nothing cached. Tokens are the fact and
   are stored as such; the dollars are derived at write time from a price table dated in
   `src/server/agents/pricing.ts`, so a row stays recomputable if prices move. **Read this before
   tuning anything else** — two stages were already tuned in the wrong direction on estimates.
2. **The organisation block is cached.** The brand, products, personas and knowledge base are
   identical across all five stages of a campaign and were re-sent at full price on every one of
   them, plus once per retry. `cacheableContext()` splits the task input into a stable half and a
   volatile half; the stable half carries the cache breakpoint, so the system prompt is cached
   with it. Two rules keep it working and both are tested: keys are **sorted** before
   serialising, and the split is an **allowlist** — an unlisted key costs a cache hit, while a
   per-piece value inside the prefix would mean it never hits *and* pays the write premium every
   call.
3. **Only two stages still run on Opus.** The strategy draft and the copy — the positioning and
   the text a customer reads. Research, channels, pillars, the final brief and the creative
   review moved to Sonnet 5 ($2/$10 against $5/$25). Haiku 4.5 is cheaper still and was not
   taken: it predates the 4.6 API and rejects both adaptive thinking and `output_config.effort`,
   so it is a second request shape to maintain, not a swap.

**If `cache_read_tokens` is ever zero across a whole campaign, something silently invalidated the
prefix.** That is the one number worth watching; the page shows it.

Two things follow from this that are not done. Caches are model-scoped, so splitting stages
across two models splits the cache with them — worth re-measuring now that the numbers exist. And
nothing yet aggregates cost across campaigns; the per-campaign figure is the only view.

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

**A terminal provider failure closed both doors.** The campaign had already moved to
`researching`, so starting again was rejected; the failed task was no longer queued, so resuming
found nothing. The campaign page now offers an explicit retry for the failed strategy stage. It
requeues the same task, preserves every completed predecessor and run record, audits the action,
and never retries a terminal failure merely because someone opened the page.

## Where the integrations stand

`Configuración → Integración` exists, with two gates that move independently:
`content_approval_mode` (`human` | `automatic`) and `publishing_mode` (`human_review` |
`autonomous`). Both default to the safe value **in the database**, and an unreadable value reads
as the safe one. Relaxing either asks for a typed word; restoring is one press.

When content approval is automatic, a piece that passes the deterministic gate is marked approved
and recorded as `content.approved_by_policy`. **Never write it as an ordinary approval** — that
would file a piece nobody read alongside a piece someone signed.

LinkedIn is the furthest along in code and the **wrong one to finish first**, which was learned by
trying. The app exists and the page is verified, but the Community Management API -- the product
granting `w_organization_social` -- has its request button disabled: it is Development Tier, and
those are granted through LinkedIn's partner programme, a commercial process rather than a form.
The only self-serve product that posts is "Share on LinkedIn", and it posts as the person.

The owner declined personal posting, so this channel is parked until someone decides whether the
partner programme is worth pursuing. The other four gate publishing behind an app review, which is
slow but finishable by one person, and the catalogue is ordered accordingly.

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
- **Credential encryption is live.** New app secrets and social tokens are encrypted with
  server-side AES-256-GCM before they reach Supabase; historical plaintext is rewritten on first
  protected read. Production reported `credentialEncryption: true` on 2026-08-29. The integration
  screen showed no connected channel and no organization-owned app at cutover, so this
  organization had no historical integration secret waiting to be rewritten. See
  `docs/credential-encryption.md` for the envelope and rotation procedure.

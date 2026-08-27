# Content Intelligence

The editorial reasoning layer that M02.2 Content Factory will run on. It owns everything from
editorial strategy downwards: what an idea is, how each platform executes it natively, and
whether the result is publishable.

It does not publish, call any social network, generate media, or create tables.

## The founding principle

Spectro must never do this:

```text
write one text → paste it on every network
```

One idea becomes several native executions. The same concept — *five marketing tasks your team
could stop doing by hand* — is a carousel on Instagram, a spoken piece to camera on TikTok, a
retention-shaped explainer on YouTube Shorts, a grounded argument on LinkedIn, and a
context-heavy community post on Facebook. Different structure, different register, different
length, one identity.

The principle is enforced in three places, not only documented:

- **Playbooks** carry each platform's rules separately, and `getPlaybook` throws for a platform
  without one rather than falling back to a neighbour. A silent fallback is exactly how one
  text ends up everywhere.
- **Adapters** write from the concept, never from another platform's execution.
- **Duplication detection** fails a set whose variants are lexically the same text.

## The chain

```text
Campaign Strategy        (M02.1 Campaign Brain — not this module)
        ↓  ContentPlanInput
Bruno    Content Strategist   → ContentConcept, one ContentBrief per platform
        ↓  ContentBrief
Clara    Copywriter           → PlatformContentVariant, hook variants
        ↓
Emilia   Creative Director    → ContentReviewResult (visual direction)
        ↓
Platform Intelligence         → per-platform native execution
        ↓
instagram · facebook · tiktok · youtube_shorts · linkedin
```

Roles are keyed on the stable M01 agent role (`content_strategist`, `copywriter`,
`creative_director`), never on the display name. See `src/server/content/roles.ts`.

## Modules

| Path | Owns |
| --- | --- |
| `platforms.ts` | Platform and format taxonomy, the compatibility matrix, production shapes |
| `content-types.ts` | Editorial intent taxonomy and funnel stages |
| `hooks.ts` | Hook taxonomy, per-platform selection, which shapes assert an outcome |
| `ctas.ts` | Call-to-action taxonomy and coherence with the campaign objective |
| `playbooks/` | One editorial playbook per supported platform |
| `schemas/` | Zod contracts: concept, brief, variant, formats, review, lineage |
| `adapters/` | Per-platform translation and the deterministic mock generator |
| `quality/` | Brand, claims, safety, duplication, mix and the evaluator |
| `prompts/` | Versioned, provider-neutral templates |
| `structured-output.ts` | The only door model output passes through |

## Schemas

`ContentConcept` is the idea before anyone writes. `ContentBrief` is the contract between
Bruno, Clara and Emilia, and is per platform and per format. `PlatformContentVariant` is one
platform's execution; its `detail` is a discriminated union on production shape, so a Reel
carries `ShortVideoScript`, a carousel carries `Carousel`, a story carries `StorySequence` and
a LinkedIn post carries `TextPost`. That split is what keeps the variant schema maintainable
instead of one object with forty optional fields.

## Content identity and lineage

Every variant born from one idea carries the same `conceptId` (`CONCEPT-42`). That identity is
what makes cross-platform analytics possible later: five native executions stay recognisable as
one idea.

`ContentLineage` models the chain `campaign → concept → brief → variant → review → approved` as
a domain contract only. **No table is created.** Campaign Brain owns campaign persistence and
adding content tables now would collide with M02.1.

Recommended persistence once M02.1 has landed:

- `content_concepts` — organisation-scoped, `concept_id` unique per organisation, campaign FK.
- `content_briefs` — one row per concept and platform, RLS by `organization_id`.
- `content_variants` — one row per brief, with `generated_by` and the review result.
- `content_reviews` — findings, kept append-only for auditability.

All four follow M01 conventions: `organization_id` on every row, RLS enabled, forward-only
migrations, and an idempotency key per logical write.

## Providers

Nothing here calls a provider. When one is wired in, it implements the existing M01
`AgentProvider` contract and its output crosses `structured-output.ts`, which parses, validates
against a Zod schema, and returns either a typed value or a typed failure. A malformed structure
is retryable; `JSON.parse` followed by trust is not reachable by construction.

Prompt templates are versioned code (`copywriter.platform_variant.v1`) and provider-neutral: a
test asserts no template mentions a vendor.

## Deliberately out of scope

No UI, no `/content` route, no sidebar change. No external API, OAuth, publishing or ads. No
image, video, Remotion, TTS or music generation — though the schemas already state what those
systems will need (`visual`, `videoDirection`, `scenes`, `onScreenText`). No autonomous research;
that is Campaign Brain's.

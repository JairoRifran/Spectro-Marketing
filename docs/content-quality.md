# Content quality

`evaluateContent` is the deterministic gate that runs before any model-based reviewer is ever
introduced. Every check is a pure function of the brief, the variant and the platform playbook,
so a failure is reproducible and explainable without re-running a provider.

Run the suite with:

```bash
pnpm test:content
```

## What it returns

`ContentReviewResult` carries `passed`, `errors`, `warnings`, `brandIssues`, `platformIssues`,
`claimIssues`, `recommendations` and a `score`.

The score is **passed checks out of checks run** — `9/11`, not `92.7% chance of virality`. There
is no viral score in this system and no field where one could be added without changing the
schema. A test asserts the result never contains a predicted-performance figure.

`passed` is false when any `error` is present. Warnings never block; they are what a human should
look at on purpose.

## Checks

**Coherence** — the variant belongs to the brief's concept, platform and format.

**Platform** — the platform supports the format; the detail matches the format's production
shape; the hook fits the platform word budget; the hook type suits the platform and content type
and is not one the playbook discourages; the caption sits inside the platform range; a video's
estimated duration sits inside the platform range.

**Content** — a hook exists; a call to action exists; a video shape carries video direction; a
visual shape carries visual direction.

**CTA coherence** — the ask is one the campaign objective has earned. An awareness campaign may
ask for a save or a follow; it may not demand a purchase. The rule is one-directional: a sales
campaign asking for a save is a soft ask, not an incoherent one.

**Brand** — forbidden words, forbidden claims, preferred terminology, and the register ceiling.
M01 stored the brand kit but never enforced it anywhere in code, so this is the first
implementation rather than a duplicate. Extend `quality/brand.ts` when the brand kit grows.

**Claims and evidence** — guarantee language is an error outright; a figure with no declared
claim behind it is an error; a declared claim with no `evidenceRefs` is an error; a hook shape
that asserts an outcome without evidence is a warning. The goal is not to judge truth, which code
cannot do, but to refuse to wave a measurable assertion through unattached.

**Safety** — credentials, tokens, connection strings, server-only environment variable names,
internal instructions, reasoning traces and personal data. Narrow on purpose: this is not a
moderation system.

**Duplication** — the check the whole layer exists for. See below.

**Mix** — plan-level diagnostics, warnings only.

## Cross-platform duplication

Lexical similarity, no embeddings. Two measures are taken and the higher wins: token-set overlap
survives reordering, character-trigram overlap survives synonym-free edits, and combining them
makes the check harder to game by shuffling clauses.

| Similarity | Result |
| --- | --- |
| ≥ 0.82 | `duplication.cross_platform` — **error**, this is one text on two networks |
| ≥ 0.65 | `duplication.weak_differentiation` — warning |
| hooks ≥ 0.82 | `duplication.repeated_hook` — warning, bodies diverged but openings did not |

The repeated-hook case matters: it is the most common way a supposedly native set still reads as
one piece repeated.

Starting lexical is a deliberate floor, not a limitation to apologise for. A copy-paste across
platforms is a lexical event, and the outcome is a finding a human resolves — nothing is
rewritten automatically.

## Content mix

No universal correct ratio exists, so nothing decides a formula or edits a plan. Warnings only:

- more than half the plan promotional → `overly_promotional content mix`
- one content type above 70% of the plan → single-type dominance
- four or more pieces with no awareness content at all → the plan assumes an already-interested
  audience

## Evaluation fixtures

`tests/fixtures/content/` holds named scenarios so a regression names the rule it broke:
`goodTiktokScript`, `goodLinkedinPost`, `badTiktokCopyPaste`, `duplicateVariants`,
`forbiddenClaim`, `undeclaredFigure`, `missingCta`, `brandViolation`, `unsafeContent`,
`incoherentCta`.

`badTiktokCopyPaste` is the important one: the Instagram text pasted into TikTok, the exact
failure this layer exists to prevent.

## Mock content

`generateMockVariants` is deterministic — same input, same output, no provider call and no
randomness. Everything it returns is marked `generatedBy: "mock"` and carries a metadata banner.
Any UI that eventually renders content must refuse to present these as AI-generated.

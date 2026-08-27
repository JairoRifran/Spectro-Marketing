# Content Factory

M02.2B turns an **approved** campaign strategy into native per-platform content that a person
reviews before it is approved. It publishes nothing.

## Where it sits

```text
M02.1 Campaign Brain          strategy: objective → campaign → pillars, angles, channels
        ↓  approved strategy
M02.2B Content Factory        this module: planning, production, review, persistence, UI
        ↓  uses
M02.2A Content Intelligence   playbooks, adapters, hooks, CTAs, schemas, quality engine
```

Content Intelligence is the reference layer and is never duplicated. The factory calls
`getAdapter`, `getPlaybook`, `evaluateContent` and `checkDuplication`; it does not restate the
platform↔format matrix, the hook taxonomy or the brand rules.

## The chain

```text
Approved campaign
   ↓  human action: Generate Content Plan
Bruno    content.plan             → ContentConcept[]  → content_concepts + content_items
   ↓
Clara    content.copy             → PlatformContentVariant → content_variants (version N)
   ↓
Emilia   content.creative_review  → creative direction  → content_reviews
   ↓
Quality  ContentQualityEvaluator + cross-platform duplication
   ↓
waiting_approval → M01 approval engine → approved / rejected / revision
```

Every stage runs on the existing task runtime with the same claim, lease, retry and activity
semantics as M01. There is no second engine.

### Bruno — planning

Volume and shape come from the campaign, never from a constant. `planChannels` reads
`campaign_channels` (enabled, priority, declared formats, publishing frequency) and the campaign
duration; `distributeByPillars` spreads the pieces over `campaign_content_pillars` weights using
largest remainder, because an exact proportional split is usually impossible at small counts.
What it cannot honour it reports as a warning rather than hiding.

A format the platform cannot produce is dropped with a warning, and Campaign Brain's channel
code `youtube` is mapped onto Content Intelligence's `youtube_shorts` so a configured channel is
never silently lost.

### Clara — copy

Receives a `ContentBrief` and returns one `PlatformContentVariant` plus hook alternatives, each
with a short user-facing rationale and its risk. She does not decide objective, strategy,
audience, budget or channels: those arrive settled in the brief.

### Emilia — creative direction

Returns visual direction, storyboard, motion and composition notes. **Her output schema has no
copy field**, so she structurally cannot rewrite Clara's text — the constraint is enforced by the
contract rather than asked for in a prompt.

## Persistence

| Table | Holds |
| --- | --- |
| `content_concepts` | the editorial idea, one per concept and campaign |
| `content_items` | the reviewable unit: one concept on one platform in one format |
| `content_variants` | the artefact at version N |
| `content_reviews` | Emilia's direction and the quality outcome for version N |
| `content_versions` | why version N exists: reason, feedback, who asked |

The brief lives as structured JSON on the item because it is a snapshot of a contract that is
always read whole. Splitting it into columns would buy queryability nobody needs and cost the
guarantee that a version's brief is exactly what the writer received.

`content_variants` and `content_versions` are separate on purpose: one is *what* the version
contains, the other is *why it exists*. That is what makes a revision auditable.

All five tables carry `organization_id`, RLS, indexes, foreign keys and cross-organization
reference triggers.

## Lifecycle

```text
concept → brief → generating → creative_review → ready → waiting_approval → approved
                        ↓              ↓                        ↓
                  needs_revision ←─────┘                    rejected → needs_revision
```

`needs_revision` returns to `generating`, never straight to `ready`: a new version has to be
reviewed again before it can be offered for approval.

The transition table exists twice — in `src/server/content-factory/lifecycle.ts` and in the
`enforce_content_transition` trigger — because content is durable state and a write that skipped
the application guard must still be rejected. A unit test asserts the two tables are identical,
so they cannot drift.

## Approvals and revision

Approval reuses the M01 engine unchanged. A piece reaching `waiting_approval` opens an approval
row and appears in `/approvals`.

The trigger maps decisions literally: approved means approved, rejected means rejected. **A
revision is not inferred from whether a note is empty.** It is an explicit second step: the
rejection is recorded, the piece moves `rejected → needs_revision`, and a new Clara task is
created carrying the human feedback. The previous version is never touched.

## Quality

`evaluateContent` runs before a piece can be offered for approval, plus a cross-platform
duplication check against the other variants of the same concept. A piece with blocking errors
goes to `needs_revision` instead of `ready` — it cannot reach an approval queue silently.

The stored result is `checksPassed / checksTotal` with the findings. There is no viral score, no
predicted reach and no conversion estimate; nothing is published, so any such number would be
invented.

## Safety

The factory runs only from an explicit human action that first verifies the campaign strategy was
approved. It does not touch `AUTOMATION_ENABLED`, does not depend on Cron, opens no external
connection, publishes nothing and spends nothing. The manual runner claims only tasks belonging
to one campaign.

Mock output is marked `generated_by = 'mock'` in the database and shown as `MOCK` in the preview,
so deterministic test content can never be mistaken for model output.

## Not in this module

No social API, OAuth, publishing, scheduling or ads. No image, video, Remotion, TTS or music
generation — though the schemas already carry what those systems will need. No analytics.

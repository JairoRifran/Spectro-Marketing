# Campaign Brain

Campaign Brain transforms an existing business objective into a structured strategic campaign. It is objective-first rather than a free-form chat and stops before content production.

## Lifecycle

`draft → researching → strategy → ready → active → paused/completed`

Campaigns may be cancelled from non-terminal states. A rejected `ready` strategy returns to `strategy`, preserving its prior `campaign_strategy_versions` row; the next manual run increments the version. PostgreSQL rejects invalid transitions.

## Manual workflow

1. An authenticated owner, admin or member creates a campaign linked to an Objective.
2. `Run Campaign Brain` creates `campaign.strategy.draft` for Sofía.
3. The existing Agent Runtime records task runs, agent runs, leases, outputs and activity.
4. Sofía delegates `campaign.research` to Mateo.
5. Mateo persists a research report and delegates `campaign.channel_strategy` to Valentina.
6. Valentina persists scored channel recommendations and delegates `campaign.content_plan` to Bruno.
7. Bruno persists weighted pillars and creative angles and delegates `campaign.strategy.finalize` to Sofía.
8. Sofía validates brand guardrails, writes a versioned Campaign Brief, marks the campaign `ready`, and requests human approval.

The manual runner uses the same execution function as the global dispatcher, but its database claim is restricted to one `campaign_id`. It does not materialize schedules, claim events, claim unrelated tasks, or depend on Cron. The background kill switch remains unchanged.

## Research honesty

`campaign_research.research_mode` is either `knowledge_based` or `external`. The MockProvider uses `knowledge_based` and records sources from tenant Brand, Products, Personas and Knowledge. Assumptions and `requires_external_research` are separate first-class fields. Empty competitor data is preferable to invented findings.

## Provider and prompt boundary

Prompt identifiers live in `src/server/campaigns/prompts.ts`. Outputs are validated by the schemas in `src/server/campaigns/schemas.ts` before persistence. Agent runs retain provider, nullable model/token/cost metrics, latency and prompt version. `MockProvider` produces deterministic artifacts for tests; configuring a future provider does not change campaign tables or workflow semantics.

## Guardrails and approvals

Brand forbidden words and forbidden claims are normalized and checked against strategic copy before `ready`. Campaign constraints are included in the guardrail report. The approval proposed change explicitly states that there are no external side effects. Approval records the decision; rejection captures human feedback and enables a new strategy version. No social APIs, publishing, scheduling, ads, images or videos exist in M02.1.

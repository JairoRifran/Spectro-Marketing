# Task engine

The database enforces the state machine. Terminal tasks cannot restart arbitrarily. `claim_ready_tasks` repairs expired leases and claims a bounded eligible set atomically with `FOR UPDATE SKIP LOCKED`. Eligibility requires due time, attempts remaining, completed dependencies, and approval where required.

Failures use bounded exponential backoff. Retryable work returns to `queued`; exhausted or non-retryable work becomes `failed`. Unique `(organization_id, idempotency_key)` constraints prevent duplicate logical tasks. A trigger rejects dependency cycles and cross-organization edges.

Explainability includes source event, creator, parent, objective, reason, impact, confidence, context, result, dependencies, runs, approvals, and activity.

# Event engine and scheduler

Events are persistent rows with unique keys, availability, attempts, errors, and leases. `claim_pending_events` uses the atomic task-claim pattern. M01 maps `cmo.daily_review.requested` to one deterministic CMO task.

Schedules store cron, timezone, event template, next occurrence, and idempotency prefix. `materialize_due_schedules` creates exactly one event per occurrence. Supabase Cron only wakes the HTTPS dispatcher; it does not own workflow state and no process loops forever.

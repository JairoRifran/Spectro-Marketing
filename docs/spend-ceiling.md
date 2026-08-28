# Spend ceiling

The first thing in Spectro that can cost real money is generating media. Everything before it
was free: the mock provider costs nothing and nothing is published. So the ceiling is not a
feature of media generation, it is the precondition for it.

## Posture

**Default deny.** A limit that was never configured is zero, and zero authorises nothing.
Unconfigured must never read as unlimited. This is the same posture as `AUTOMATION_ENABLED`
being false: the system does nothing expensive until somebody sets a number on purpose.

**Every scope must allow it.** An organization ceiling always applies. A campaign ceiling is
optional but binding when present. The answer is no if any scope says no.

**Estimate before, record after.** The check runs against what the call is expected to cost,
because once the call returns the money is already gone.

**Deny whole, never trim.** A request that does not fit is refused, not silently shortened into
something cheaper than what was asked for.

## Why the decision lives in the database

A check in application code is a read that has already gone stale by the time the write happens.
Two concurrent requests each read "there is room", each proceed, and the ceiling has failed —
and under a retrying worker that is not a rare race.

`reserve_spend` locks the applicable limits, reads the balance, decides and writes the
reservation in one transaction. A concurrent caller waits rather than reading a balance that is
about to change.

## Reserve, settle, release

1. **Reserve** — a ledger row is written with the estimated cost before the vendor is called. A
   reservation counts against the ceiling immediately: money in flight is money committed.
2. **Settle** — the row records what the call actually cost when it comes back.
3. **Release** — a call that never happened gives its room back. Only a reservation can be
   released; settled money was really spent, and releasing it would understate what is owed.

A retry presents the same idempotency key and finds its own reservation rather than paying
twice. The unique index on `(organization_id, idempotency_key)` is what makes that a guarantee
rather than a convention.

## Rates

`SPECTRO_TTS_MICROS_PER_CHARACTER` and `SPECTRO_MINIMUM_CHARGE_MICROS` are configuration. The
committed defaults deliberately overestimate — roughly US$0.30 per thousand characters, above
real pricing at the time of writing — because the two failure modes are not symmetrical.
Overestimating refuses a call that would have fitted. Underestimating authorises one that breaks
the ceiling. Check them against the vendor's current pricing before relying on them.

## Money is integers

The unit is a millionth of a US dollar. Cents are too coarse for per-character pricing and
floats are not an option: `0.1 + 0.2` is not `0.3` in binary floating point, and a ledger that
drifts by a rounding error on every call cannot be reconciled against an invoice.

## Setting a ceiling

There is no interface for this yet, so it is set directly. Nothing spends until it is.

```sql
-- US$5 for the whole organization.
insert into public.spend_limits (organization_id, campaign_id, ceiling_micros)
values ('<organization-id>', null, 5000000)
on conflict do nothing;
```

## Not covered

No provider calls this yet. The ceiling exists, is enforced and is tested; what it guards has
still to be built. Nothing in Spectro spends money today.

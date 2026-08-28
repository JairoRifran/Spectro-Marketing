-- Spend ceilings and the ledger they are enforced against.
--
-- This is the first thing in Spectro that can cost real money, so the guarantees have to be
-- stronger than a check in application code:
--
--   * Default deny. A limit that was never configured does not exist, and a scope with no
--     configured limit authorises nothing. Unconfigured must never read as unlimited.
--   * The check and the reservation happen in one transaction, under a row lock. Two concurrent
--     requests that each read "there is room" and then both proceed is exactly how a ceiling
--     stops working, and it is not a rare race under a retrying worker.
--   * Idempotent. A retried task reuses its reservation instead of paying twice.
--   * Reserve, then settle. Money is committed before the vendor is called, because after the
--     call it is already spent.
--
-- This file is intentionally 100% ASCII so no clipboard or codepage can corrupt it in transit.

create table public.spend_limits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Null means the limit applies to the whole organization.
  campaign_id uuid references public.campaigns(id) on delete cascade,
  ceiling_micros bigint not null default 0 check (ceiling_micros >= 0),
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One limit per scope. Two rows for the same scope would make "the ceiling" ambiguous.
-- Two partial indexes rather than one over coalesce(campaign_id, <sentinel>): a sentinel uuid
-- is a value a real campaign could in principle hold, and uniqueness must not depend on that
-- never happening.
create unique index spend_limits_org_idx on public.spend_limits (organization_id)
  where campaign_id is null;
create unique index spend_limits_campaign_idx on public.spend_limits (organization_id, campaign_id)
  where campaign_id is not null;

create table public.spend_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  content_item_id uuid references public.content_items(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  operation text not null,
  provider text not null,
  estimated_micros bigint not null check (estimated_micros >= 0),
  -- Null until the call comes back. A reserved row still counts against the ceiling.
  actual_micros bigint check (actual_micros is null or actual_micros >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'settled', 'released')),
  -- What was charged, for reconciling against an invoice. Never a prompt or a credential.
  summary text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  updated_at timestamptz not null default now()
);

-- The retry guard: the same logical operation can only ever hold one reservation.
create unique index spend_ledger_idempotency_idx
  on public.spend_ledger (organization_id, idempotency_key);

create index spend_ledger_org_status_idx on public.spend_ledger (organization_id, status);
create index spend_ledger_campaign_idx on public.spend_ledger (campaign_id) where campaign_id is not null;

create trigger spend_limits_set_updated_at before update on public.spend_limits
  for each row execute function public.set_updated_at();
create trigger spend_ledger_set_updated_at before update on public.spend_ledger
  for each row execute function public.set_updated_at();

-- One trigger per foreign key. The guard takes the column and the table it points at as
-- arguments; called without them it reads a null reference and waves every row through, which
-- is a trigger that exists and protects nothing.
create trigger spend_limits_campaign_org before insert or update of campaign_id, organization_id
  on public.spend_limits for each row
  execute function public.enforce_same_organization_reference('campaign_id', 'campaigns');

create trigger spend_ledger_campaign_org before insert or update of campaign_id, organization_id
  on public.spend_ledger for each row
  execute function public.enforce_same_organization_reference('campaign_id', 'campaigns');
create trigger spend_ledger_content_org before insert or update of content_item_id, organization_id
  on public.spend_ledger for each row
  execute function public.enforce_same_organization_reference('content_item_id', 'content_items');
create trigger spend_ledger_task_org before insert or update of task_id, organization_id
  on public.spend_ledger for each row
  execute function public.enforce_same_organization_reference('task_id', 'tasks');

alter table public.spend_limits enable row level security;
alter table public.spend_ledger enable row level security;

create policy spend_limits_read on public.spend_limits
  for select using (public.is_org_member(organization_id));
create policy spend_ledger_read on public.spend_ledger
  for select using (public.is_org_member(organization_id));

-- Writes go through the functions below, never straight from a client.

-- What a scope has already committed: everything reserved plus everything settled. A released
-- row is money that was never spent, so it frees its room again.
create or replace function public.spend_committed(p_organization_id uuid, p_campaign_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(coalesce(actual_micros, estimated_micros)), 0)::bigint
  from public.spend_ledger
  where organization_id = p_organization_id
    and status in ('reserved', 'settled')
    and (p_campaign_id is null or campaign_id = p_campaign_id);
$$;

-- Reserves budget, or refuses. The whole point of doing this in the database is the lock: the
-- limits are locked before they are read, so a concurrent caller waits rather than reading a
-- balance that is about to change.
create or replace function public.reserve_spend(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_operation text,
  p_provider text,
  p_estimated_micros bigint,
  p_idempotency_key text,
  p_content_item_id uuid default null,
  p_task_id uuid default null
)
returns public.spend_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.spend_ledger;
  v_row public.spend_ledger;
  v_ceiling bigint;
  v_committed bigint;
begin
  if p_estimated_micros is null or p_estimated_micros < 0 then
    raise exception 'invalid_estimate';
  end if;

  -- A retry finds its own reservation and reuses it rather than paying twice.
  select * into v_existing from public.spend_ledger
   where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  -- Lock every applicable limit before reading any balance.
  perform 1 from public.spend_limits
   where organization_id = p_organization_id
     and (campaign_id is null or campaign_id = p_campaign_id)
   for update;

  -- The organization ceiling. Absent means nothing may be spent.
  select ceiling_micros into v_ceiling from public.spend_limits
   where organization_id = p_organization_id and campaign_id is null;
  if not found or v_ceiling is null or v_ceiling = 0 then
    raise exception 'no_budget_organization';
  end if;
  if p_estimated_micros > v_ceiling then
    raise exception 'over_ceiling_organization';
  end if;
  v_committed := public.spend_committed(p_organization_id, null);
  if v_committed + p_estimated_micros > v_ceiling then
    raise exception 'insufficient_budget_organization';
  end if;

  -- A campaign ceiling is optional, but binding when present.
  if p_campaign_id is not null then
    select ceiling_micros into v_ceiling from public.spend_limits
     where organization_id = p_organization_id and campaign_id = p_campaign_id;
    if found and v_ceiling is not null then
      if v_ceiling = 0 then
        raise exception 'no_budget_campaign';
      end if;
      if p_estimated_micros > v_ceiling then
        raise exception 'over_ceiling_campaign';
      end if;
      v_committed := public.spend_committed(p_organization_id, p_campaign_id);
      if v_committed + p_estimated_micros > v_ceiling then
        raise exception 'insufficient_budget_campaign';
      end if;
    end if;
  end if;

  insert into public.spend_ledger (
    organization_id, campaign_id, content_item_id, task_id,
    operation, provider, estimated_micros, status, idempotency_key
  ) values (
    p_organization_id, p_campaign_id, p_content_item_id, p_task_id,
    p_operation, p_provider, p_estimated_micros, 'reserved', p_idempotency_key
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- Records what the call actually cost. Settling twice is refused rather than double counted.
create or replace function public.settle_spend(
  p_ledger_id uuid,
  p_actual_micros bigint,
  p_summary text default null
)
returns public.spend_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.spend_ledger;
begin
  if p_actual_micros is null or p_actual_micros < 0 then
    raise exception 'invalid_actual';
  end if;

  update public.spend_ledger
     set actual_micros = p_actual_micros,
         status = 'settled',
         summary = p_summary,
         settled_at = now()
   where id = p_ledger_id and status = 'reserved'
  returning * into v_row;

  if not found then
    raise exception 'not_reserved';
  end if;
  return v_row;
end;
$$;

-- Gives the room back when a call never happened. Only a reservation can be released; settled
-- money was really spent and releasing it would understate what is owed.
create or replace function public.release_spend(p_ledger_id uuid, p_summary text default null)
returns public.spend_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.spend_ledger;
begin
  update public.spend_ledger
     set status = 'released', actual_micros = 0, summary = p_summary, settled_at = now()
   where id = p_ledger_id and status = 'reserved'
  returning * into v_row;

  if not found then
    raise exception 'not_reserved';
  end if;
  return v_row;
end;
$$;

revoke all on function public.reserve_spend(uuid, uuid, text, text, bigint, text, uuid, uuid) from public;
revoke all on function public.settle_spend(uuid, bigint, text) from public;
revoke all on function public.release_spend(uuid, text) from public;
grant execute on function public.reserve_spend(uuid, uuid, text, text, bigint, text, uuid, uuid) to service_role;
grant execute on function public.settle_spend(uuid, bigint, text) to service_role;
grant execute on function public.release_spend(uuid, text) to service_role;

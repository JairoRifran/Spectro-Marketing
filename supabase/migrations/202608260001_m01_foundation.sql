-- Spectro M01 Foundation. PostgreSQL is the source of truth for all autonomous work.
create extension if not exists pgcrypto;

create type public.organization_role as enum ('owner','admin','member','viewer');
create type public.agent_status as enum ('active','paused','disabled');
create type public.task_status as enum ('draft','pending','queued','running','blocked','waiting_approval','completed','failed','cancelled');
create type public.task_priority as enum ('low','medium','high','urgent');
create type public.actor_type as enum ('user','agent','system');
create type public.approval_status as enum ('requested','approved','rejected','expired');
create type public.risk_level as enum ('low','medium','high');
create type public.event_status as enum ('pending','processing','processed','failed');
create type public.schedule_status as enum ('active','paused','disabled');
create type public.knowledge_type as enum ('company','product','persona','brand','research','competitor','campaign','customer','learning','policy','other');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  locale text not null default 'es',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  industry text,
  website text,
  country text,
  primary_language text not null default 'es',
  timezone text not null default 'UTC',
  onboarding_completed_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.organization_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.brands (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, description text, slogan text, tone_of_voice text, personality text[] not null default '{}',
  preferred_words text[] not null default '{}', forbidden_words text[] not null default '{}', colors jsonb not null default '[]',
  logo_path text, visual_instructions text, communication_examples jsonb not null default '[]', forbidden_claims text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, description text, kind text not null default 'product' check (kind in ('product','service')),
  category text, value_proposition text, price_text text, url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.personas (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, description text, pains text[] not null default '{}', needs text[] not null default '{}',
  motivations text[] not null default '{}', objections text[] not null default '{}', channels text[] not null default '{}', metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.objectives (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null, description text, metric text not null, baseline numeric, target numeric not null, deadline date,
  budget numeric check (budget is null or budget >= 0), market text, constraints jsonb not null default '[]', priority public.task_priority not null default 'medium',
  status text not null default 'active' check (status in ('draft','active','paused','completed','cancelled')),
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.agents (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null, display_name text not null, description text, status public.agent_status not null default 'active', avatar text,
  autonomy_level smallint not null default 0 check (autonomy_level between 0 and 3), system_instructions text,
  configuration jsonb not null default '{}', last_run_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, role)
);

create table public.agent_capabilities (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade, capability text not null, description text,
  configuration jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(agent_id, capability)
);

create table public.agent_settings (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade unique, approval_threshold public.risk_level not null default 'medium',
  max_tasks_per_dispatch smallint not null default 3 check (max_tasks_per_dispatch between 1 and 20), settings jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null, description text, type text not null, status public.task_status not null default 'draft', priority public.task_priority not null default 'medium',
  created_by_type public.actor_type not null, created_by_id uuid, assigned_agent_id uuid references public.agents(id), objective_id uuid references public.objectives(id),
  parent_task_id uuid references public.tasks(id), source_event_id uuid, reason text, expected_impact text, confidence numeric check (confidence is null or confidence between 0 and 1),
  risk_level public.risk_level not null default 'low', requires_approval boolean not null default false, scheduled_for timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0), max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  locked_at timestamptz, locked_by text, lease_expires_at timestamptz, idempotency_key text,
  input jsonb not null default '{}', output jsonb, error jsonb, context_snapshot jsonb not null default '{}',
  started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (parent_task_id is null or parent_task_id <> id), unique(organization_id, idempotency_key)
);

create table public.task_dependencies (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade, depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  required boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (task_id <> depends_on_task_id), unique(task_id, depends_on_task_id)
);

create table public.task_runs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade, agent_id uuid references public.agents(id), attempt_number integer not null,
  worker_id text not null, status text not null check (status in ('running','completed','failed','timed_out')),
  input jsonb not null default '{}', output jsonb, error jsonb, correlation_id uuid not null default gen_random_uuid(),
  started_at timestamptz not null default now(), completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(task_id, attempt_number)
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id), task_id uuid references public.tasks(id), event_id uuid, provider text not null,
  status text not null check (status in ('running','completed','failed')), input jsonb not null default '{}', output jsonb, error jsonb,
  idempotency_key text not null, started_at timestamptz not null default now(), completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,idempotency_key)
);

create table public.events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  type text not null, status public.event_status not null default 'pending', source text not null, source_id uuid, payload jsonb not null default '{}',
  idempotency_key text not null, occurred_at timestamptz not null default now(), available_at timestamptz not null default now(), processed_at timestamptz,
  attempt_count integer not null default 0, max_attempts integer not null default 3, error jsonb, locked_at timestamptz, locked_by text, lease_expires_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,idempotency_key)
);

alter table public.tasks add constraint tasks_source_event_fk foreign key(source_event_id) references public.events(id);
alter table public.agent_runs add constraint agent_runs_event_fk foreign key(event_id) references public.events(id);

create table public.schedules (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, status public.schedule_status not null default 'active', cron_expression text not null, timezone text not null default 'UTC',
  event_type text not null, event_payload jsonb not null default '{}', agent_id uuid references public.agents(id), task_template jsonb,
  next_run_at timestamptz not null, last_run_at timestamptz, idempotency_prefix text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,name)
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade, status public.approval_status not null default 'requested', risk_level public.risk_level not null,
  requested_by_type public.actor_type not null, requested_by_id uuid, reason text not null, proposed_change jsonb not null default '{}', expected_impact text,
  expires_at timestamptz, decided_by uuid references public.profiles(id), decided_at timestamptz, decision_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index one_open_approval_per_task on public.approvals(task_id) where status='requested';

create table public.knowledge_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null, content text not null, type public.knowledge_type not null, source text, metadata jsonb not null default '{}', embedding_placeholder jsonb,
  created_by_type public.actor_type not null default 'user', created_by_id uuid,
  search_vector tsvector generated always as (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,''))) stored,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.agent_memories (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade, knowledge_item_id uuid references public.knowledge_items(id) on delete set null,
  kind text not null check (kind in ('working','episodic','semantic')), content text not null, relevance numeric check (relevance is null or relevance between 0 and 1),
  metadata jsonb not null default '{}', expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.learnings (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  observation text not null, evidence jsonb not null default '[]', confidence numeric not null check(confidence between 0 and 1), sample_size integer,
  source text, created_by_agent_id uuid references public.agents(id), knowledge_item_id uuid references public.knowledge_items(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  action text not null, actor_type public.actor_type not null, actor_id uuid, entity_type text, entity_id uuid,
  task_id uuid references public.tasks(id), agent_id uuid references public.agents(id), event_id uuid references public.events(id), run_id uuid,
  summary text not null, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id), type text not null, title text not null, body text, entity_type text, entity_id uuid,
  read_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null, status text not null default 'disabled' check(status in ('disabled','pending','connected','error')),
  external_account_id text, configuration jsonb not null default '{}', secret_reference text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,provider)
);

create table public.worker_health (
  id uuid primary key default gen_random_uuid(),
  worker_name text not null default 'dispatcher', last_dispatch_at timestamptz, last_successful_run_at timestamptz, last_failed_run_at timestamptz,
  last_error_code text, metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(worker_name)
);

-- Query paths used by the dispatcher and UI.
create index tasks_dispatch_idx on public.tasks(status,scheduled_for,priority,created_at) where status in ('pending','queued');
create index tasks_org_status_idx on public.tasks(organization_id,status,created_at desc);
create index tasks_agent_idx on public.tasks(organization_id,assigned_agent_id,status);
create index tasks_lease_idx on public.tasks(lease_expires_at) where status='running';
create index task_dependencies_task_idx on public.task_dependencies(task_id);
create index events_pending_idx on public.events(status,available_at) where status='pending';
create index events_lease_idx on public.events(lease_expires_at) where status='processing';
create index schedules_due_idx on public.schedules(status,next_run_at) where status='active';
create index approvals_org_status_idx on public.approvals(organization_id,status,created_at desc);
create index activity_org_created_idx on public.activity_log(organization_id,created_at desc);
create index knowledge_org_type_idx on public.knowledge_items(organization_id,type,created_at desc);
create index knowledge_search_idx on public.knowledge_items using gin(search_vector);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end; $$;

do $$ declare table_name text; begin
  foreach table_name in array array['profiles','organizations','organization_members','brands','products','personas','objectives','agents','agent_capabilities','agent_settings','tasks','task_dependencies','task_runs','agent_runs','events','schedules','approvals','knowledge_items','agent_memories','learnings','notifications','integration_connections','worker_health'] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()',table_name,table_name);
  end loop;
end $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,full_name) values(new.id,new.raw_user_meta_data->>'full_name') on conflict(id) do nothing; return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_org_member(org_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.organization_members m where m.organization_id=org_id and m.user_id=auth.uid());
$$;
create or replace function public.has_org_role(org_id uuid, allowed public.organization_role[]) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.organization_members m where m.organization_id=org_id and m.user_id=auth.uid() and m.role=any(allowed));
$$;
revoke all on function public.is_org_member(uuid) from public; grant execute on function public.is_org_member(uuid) to authenticated;
revoke all on function public.has_org_role(uuid,public.organization_role[]) from public; grant execute on function public.has_org_role(uuid,public.organization_role[]) to authenticated;

create or replace function public.create_organization(org_name text, org_slug text, org_timezone text default 'UTC') returns uuid
language plpgsql security definer set search_path=public as $$ declare new_id uuid; begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  insert into public.organizations(name,slug,timezone,created_by) values(org_name,org_slug,org_timezone,auth.uid()) returning id into new_id;
  insert into public.organization_members(organization_id,user_id,role) values(new_id,auth.uid(),'owner');
  return new_id;
end $$;
revoke all on function public.create_organization(text,text,text) from public; grant execute on function public.create_organization(text,text,text) to authenticated;

create or replace function public.enforce_task_transition() returns trigger language plpgsql as $$ begin
  if old.status=new.status then return new; end if;
  if not (case old.status
    when 'draft' then new.status in ('pending','queued','cancelled')
    when 'pending' then new.status in ('queued','blocked','waiting_approval','cancelled')
    when 'queued' then new.status in ('running','blocked','waiting_approval','cancelled')
    when 'running' then new.status in ('queued','blocked','waiting_approval','completed','failed','cancelled')
    when 'blocked' then new.status in ('pending','queued','cancelled')
    when 'waiting_approval' then new.status in ('queued','cancelled')
    when 'failed' then new.status in ('queued','cancelled')
    else false end) then raise exception 'invalid task transition: % -> %',old.status,new.status using errcode='check_violation'; end if;
  if new.status='running' then new.started_at=coalesce(new.started_at,now()); end if;
  if new.status in ('completed','failed','cancelled') then new.completed_at=now(); new.locked_at=null; new.locked_by=null; new.lease_expires_at=null; end if;
  return new;
end $$;
create trigger enforce_task_transition before update of status on public.tasks for each row execute function public.enforce_task_transition();

create or replace function public.prevent_dependency_cycle() returns trigger language plpgsql as $$ begin
  if exists(
    with recursive chain(task_id) as (
      select new.depends_on_task_id union select d.depends_on_task_id from public.task_dependencies d join chain c on d.task_id=c.task_id
    ) select 1 from chain where task_id=new.task_id
  ) then raise exception 'circular task dependency' using errcode='integrity_constraint_violation'; end if;
  if (select organization_id from public.tasks where id=new.task_id)<>(select organization_id from public.tasks where id=new.depends_on_task_id) then raise exception 'cross-organization dependency'; end if;
  new.organization_id=(select organization_id from public.tasks where id=new.task_id); return new;
end $$;
create trigger prevent_task_dependency_cycle before insert or update on public.task_dependencies for each row execute function public.prevent_dependency_cycle();

create or replace function public.enforce_approval_transition() returns trigger language plpgsql as $$ begin
  if old.status<>new.status and not (old.status='requested' and new.status in ('approved','rejected','expired')) then raise exception 'invalid approval transition'; end if;
  if old.status='requested' and new.status in ('approved','rejected') then
    if auth.uid() is null and current_user not in ('service_role','postgres') then raise exception 'approval actor required'; end if;
    new.decided_by=coalesce(new.decided_by,auth.uid()); new.decided_at=now();
  end if; return new;
end $$;
create trigger enforce_approval_transition before update of status on public.approvals for each row execute function public.enforce_approval_transition();

create or replace function public.apply_approval_to_task() returns trigger language plpgsql security definer set search_path=public as $$ begin
  if new.status='approved' and old.status='requested' then update public.tasks set status='queued',scheduled_for=coalesce(scheduled_for,now()) where id=new.task_id and status='waiting_approval';
  elsif new.status in ('rejected','expired') and old.status='requested' then update public.tasks set status='cancelled',error=jsonb_build_object('code','approval_'||new.status,'message','Task did not receive approval') where id=new.task_id and status='waiting_approval'; end if;
  return new;
end $$;
create trigger approval_updates_task after update of status on public.approvals for each row execute function public.apply_approval_to_task();

create or replace function public.claim_ready_tasks(p_worker_id text,p_batch_size integer default 5,p_lease_seconds integer default 120)
returns setof public.tasks language plpgsql security definer set search_path=public as $$ begin
  if p_batch_size<1 or p_batch_size>20 or p_lease_seconds<15 or p_lease_seconds>900 then raise exception 'invalid claim parameters'; end if;
  update public.tasks set status=case when attempt_count>=max_attempts then 'failed'::public.task_status else 'queued'::public.task_status end,
    error=case when attempt_count>=max_attempts then jsonb_build_object('code','lease_expired','message','Worker lease expired after maximum attempts') else error end,
    locked_at=null,locked_by=null,lease_expires_at=null
  where status='running' and lease_expires_at<now();
  return query with candidates as (
    select t.id from public.tasks t where t.status in ('pending','queued') and coalesce(t.scheduled_for,now())<=now() and t.attempt_count<t.max_attempts
      and (not t.requires_approval or exists(select 1 from public.approvals a where a.task_id=t.id and a.status='approved'))
      and not exists(select 1 from public.task_dependencies d join public.tasks dep on dep.id=d.depends_on_task_id where d.task_id=t.id and d.required and dep.status<>'completed')
    order by case t.priority when 'urgent' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,t.created_at for update skip locked limit p_batch_size
  ) update public.tasks t set status='running',attempt_count=t.attempt_count+1,locked_at=now(),locked_by=p_worker_id,lease_expires_at=now()+make_interval(secs=>p_lease_seconds)
    from candidates c where t.id=c.id returning t.*;
end $$;
revoke all on function public.claim_ready_tasks(text,integer,integer) from public,anon,authenticated;

-- RLS is organization-scoped; the service role is reserved for short server-side workers.
alter table public.profiles enable row level security;
create policy profiles_self_read on public.profiles for select using(id=auth.uid());
create policy profiles_self_update on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());
alter table public.organizations enable row level security;
create policy organizations_member_read on public.organizations for select using(public.is_org_member(id));
create policy organizations_admin_update on public.organizations for update using(public.has_org_role(id,array['owner','admin']::public.organization_role[]));
alter table public.organization_members enable row level security;
create policy members_org_read on public.organization_members for select using(public.is_org_member(organization_id));
create policy members_admin_write on public.organization_members for all using(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[])) with check(public.has_org_role(organization_id,array['owner','admin']::public.organization_role[]));

do $$ declare table_name text; begin
  foreach table_name in array array['brands','products','personas','objectives','agents','agent_capabilities','agent_settings','tasks','task_dependencies','task_runs','agent_runs','events','schedules','approvals','knowledge_items','agent_memories','learnings','activity_log','notifications','integration_connections'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('create policy %I_member_read on public.%I for select using(public.is_org_member(organization_id))',table_name,table_name);
    execute format('create policy %I_member_insert on public.%I for insert with check(public.has_org_role(organization_id,array[''owner'',''admin'',''member'']::public.organization_role[]))',table_name,table_name);
    execute format('create policy %I_member_update on public.%I for update using(public.has_org_role(organization_id,array[''owner'',''admin'',''member'']::public.organization_role[])) with check(public.has_org_role(organization_id,array[''owner'',''admin'',''member'']::public.organization_role[]))',table_name,table_name);
    execute format('create policy %I_admin_delete on public.%I for delete using(public.has_org_role(organization_id,array[''owner'',''admin'']::public.organization_role[]))',table_name,table_name);
  end loop;
end $$;

alter table public.worker_health enable row level security;
create policy worker_health_authenticated_read on public.worker_health for select to authenticated using(true);

-- Audit log is append-only to organization users; only service_role/postgres may mutate existing entries.
drop policy activity_log_member_update on public.activity_log;
drop policy activity_log_admin_delete on public.activity_log;

-- Storage convention: private bucket `brand-assets`, path `{organization_id}/...`.
insert into storage.buckets(id,name,public) values('brand-assets','brand-assets',false) on conflict(id) do nothing;
create policy brand_assets_read on storage.objects for select to authenticated using(bucket_id='brand-assets' and public.is_org_member((storage.foldername(name))[1]::uuid));
create policy brand_assets_write on storage.objects for insert to authenticated with check(bucket_id='brand-assets' and public.has_org_role((storage.foldername(name))[1]::uuid,array['owner','admin','member']::public.organization_role[]));

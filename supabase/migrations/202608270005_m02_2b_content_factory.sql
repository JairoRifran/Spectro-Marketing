-- M02.2B Content Factory. Forward-only extension over the verified M01 and M02.1 schema.
--
-- Five entities rather than one table per Zod schema: a concept is the idea, an item is the
-- reviewable unit for one platform, a variant is the artefact at one version, a review is what
-- Emilia and the quality engine concluded, and a version row records why a version exists.
-- The brief lives as structured JSON on the item because it is a snapshot of a contract that is
-- always read whole and never queried field by field.

create type public.content_status as enum (
  'concept','brief','generating','creative_review','needs_revision','ready','waiting_approval','approved','rejected','cancelled'
);
create type public.content_platform as enum ('instagram','facebook','tiktok','youtube_shorts','linkedin');
create type public.content_format as enum ('reel','short_video','carousel','story','static_post','text_post','document_post');

create table public.content_concepts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  objective_id uuid references public.objectives(id),
  strategy_version integer not null default 1 check (strategy_version >= 1),
  concept_key text not null,
  title text not null,
  internal_name text not null,
  pillar text not null,
  angle text not null,
  content_type text not null,
  core_idea text not null,
  audience_persona text not null,
  audience_problem text not null,
  audience_promise text not null,
  hook_direction jsonb not null default '{}',
  desired_action text not null,
  evidence jsonb not null default '[]',
  creative_notes text[] not null default '{}',
  platforms public.content_platform[] not null default '{}',
  created_by_agent_id uuid references public.agents(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, concept_key)
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  objective_id uuid references public.objectives(id),
  concept_id uuid not null references public.content_concepts(id) on delete cascade,
  platform public.content_platform not null,
  format public.content_format not null,
  status public.content_status not null default 'concept',
  current_version integer not null default 0 check (current_version >= 0),
  title text not null,
  -- The Bruno-to-Clara contract, stored whole. Always read as a unit, never filtered on.
  brief jsonb not null default '{}',
  quality jsonb,
  quality_passed boolean,
  quality_checks_passed integer check (quality_checks_passed is null or quality_checks_passed >= 0),
  quality_checks_total integer check (quality_checks_total is null or quality_checks_total >= 0),
  created_by_agent_id uuid references public.agents(id),
  reviewed_by_agent_id uuid references public.agents(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (concept_id, platform, format)
);

create table public.content_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  version integer not null check (version >= 1),
  -- A validated PlatformContentVariant. The shape of `detail` depends on the format.
  payload jsonb not null,
  hook_variants jsonb not null default '[]',
  generated_by text not null default 'provider' check (generated_by in ('mock','provider')),
  provider text,
  model text,
  prompt_version text,
  created_by_agent_id uuid references public.agents(id),
  created_at timestamptz not null default now(),
  unique (content_item_id, version)
);

create table public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  variant_id uuid not null references public.content_variants(id) on delete cascade,
  version integer not null check (version >= 1),
  visual_direction text not null,
  storyboard jsonb not null default '[]',
  motion_notes text[] not null default '{}',
  composition_notes text[] not null default '{}',
  brand_consistency text not null check (brand_consistency in ('consistent','needs_adjustment','off_brand')),
  findings jsonb not null default '[]',
  quality jsonb not null default '{}',
  approved boolean not null default false,
  reason text,
  reviewed_by_agent_id uuid references public.agents(id),
  created_at timestamptz not null default now(),
  unique (content_item_id, version)
);

-- Why a version exists, separate from what the version contains. A revision never overwrites
-- an approved or reviewed artefact; it creates the next version and records who asked and why.
create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  version integer not null check (version >= 1),
  reason text not null,
  feedback text,
  requested_by uuid references public.profiles(id),
  created_by_agent_id uuid references public.agents(id),
  created_at timestamptz not null default now(),
  unique (content_item_id, version)
);

alter table public.tasks add column content_item_id uuid references public.content_items(id) on delete set null;
alter table public.approvals add column content_item_id uuid references public.content_items(id) on delete set null;
alter table public.activity_log add column content_item_id uuid references public.content_items(id) on delete set null;

create index content_concepts_campaign_idx on public.content_concepts(campaign_id, strategy_version, created_at);
create index content_concepts_org_idx on public.content_concepts(organization_id, created_at desc);
create index content_items_org_status_idx on public.content_items(organization_id, status, created_at desc);
create index content_items_campaign_idx on public.content_items(campaign_id, status, created_at desc);
create index content_items_concept_idx on public.content_items(concept_id);
create index content_items_platform_idx on public.content_items(organization_id, platform, format, created_at desc);
create index content_variants_item_idx on public.content_variants(content_item_id, version desc);
create index content_reviews_item_idx on public.content_reviews(content_item_id, version desc);
create index content_versions_item_idx on public.content_versions(content_item_id, version desc);
create index content_tasks_idx on public.tasks(content_item_id, status) where content_item_id is not null;
create index content_approvals_idx on public.approvals(content_item_id, status) where content_item_id is not null;
create index content_activity_idx on public.activity_log(content_item_id, created_at desc) where content_item_id is not null;

do $$ declare table_name text; begin
  foreach table_name in array array['content_concepts','content_items','content_variants','content_reviews','content_versions'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy %I_member_read on public.%I for select using(public.is_org_member(organization_id))', table_name, table_name);
  end loop;
end $$;

create trigger content_concepts_campaign_org before insert or update of campaign_id,organization_id on public.content_concepts for each row execute function public.enforce_same_organization_reference('campaign_id','campaigns');
create trigger content_concepts_objective_org before insert or update of objective_id,organization_id on public.content_concepts for each row execute function public.enforce_same_organization_reference('objective_id','objectives');
create trigger content_items_campaign_org before insert or update of campaign_id,organization_id on public.content_items for each row execute function public.enforce_same_organization_reference('campaign_id','campaigns');
create trigger content_items_concept_org before insert or update of concept_id,organization_id on public.content_items for each row execute function public.enforce_same_organization_reference('concept_id','content_concepts');
create trigger content_variants_item_org before insert or update of content_item_id,organization_id on public.content_variants for each row execute function public.enforce_same_organization_reference('content_item_id','content_items');
create trigger content_reviews_item_org before insert or update of content_item_id,organization_id on public.content_reviews for each row execute function public.enforce_same_organization_reference('content_item_id','content_items');
create trigger content_versions_item_org before insert or update of content_item_id,organization_id on public.content_versions for each row execute function public.enforce_same_organization_reference('content_item_id','content_items');
create trigger tasks_content_org before insert or update of content_item_id,organization_id on public.tasks for each row execute function public.enforce_same_organization_reference('content_item_id','content_items');
create trigger approvals_content_org before insert or update of content_item_id,organization_id on public.approvals for each row execute function public.enforce_same_organization_reference('content_item_id','content_items');

do $$ declare table_name text; begin
  foreach table_name in array array['content_concepts','content_items'] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

-- The lifecycle table lives here as well as in TypeScript. A piece of content is durable
-- state, so the database is the authority: an out-of-order write is rejected even if it
-- arrives from a path that skipped the application guard.
create or replace function public.enforce_content_transition() returns trigger language plpgsql as $$
declare allowed public.content_status[]; begin
  if new.status = old.status then return new; end if;
  allowed := case old.status
    when 'concept' then array['brief','cancelled']::public.content_status[]
    when 'brief' then array['generating','cancelled']::public.content_status[]
    when 'generating' then array['creative_review','needs_revision','cancelled']::public.content_status[]
    when 'creative_review' then array['ready','needs_revision','cancelled']::public.content_status[]
    when 'needs_revision' then array['generating','cancelled']::public.content_status[]
    when 'ready' then array['waiting_approval','needs_revision','cancelled']::public.content_status[]
    when 'waiting_approval' then array['approved','rejected','needs_revision','cancelled']::public.content_status[]
    when 'rejected' then array['needs_revision','cancelled']::public.content_status[]
    else array[]::public.content_status[]
  end;
  if not (new.status = any(allowed)) then
    raise exception 'Invalid content transition % -> %', old.status, new.status;
  end if;
  return new;
end $$;
create trigger enforce_content_transition before update of status on public.content_items for each row execute function public.enforce_content_transition();

-- Human decisions on a content approval land on the item through the M01 approval engine.
-- The mapping is deliberately literal: approved means approved and rejected means rejected.
-- "Request revision" is not inferred from the shape of a note; it is a separate, explicit step
-- the application takes afterwards, moving the piece from rejected to needs_revision and
-- creating the next version. Guessing intent from an empty string would be a silent behaviour.
create or replace function public.apply_content_approval() returns trigger language plpgsql security definer set search_path=public as $$
declare next_status public.content_status; begin
  if new.content_item_id is null or old.status <> 'requested' or new.status not in ('approved','rejected') then return new; end if;
  next_status := case when new.status = 'approved' then 'approved'::public.content_status else 'rejected'::public.content_status end;
  update public.content_items
    set status = next_status,
        approved_at = case when next_status = 'approved' then now() else approved_at end
    where id = new.content_item_id and status = 'waiting_approval';
  insert into public.activity_log(organization_id,campaign_id,content_item_id,action,actor_type,actor_id,entity_type,entity_id,task_id,summary,metadata)
    values(new.organization_id,new.campaign_id,new.content_item_id,'content.'||next_status::text,'user',new.decided_by,'content_item',new.content_item_id,new.task_id,
      case when next_status = 'approved' then 'Contenido aprobado por una persona' else 'Contenido rechazado por una persona' end,
      jsonb_build_object('decision_note',new.decision_note));
  return new;
end $$;
create trigger approval_updates_content after update of status on public.approvals for each row execute function public.apply_content_approval();

-- M02.1 Campaign Brain. Forward-only extension over the verified M01 schema.

create type public.campaign_status as enum ('draft','researching','strategy','ready','active','paused','completed','cancelled');
create type public.campaign_channel_code as enum ('instagram','facebook','tiktok','youtube','linkedin','x','threads');

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  objective_id uuid not null references public.objectives(id),
  name text not null,
  slug text not null,
  status public.campaign_status not null default 'draft',
  business_goal text not null,
  campaign_type text not null default 'integrated',
  summary text,
  target_audience text,
  problem text,
  promise text,
  positioning text,
  core_message text,
  creative_thesis text,
  primary_cta text,
  start_date date,
  end_date date,
  budget numeric check (budget is null or budget >= 0),
  priority public.task_priority not null default 'medium',
  constraints jsonb not null default '[]' check (jsonb_typeof(constraints)='array'),
  created_by_type public.actor_type not null default 'user',
  created_by_agent_id uuid references public.agents(id),
  created_by_user_id uuid references public.profiles(id),
  confidence numeric check (confidence is null or confidence between 0 and 1),
  strategy_version integer not null default 0 check (strategy_version >= 0),
  strategy_provider text,
  strategy_prompt_version text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,slug),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.campaign_audiences (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade, strategy_version integer not null check(strategy_version > 0), persona_id uuid references public.personas(id) on delete set null,
  name text not null, description text not null, pains text[] not null default '{}', needs text[] not null default '{}',
  motivations text[] not null default '{}', objections text[] not null default '{}', awareness_level text not null default 'problem_aware'
    check (awareness_level in ('unaware','problem_aware','solution_aware','product_aware','most_aware')),
  metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(campaign_id,strategy_version)
);

create table public.campaign_messaging_frameworks (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade, strategy_version integer not null check(strategy_version > 0),
  core_message text not null, supporting_messages text[] not null default '{}', value_propositions text[] not null default '{}',
  proof_points text[] not null default '{}', objections text[] not null default '{}', objection_responses jsonb not null default '[]'
    check(jsonb_typeof(objection_responses)='array'), cta text not null, forbidden_claims text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(campaign_id,strategy_version)
);

create table public.campaign_research (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade, strategy_version integer not null check(strategy_version > 0),
  research_mode text not null check(research_mode in ('knowledge_based','external')),
  market_context text[] not null default '{}', audience_pains text[] not null default '{}', audience_language text[] not null default '{}',
  frequent_questions text[] not null default '{}', objections text[] not null default '{}', competitor_messages text[] not null default '{}',
  content_patterns text[] not null default '{}', opportunities text[] not null default '{}', risks text[] not null default '{}',
  recommended_angles text[] not null default '{}', sources jsonb not null default '[]' check(jsonb_typeof(sources)='array'),
  assumptions text[] not null default '{}', requires_external_research text[] not null default '{}', confidence numeric not null check(confidence between 0 and 1),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(campaign_id,strategy_version)
);

create table public.campaign_channels (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade, strategy_version integer not null check(strategy_version > 0),
  channel public.campaign_channel_code not null, enabled boolean not null default false, role_in_campaign text not null, objective text not null,
  audience_fit text not null, priority public.task_priority not null default 'medium', formats text[] not null default '{}', publishing_frequency text,
  tone_adjustment text, content_notes text, score smallint not null check(score between 0 and 100), reason text not null,
  confidence numeric not null check(confidence between 0 and 1), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(campaign_id,strategy_version,channel)
);

create table public.campaign_content_pillars (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade, strategy_version integer not null check(strategy_version > 0),
  name text not null, description text not null, weight numeric not null check(weight between 0 and 100), objective text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(campaign_id,strategy_version,name)
);

create table public.campaign_angles (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade, strategy_version integer not null check(strategy_version > 0),
  name text not null, description text not null, hypothesis text not null, audience_pain text not null, promise text not null,
  recommended_formats text[] not null default '{}', priority public.task_priority not null default 'medium', confidence numeric not null check(confidence between 0 and 1),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(campaign_id,strategy_version,name)
);

create table public.campaign_strategy_versions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade, version integer not null check(version > 0),
  status text not null default 'proposed' check(status in ('proposed','approved','rejected','superseded')),
  brief jsonb not null, rationale jsonb not null default '{}' check(jsonb_typeof(rationale)='object'),
  guardrail_report jsonb not null default '{}' check(jsonb_typeof(guardrail_report)='object'), provider text not null,
  model text, prompt_version text not null, created_by_agent_id uuid references public.agents(id), created_at timestamptz not null default now(),
  unique(campaign_id,version)
);

alter table public.tasks add column campaign_id uuid references public.campaigns(id) on delete set null;
alter table public.approvals add column campaign_id uuid references public.campaigns(id) on delete set null;
alter table public.activity_log add column campaign_id uuid references public.campaigns(id) on delete set null;
alter table public.agent_runs add column model text, add column input_tokens integer check(input_tokens is null or input_tokens >= 0),
  add column output_tokens integer check(output_tokens is null or output_tokens >= 0),
  add column estimated_cost numeric check(estimated_cost is null or estimated_cost >= 0),
  add column latency_ms integer check(latency_ms is null or latency_ms >= 0), add column prompt_version text;

create index campaigns_org_status_idx on public.campaigns(organization_id,status,created_at desc);
create index campaigns_objective_idx on public.campaigns(organization_id,objective_id,created_at desc);
create index campaign_audiences_campaign_idx on public.campaign_audiences(campaign_id);
create index campaign_channels_campaign_idx on public.campaign_channels(campaign_id,strategy_version,enabled,score desc);
create index campaign_pillars_campaign_idx on public.campaign_content_pillars(campaign_id,strategy_version);
create index campaign_angles_campaign_idx on public.campaign_angles(campaign_id,strategy_version);
create index campaign_research_campaign_idx on public.campaign_research(campaign_id,strategy_version);
create index campaign_activity_idx on public.activity_log(campaign_id,created_at desc) where campaign_id is not null;
create index campaign_tasks_idx on public.tasks(campaign_id,status,created_at) where campaign_id is not null;

do $$ declare table_name text; begin
  foreach table_name in array array['campaigns','campaign_audiences','campaign_messaging_frameworks','campaign_research','campaign_channels','campaign_content_pillars','campaign_angles'] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()',table_name,table_name);
  end loop;
end $$;

create or replace function public.enforce_campaign_transition() returns trigger language plpgsql as $$ begin
  if old.status <> new.status and not (case old.status
    when 'draft' then new.status in ('researching','cancelled')
    when 'researching' then new.status in ('strategy','cancelled')
    when 'strategy' then new.status in ('researching','ready','cancelled')
    when 'ready' then new.status in ('researching','strategy','active','cancelled')
    when 'active' then new.status in ('paused','completed','cancelled')
    when 'paused' then new.status in ('active','completed','cancelled')
    else false end) then raise exception 'invalid campaign transition: % -> %',old.status,new.status using errcode='check_violation'; end if;
  return new;
end $$;
create trigger enforce_campaign_transition before update of status on public.campaigns for each row execute function public.enforce_campaign_transition();

create trigger campaigns_objective_org before insert or update of objective_id,organization_id on public.campaigns for each row execute function public.enforce_same_organization_reference('objective_id','objectives');
create trigger campaigns_agent_org before insert or update of created_by_agent_id,organization_id on public.campaigns for each row execute function public.enforce_same_organization_reference('created_by_agent_id','agents');
create trigger campaign_audiences_campaign_org before insert or update of campaign_id,organization_id on public.campaign_audiences for each row execute function public.enforce_same_organization_reference('campaign_id','campaigns');
create trigger campaign_audiences_persona_org before insert or update of persona_id,organization_id on public.campaign_audiences for each row execute function public.enforce_same_organization_reference('persona_id','personas');
create trigger campaign_messaging_campaign_org before insert or update of campaign_id,organization_id on public.campaign_messaging_frameworks for each row execute function public.enforce_same_organization_reference('campaign_id','campaigns');
create trigger campaign_research_campaign_org before insert or update of campaign_id,organization_id on public.campaign_research for each row execute function public.enforce_same_organization_reference('campaign_id','campaigns');
create trigger campaign_channels_campaign_org before insert or update of campaign_id,organization_id on public.campaign_channels for each row execute function public.enforce_same_organization_reference('campaign_id','campaigns');
create trigger campaign_pillars_campaign_org before insert or update of campaign_id,organization_id on public.campaign_content_pillars for each row execute function public.enforce_same_organization_reference('campaign_id','campaigns');
create trigger campaign_angles_campaign_org before insert or update of campaign_id,organization_id on public.campaign_angles for each row execute function public.enforce_same_organization_reference('campaign_id','campaigns');
create trigger campaign_versions_campaign_org before insert or update of campaign_id,organization_id on public.campaign_strategy_versions for each row execute function public.enforce_same_organization_reference('campaign_id','campaigns');
create trigger tasks_campaign_org before insert or update of campaign_id,organization_id on public.tasks for each row execute function public.enforce_same_organization_reference('campaign_id','campaigns');
create trigger approvals_campaign_org before insert or update of campaign_id,organization_id on public.approvals for each row execute function public.enforce_same_organization_reference('campaign_id','campaigns');

do $$ declare table_name text; begin
  foreach table_name in array array['campaigns','campaign_audiences','campaign_messaging_frameworks','campaign_research','campaign_channels','campaign_content_pillars','campaign_angles','campaign_strategy_versions'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('create policy %I_member_read on public.%I for select using(public.is_org_member(organization_id))',table_name,table_name);
  end loop;
end $$;

create or replace function public.claim_campaign_task(p_campaign_id uuid,p_worker_id text,p_lease_seconds integer default 120)
returns setof public.tasks language plpgsql security definer set search_path=public as $$ begin
  if p_lease_seconds < 15 or p_lease_seconds > 900 then raise exception 'invalid lease parameters'; end if;
  return query with candidate as (
    select t.id from public.tasks t where t.campaign_id=p_campaign_id and t.status='queued'
      and coalesce(t.scheduled_for,now())<=now() and t.attempt_count<t.max_attempts
      and not exists(select 1 from public.task_dependencies d join public.tasks dep on dep.id=d.depends_on_task_id where d.task_id=t.id and d.required and dep.status<>'completed')
    order by t.created_at for update skip locked limit 1
  ) update public.tasks t set status='running',attempt_count=t.attempt_count+1,locked_at=now(),locked_by=p_worker_id,
      lease_expires_at=now()+make_interval(secs=>p_lease_seconds) from candidate c where t.id=c.id returning t.*;
end $$;
revoke all on function public.claim_campaign_task(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.claim_campaign_task(uuid,text,integer) to service_role;

create or replace function public.apply_campaign_approval() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.campaign_id is null or old.status <> 'requested' or new.status not in ('approved','rejected') then return new; end if;
  if new.status='approved' then
    update public.campaigns set approved_at=now() where id=new.campaign_id;
    update public.campaign_strategy_versions set status='approved' where campaign_id=new.campaign_id and version=(select strategy_version from public.campaigns where id=new.campaign_id);
  else
    update public.campaigns set status='strategy',approved_at=null where id=new.campaign_id and status='ready';
    update public.campaign_strategy_versions set status='rejected' where campaign_id=new.campaign_id and version=(select strategy_version from public.campaigns where id=new.campaign_id);
  end if;
  insert into public.activity_log(organization_id,campaign_id,action,actor_type,actor_id,entity_type,entity_id,task_id,summary,metadata)
    values(new.organization_id,new.campaign_id,'campaign.'||new.status::text,'user',new.decided_by,'campaign',new.campaign_id,new.task_id,
      case when new.status='approved' then 'Campaign strategy approved' else 'Campaign strategy rejected for revision' end,
      jsonb_build_object('decision_note',new.decision_note));
  return new;
end $$;
create trigger approval_updates_campaign after update of status on public.approvals for each row execute function public.apply_campaign_approval();

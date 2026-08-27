-- M01.1 corrective hardening. Historical migrations remain immutable.

-- Configuration and autonomous runtime tables are administered by owner/admin;
-- members operate through narrowly-scoped RPCs and viewers remain read-only.
do $$ declare table_name text; begin
  foreach table_name in array array[
    'brands','products','personas','objectives','agents','agent_capabilities','agent_settings',
    'tasks','task_dependencies','task_runs','agent_runs','events','schedules','approvals',
    'agent_memories','learnings','activity_log','integration_connections'
  ] loop
    execute format('drop policy if exists %I_member_insert on public.%I',table_name,table_name);
    execute format('drop policy if exists %I_member_update on public.%I',table_name,table_name);
  end loop;
  foreach table_name in array array[
    'brands','products','personas','objectives','agents','agent_capabilities','agent_settings','schedules','integration_connections'
  ] loop
    execute format('create policy %I_admin_insert on public.%I for insert with check(public.has_org_role(organization_id,array[''owner'',''admin'']::public.organization_role[]))',table_name,table_name);
    execute format('create policy %I_admin_update on public.%I for update using(public.has_org_role(organization_id,array[''owner'',''admin'']::public.organization_role[])) with check(public.has_org_role(organization_id,array[''owner'',''admin'']::public.organization_role[]))',table_name,table_name);
  end loop;
end $$;

-- Knowledge is an operational surface: members may create/update it, viewers may only read.
-- Notifications are private to the addressed user rather than visible to the entire tenant.
drop policy if exists notifications_member_read on public.notifications;
drop policy if exists notifications_member_insert on public.notifications;
drop policy if exists notifications_member_update on public.notifications;
drop policy if exists notifications_admin_delete on public.notifications;
create policy notifications_self_read on public.notifications for select using(user_id=auth.uid());
create policy notifications_self_update on public.notifications for update using(user_id=auth.uid()) with check(user_id=auth.uid());

-- Admins cannot grant owner/admin or modify those memberships; owners retain full control.
drop policy if exists members_admin_write on public.organization_members;
create policy members_owner_insert on public.organization_members for insert
  with check(public.has_org_role(organization_id,array['owner']::public.organization_role[]));
create policy members_admin_insert on public.organization_members for insert
  with check(role in ('member','viewer') and public.has_org_role(organization_id,array['admin']::public.organization_role[]));
create policy members_owner_update on public.organization_members for update
  using(public.has_org_role(organization_id,array['owner']::public.organization_role[]))
  with check(public.has_org_role(organization_id,array['owner']::public.organization_role[]));
create policy members_admin_update on public.organization_members for update
  using(role in ('member','viewer') and public.has_org_role(organization_id,array['admin']::public.organization_role[]))
  with check(role in ('member','viewer') and public.has_org_role(organization_id,array['admin']::public.organization_role[]));
create policy members_owner_delete on public.organization_members for delete
  using(public.has_org_role(organization_id,array['owner']::public.organization_role[]));
create policy members_admin_delete on public.organization_members for delete
  using(role in ('member','viewer') and public.has_org_role(organization_id,array['admin']::public.organization_role[]));

create or replace function public.prevent_last_owner_removal() returns trigger language plpgsql set search_path=public as $$ begin
  if old.role='owner' then
    if tg_op='DELETE' and (select count(*) from public.organization_members where organization_id=old.organization_id and role='owner')<=1
      then raise exception 'organization must retain an owner' using errcode='check_violation';
    elsif tg_op='UPDATE' and new.role<>'owner' and (select count(*) from public.organization_members where organization_id=old.organization_id and role='owner')<=1
      then raise exception 'organization must retain an owner' using errcode='check_violation';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger organization_requires_owner before update of role or delete on public.organization_members
  for each row execute function public.prevent_last_owner_removal();

-- Prevent cross-tenant references even when a privileged server client writes rows.
create or replace function public.enforce_same_organization_reference() returns trigger language plpgsql set search_path=public as $$
declare reference_id uuid; reference_org uuid; begin
  reference_id=nullif(to_jsonb(new)->>tg_argv[0],'')::uuid;
  if reference_id is null then return new; end if;
  execute format('select organization_id from public.%I where id=$1',tg_argv[1]) into reference_org using reference_id;
  if reference_org is null or reference_org<>new.organization_id then
    raise exception 'cross-organization reference rejected' using errcode='integrity_constraint_violation';
  end if;
  return new;
end $$;

create trigger tasks_agent_org before insert or update of assigned_agent_id,organization_id on public.tasks for each row execute function public.enforce_same_organization_reference('assigned_agent_id','agents');
create trigger tasks_objective_org before insert or update of objective_id,organization_id on public.tasks for each row execute function public.enforce_same_organization_reference('objective_id','objectives');
create trigger tasks_parent_org before insert or update of parent_task_id,organization_id on public.tasks for each row execute function public.enforce_same_organization_reference('parent_task_id','tasks');
create trigger tasks_event_org before insert or update of source_event_id,organization_id on public.tasks for each row execute function public.enforce_same_organization_reference('source_event_id','events');
create trigger approvals_task_org before insert or update of task_id,organization_id on public.approvals for each row execute function public.enforce_same_organization_reference('task_id','tasks');
create trigger task_runs_task_org before insert or update of task_id,organization_id on public.task_runs for each row execute function public.enforce_same_organization_reference('task_id','tasks');
create trigger task_runs_agent_org before insert or update of agent_id,organization_id on public.task_runs for each row execute function public.enforce_same_organization_reference('agent_id','agents');
create trigger agent_runs_agent_org before insert or update of agent_id,organization_id on public.agent_runs for each row execute function public.enforce_same_organization_reference('agent_id','agents');
create trigger agent_runs_task_org before insert or update of task_id,organization_id on public.agent_runs for each row execute function public.enforce_same_organization_reference('task_id','tasks');
create trigger agent_runs_event_org before insert or update of event_id,organization_id on public.agent_runs for each row execute function public.enforce_same_organization_reference('event_id','events');
create trigger capabilities_agent_org before insert or update of agent_id,organization_id on public.agent_capabilities for each row execute function public.enforce_same_organization_reference('agent_id','agents');
create trigger settings_agent_org before insert or update of agent_id,organization_id on public.agent_settings for each row execute function public.enforce_same_organization_reference('agent_id','agents');
create trigger schedules_agent_org before insert or update of agent_id,organization_id on public.schedules for each row execute function public.enforce_same_organization_reference('agent_id','agents');
create trigger memories_agent_org before insert or update of agent_id,organization_id on public.agent_memories for each row execute function public.enforce_same_organization_reference('agent_id','agents');
create trigger memories_knowledge_org before insert or update of knowledge_item_id,organization_id on public.agent_memories for each row execute function public.enforce_same_organization_reference('knowledge_item_id','knowledge_items');
create trigger learnings_agent_org before insert or update of created_by_agent_id,organization_id on public.learnings for each row execute function public.enforce_same_organization_reference('created_by_agent_id','agents');
create trigger learnings_knowledge_org before insert or update of knowledge_item_id,organization_id on public.learnings for each row execute function public.enforce_same_organization_reference('knowledge_item_id','knowledge_items');

-- Approval decisions are a single audited operation and cannot mass-assign approval rows.
create or replace function public.decide_approval(p_approval_id uuid,p_status public.approval_status,p_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare item public.approvals%rowtype; begin
  if p_status not in ('approved','rejected') then raise exception 'invalid approval decision'; end if;
  select * into item from public.approvals where id=p_approval_id for update;
  if item.id is null or item.status<>'requested' then raise exception 'approval unavailable'; end if;
  if not public.has_org_role(item.organization_id,array['owner','admin','member']::public.organization_role[]) then raise exception 'not authorized'; end if;
  update public.approvals set status=p_status,decision_note=left(p_note,1000),decided_by=auth.uid() where id=item.id;
  insert into public.activity_log(organization_id,action,actor_type,actor_id,entity_type,entity_id,task_id,summary,metadata)
    values(item.organization_id,'approval.'||p_status::text,'user',auth.uid(),'approval',item.id,item.task_id,
      case when p_status='approved' then 'Approval accepted' else 'Approval rejected' end,jsonb_build_object('decision_note',p_note));
  return item.id;
end $$;
revoke all on function public.decide_approval(uuid,public.approval_status,text) from public;
grant execute on function public.decide_approval(uuid,public.approval_status,text) to authenticated;

-- Expired leases are audited, and only explicitly queued tasks are executable.
create or replace function public.claim_ready_tasks(p_worker_id text,p_batch_size integer default 5,p_lease_seconds integer default 120)
returns setof public.tasks language plpgsql security definer set search_path=public as $$ begin
  if p_batch_size<1 or p_batch_size>20 or p_lease_seconds<15 or p_lease_seconds>900 then raise exception 'invalid claim parameters'; end if;
  with expired as (
    select id,locked_by,attempt_count,max_attempts from public.tasks where status='running' and lease_expires_at<now() for update skip locked
  ), recovered as (
    update public.tasks t set status=case when e.attempt_count>=e.max_attempts then 'failed'::public.task_status else 'queued'::public.task_status end,
      error=case when e.attempt_count>=e.max_attempts then jsonb_build_object('code','lease_expired','message','Worker lease expired after maximum attempts') else t.error end,
      locked_at=null,locked_by=null,lease_expires_at=null from expired e where t.id=e.id
    returning t.id,t.organization_id,t.status,e.locked_by as previous_worker,e.attempt_count
  ) insert into public.activity_log(organization_id,action,actor_type,entity_type,entity_id,task_id,summary,metadata)
    select organization_id,case when status='failed' then 'task.failed' else 'task.lease_recovered' end,'system','task',id,id,
      case when status='failed' then 'Task failed after an expired final lease' else 'Expired task lease recovered' end,
      jsonb_build_object('previous_worker',previous_worker,'attempt_count',attempt_count) from recovered;
  return query with candidates as (
    select t.id from public.tasks t where t.status='queued' and coalesce(t.scheduled_for,now())<=now() and t.attempt_count<t.max_attempts
      and (not t.requires_approval or exists(select 1 from public.approvals a where a.task_id=t.id and a.status='approved'))
      and not exists(select 1 from public.task_dependencies d join public.tasks dep on dep.id=d.depends_on_task_id where d.task_id=t.id and d.required and dep.status<>'completed')
    order by case t.priority when 'urgent' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,t.created_at for update skip locked limit p_batch_size
  ) update public.tasks t set status='running',attempt_count=t.attempt_count+1,locked_at=now(),locked_by=p_worker_id,lease_expires_at=now()+make_interval(secs=>p_lease_seconds)
    from candidates c where t.id=c.id returning t.*;
end $$;
revoke all on function public.claim_ready_tasks(text,integer,integer) from public,anon,authenticated;

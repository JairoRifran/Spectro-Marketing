create or replace function public.create_task_with_policy(payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare org_id uuid:=(payload->>'organization_id')::uuid; agent public.agents%rowtype; task_id uuid; risk public.risk_level:=coalesce((payload->>'risk_level')::public.risk_level,'low'); approval_needed boolean; begin
  if not public.has_org_role(org_id,array['owner','admin','member']::public.organization_role[]) then raise exception 'not authorized'; end if;
  if payload->>'assigned_agent_id' is not null then select * into agent from public.agents where id=(payload->>'assigned_agent_id')::uuid and organization_id=org_id; if agent.id is null then raise exception 'agent not found'; end if; end if;
  approval_needed = risk='high' or (risk='medium' and coalesce(agent.autonomy_level,0)<3);
  insert into public.tasks(organization_id,title,description,type,status,priority,created_by_type,created_by_id,assigned_agent_id,objective_id,reason,expected_impact,risk_level,requires_approval,scheduled_for,idempotency_key,input)
    values(org_id,payload->>'title',payload->>'description',payload->>'type',case when approval_needed then 'waiting_approval'::public.task_status else 'queued'::public.task_status end,
      coalesce((payload->>'priority')::public.task_priority,'medium'),'user',auth.uid(),nullif(payload->>'assigned_agent_id','')::uuid,nullif(payload->>'objective_id','')::uuid,
      payload->>'reason',payload->>'expected_impact',risk,approval_needed,coalesce((payload->>'scheduled_for')::timestamptz,now()),payload->>'idempotency_key',coalesce(payload->'input','{}')) returning id into task_id;
  if approval_needed then insert into public.approvals(organization_id,task_id,risk_level,requested_by_type,requested_by_id,reason,proposed_change,expected_impact)
    values(org_id,task_id,risk,'user',auth.uid(),coalesce(payload->>'reason','Policy requires approval'),coalesce(payload->'input','{}'),payload->>'expected_impact'); end if;
  insert into public.activity_log(organization_id,action,actor_type,actor_id,entity_type,entity_id,task_id,summary)
    values(org_id,case when approval_needed then 'approval.requested' else 'task.created' end,'user',auth.uid(),'task',task_id,task_id,'Task created: '||(payload->>'title'));
  return task_id;
end $$;
revoke all on function public.create_task_with_policy(jsonb) from public; grant execute on function public.create_task_with_policy(jsonb) to authenticated;

-- Let a campaign recover a lease its worker never released.
--
-- claim_campaign_task only ever claimed tasks in 'queued'. A task marked 'running' whose worker
-- died -- a function killed at the platform's time limit, mid-model-call -- was never looked at
-- again by anything. The lease was computed, written, and then read by nobody.
--
-- claim_ready_tasks, used by the general dispatcher, has always recovered expired leases
-- correctly: requeue while attempts remain, fail once they do not, and audit either way. That
-- logic simply never reached the campaign path. With AUTOMATION_ENABLED=false the dispatcher
-- does not run, so nothing recovered a campaign's stale lease and the campaign stayed stuck --
-- reporting itself busy forever, refusing to start, and refusing to resume.
--
-- This could not happen while a deterministic provider answered in milliseconds. It is the first
-- thing that happens once a real model takes most of a minute to answer.
--
-- Two guards are added at the same time, matching claim_ready_tasks:
--   * scheduled_for is honoured, so a retry's backoff is actually waited out instead of being
--     claimed again immediately, which would spend the remaining attempts in one burst.
--   * attempt_count < max_attempts, so an exhausted task is not claimed forever.
--
-- Forward-only: replaces the function, touches no data, drops nothing.

create or replace function public.claim_campaign_task(p_campaign_id uuid,p_worker_id text,p_lease_seconds integer default 120)
returns setof public.tasks language plpgsql security definer set search_path=public as $$ begin
  if p_lease_seconds < 15 or p_lease_seconds > 900 then raise exception 'invalid lease parameters'; end if;

  -- Recover anything this campaign left behind, before looking for new work.
  with expired as (
    select id,locked_by,attempt_count,max_attempts from public.tasks
    where campaign_id=p_campaign_id and status='running' and lease_expires_at<now()
    for update skip locked
  ), recovered as (
    update public.tasks t set
      status=case when e.attempt_count>=e.max_attempts then 'failed'::public.task_status else 'queued'::public.task_status end,
      error=case when e.attempt_count>=e.max_attempts then jsonb_build_object('code','lease_expired','message','Worker lease expired after maximum attempts') else t.error end,
      locked_at=null,locked_by=null,lease_expires_at=null
    from expired e where t.id=e.id
    returning t.id,t.organization_id,t.campaign_id,t.status,e.locked_by as previous_worker,e.attempt_count
  ) insert into public.activity_log(organization_id,campaign_id,action,actor_type,entity_type,entity_id,task_id,summary,metadata)
    select organization_id,campaign_id,
      case when status='failed' then 'task.failed' else 'task.lease_recovered' end,
      'system','task',id,id,
      case when status='failed' then 'Task failed after an expired final lease' else 'Expired task lease recovered' end,
      jsonb_build_object('previous_worker',previous_worker,'attempt_count',attempt_count)
    from recovered;

  return query with candidate as (
    select t.id from public.tasks t
    where t.campaign_id=p_campaign_id and t.status='queued'
      and coalesce(t.scheduled_for,now())<=now()
      and t.attempt_count<t.max_attempts
      and not exists(
        select 1 from public.task_dependencies d
        join public.tasks dep on dep.id=d.depends_on_task_id
        where d.task_id=t.id and d.required and dep.status<>'completed')
    order by t.created_at for update skip locked limit 1
  ) update public.tasks t set status='running',attempt_count=t.attempt_count+1,locked_at=now(),locked_by=p_worker_id,
      lease_expires_at=now()+make_interval(secs=>p_lease_seconds)
    from candidate c where t.id=c.id returning t.*;
end $$;

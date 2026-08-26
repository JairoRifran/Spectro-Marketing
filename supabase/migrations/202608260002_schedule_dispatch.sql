-- Invoked by the secure dispatcher before claiming tasks. Each due occurrence has a deterministic key.
create or replace function public.next_cron_occurrence(expression text,from_time timestamptz,zone text)
returns timestamptz language plpgsql immutable as $$ begin
  return case expression
    when '*/1 * * * *' then date_trunc('minute',from_time)+interval '1 minute'
    when '0 */6 * * *' then from_time+interval '6 hours'
    when '0 9 * * *' then from_time+interval '1 day'
    when '0 9 * * 1' then from_time+interval '7 days'
    else from_time+interval '1 day' end;
end $$;

create or replace function public.materialize_due_schedules(p_limit integer default 20)
returns table(schedule_id uuid,event_id uuid) language plpgsql security definer set search_path=public as $$
declare item public.schedules%rowtype; created_event uuid; occurrence_key text; begin
  if p_limit<1 or p_limit>100 then raise exception 'invalid schedule limit'; end if;
  for item in select * from public.schedules where status='active' and next_run_at<=now() order by next_run_at for update skip locked limit p_limit loop
    occurrence_key=item.idempotency_prefix||':'||extract(epoch from item.next_run_at)::bigint;
    insert into public.events(organization_id,type,source,source_id,payload,idempotency_key,occurred_at)
      values(item.organization_id,item.event_type,'schedule',item.id,item.event_payload,occurrence_key,item.next_run_at)
      on conflict(organization_id,idempotency_key) do update set updated_at=now() returning id into created_event;
    update public.schedules set last_run_at=item.next_run_at,next_run_at=public.next_cron_occurrence(item.cron_expression,item.next_run_at,item.timezone) where id=item.id;
    insert into public.activity_log(organization_id,action,actor_type,entity_type,entity_id,event_id,summary,metadata)
      values(item.organization_id,'schedule.triggered','system','schedule',item.id,created_event,'Schedule '||item.name||' triggered',jsonb_build_object('occurrence_key',occurrence_key));
    schedule_id=item.id; event_id=created_event; return next;
  end loop;
end $$;
revoke all on function public.materialize_due_schedules(integer) from public,anon,authenticated;

create or replace function public.claim_pending_events(p_worker_id text,p_batch_size integer default 20,p_lease_seconds integer default 120)
returns setof public.events language plpgsql security definer set search_path=public as $$ begin
  update public.events set status=case when attempt_count>=max_attempts then 'failed'::public.event_status else 'pending'::public.event_status end,
    locked_at=null,locked_by=null,lease_expires_at=null,
    error=case when attempt_count>=max_attempts then jsonb_build_object('code','event_lease_expired','message','Event lease expired') else error end
  where status='processing' and lease_expires_at<now();
  return query with candidates as (
    select e.id from public.events e where e.status='pending' and e.available_at<=now() and e.attempt_count<e.max_attempts
    order by e.occurred_at for update skip locked limit least(greatest(p_batch_size,1),100)
  ) update public.events e set status='processing',attempt_count=e.attempt_count+1,locked_at=now(),locked_by=p_worker_id,
    lease_expires_at=now()+make_interval(secs=>least(greatest(p_lease_seconds,15),900)) from candidates c where e.id=c.id returning e.*;
end $$;
revoke all on function public.claim_pending_events(text,integer,integer) from public,anon,authenticated;

create or replace function public.complete_onboarding(payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare org_id uuid; org jsonb; item jsonb; first_objective uuid; begin
  org_id=(payload->>'organization_id')::uuid; org=payload->'company';
  if not public.has_org_role(org_id,array['owner','admin']::public.organization_role[]) then raise exception 'not authorized'; end if;
  update public.organizations set name=org->>'name',description=org->>'description',industry=org->>'industry',website=nullif(org->>'website',''),
    country=org->>'country',primary_language=org->>'primary_language',timezone=org->>'timezone',onboarding_completed_at=now() where id=org_id;
  insert into public.brands(organization_id,name,description,slogan,tone_of_voice,personality,preferred_words,forbidden_words,colors,visual_instructions,communication_examples,forbidden_claims)
    values(org_id,payload->'brand'->>'name',payload->'brand'->>'description',nullif(payload->'brand'->>'slogan',''),payload->'brand'->>'tone_of_voice',
      array(select jsonb_array_elements_text(coalesce(payload->'brand'->'personality','[]'))),array(select jsonb_array_elements_text(coalesce(payload->'brand'->'preferred_words','[]'))),
      array(select jsonb_array_elements_text(coalesce(payload->'brand'->'forbidden_words','[]'))),coalesce(payload->'brand'->'colors','[]'),payload->'brand'->>'visual_instructions',
      coalesce(payload->'brand'->'communication_examples','[]'),array(select jsonb_array_elements_text(coalesce(payload->'brand'->'forbidden_claims','[]'))));
  for item in select * from jsonb_array_elements(payload->'products') loop
    insert into public.products(organization_id,name,description,kind,category,value_proposition,price_text,url) values(org_id,item->>'name',item->>'description',coalesce(item->>'kind','product'),item->>'category',item->>'value_proposition',nullif(item->>'price_text',''),nullif(item->>'url',''));
  end loop;
  for item in select * from jsonb_array_elements(payload->'personas') loop
    insert into public.personas(organization_id,name,description,pains,needs,motivations,objections,channels,metadata) values(org_id,item->>'name',item->>'description',
      array(select jsonb_array_elements_text(coalesce(item->'pains','[]'))),array(select jsonb_array_elements_text(coalesce(item->'needs','[]'))),array(select jsonb_array_elements_text(coalesce(item->'motivations','[]'))),
      array(select jsonb_array_elements_text(coalesce(item->'objections','[]'))),array(select jsonb_array_elements_text(coalesce(item->'channels','[]'))),coalesce(item->'metadata','{}'));
  end loop;
  insert into public.objectives(organization_id,title,description,metric,baseline,target,deadline,budget,market,constraints,priority,created_by)
    values(org_id,payload->'objective'->>'title',payload->'objective'->>'description',payload->'objective'->>'metric',nullif(payload->'objective'->>'baseline','')::numeric,
      (payload->'objective'->>'target')::numeric,nullif(payload->'objective'->>'deadline','')::date,nullif(payload->'objective'->>'budget','')::numeric,payload->'objective'->>'market',
      coalesce(payload->'objective'->'constraints','[]'),coalesce((payload->'objective'->>'priority')::public.task_priority,'medium')) returning id into first_objective;
  insert into public.agents(organization_id,role,display_name,description,autonomy_level,system_instructions) values
    (org_id,'cmo','Sofía','Chief Marketing Officer',2,'Coordina estrategia, objetivos, prioridades y delegación.'),
    (org_id,'market_intelligence','Mateo','Market Intelligence',1,'Analiza mercado, competencia, oportunidades y research.'),
    (org_id,'social_media_director','Valentina','Social Media Director',1,'Planifica estrategia social, canales y performance.'),
    (org_id,'content_strategist','Bruno','Content Strategist',1,'Diseña campañas, topics y planes editoriales.'),
    (org_id,'copywriter','Clara','Copywriter',1,'Crea copy, hooks, scripts y captions.'),
    (org_id,'creative_director','Emilia','Creative Director',1,'Protege marca, consistencia visual y briefs creativos.'),
    (org_id,'analytics','Tomás','Analytics',1,'Interpreta métricas, funnels, anomalías e insights.'),
    (org_id,'marketing_auditor','Vera','Marketing Auditor',1,'Audita decisiones y detecta ineficiencias.');
  insert into public.agent_settings(organization_id,agent_id,approval_threshold,max_tasks_per_dispatch)
    select org_id,id,case when role='cmo' then 'high'::public.risk_level else 'medium'::public.risk_level end,3 from public.agents where organization_id=org_id;
  insert into public.agent_capabilities(organization_id,agent_id,capability,description)
    select org_id,a.id,c.capability,c.description from public.agents a cross join lateral (
      select * from (values
        ('cmo','strategy','Define prioridades y coordina el equipo'),('cmo','delegation','Crea trabajo explicable para otros agentes'),
        ('market_intelligence','research','Analiza señales de mercado'),('social_media_director','social_strategy','Planifica canales y calendarios'),
        ('content_strategist','editorial_planning','Diseña campañas y temas'),('copywriter','copywriting','Produce copy y guiones'),
        ('creative_director','brand_governance','Protege consistencia visual'),('analytics','analysis','Interpreta métricas y anomalías'),
        ('marketing_auditor','audit','Cuestiona decisiones e ineficiencias')
      ) as v(role,capability,description) where v.role=a.role
    ) c where a.organization_id=org_id;
  insert into public.schedules(organization_id,name,cron_expression,timezone,event_type,event_payload,agent_id,next_run_at,idempotency_prefix)
    select org_id,'CMO Daily Review','0 9 * * *',coalesce(org->>'timezone','UTC'),'cmo.daily_review.requested',jsonb_build_object('objective_id',first_objective),id,now()+interval '1 minute','cmo-daily-review'
    from public.agents where organization_id=org_id and role='cmo';
  insert into public.activity_log(organization_id,action,actor_type,actor_id,entity_type,entity_id,summary)
    values(org_id,'objective.created','user',auth.uid(),'objective',first_objective,'Primer objetivo creado durante onboarding');
  return first_objective;
end $$;
revoke all on function public.complete_onboarding(jsonb) from public; grant execute on function public.complete_onboarding(jsonb) to authenticated;

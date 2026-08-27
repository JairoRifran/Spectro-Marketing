-- Corrective, forward-only migration.
-- public.complete_onboarding was not safe to retry: the agents insert hit the
-- unique(organization_id, role) constraint and aborted the whole transaction, so a
-- second attempt answered onboarding_failed instead of converging. Every write below
-- is now a no-op when the row already exists, and the objective is reused rather than
-- duplicated so Marketing HQ keeps showing a single primary objective.

create or replace function public.complete_onboarding(payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare org_id uuid; org jsonb; item jsonb; first_objective uuid; created_objective boolean=false; begin
  org_id=(payload->>'organization_id')::uuid; org=payload->'company';
  if not public.has_org_role(org_id,array['owner','admin']::public.organization_role[]) then raise exception 'not authorized'; end if;
  update public.organizations set name=org->>'name',description=org->>'description',industry=org->>'industry',website=nullif(org->>'website',''),
    country=org->>'country',primary_language=org->>'primary_language',timezone=org->>'timezone',onboarding_completed_at=coalesce(onboarding_completed_at,now()) where id=org_id;

  insert into public.brands(organization_id,name,description,slogan,tone_of_voice,personality,preferred_words,forbidden_words,colors,visual_instructions,communication_examples,forbidden_claims)
    select org_id,payload->'brand'->>'name',payload->'brand'->>'description',nullif(payload->'brand'->>'slogan',''),payload->'brand'->>'tone_of_voice',
      array(select jsonb_array_elements_text(coalesce(payload->'brand'->'personality','[]'))),array(select jsonb_array_elements_text(coalesce(payload->'brand'->'preferred_words','[]'))),
      array(select jsonb_array_elements_text(coalesce(payload->'brand'->'forbidden_words','[]'))),coalesce(payload->'brand'->'colors','[]'),payload->'brand'->>'visual_instructions',
      coalesce(payload->'brand'->'communication_examples','[]'),array(select jsonb_array_elements_text(coalesce(payload->'brand'->'forbidden_claims','[]')))
    where not exists(select 1 from public.brands where organization_id=org_id);

  for item in select * from jsonb_array_elements(payload->'products') loop
    insert into public.products(organization_id,name,description,kind,category,value_proposition,price_text,url)
      select org_id,item->>'name',item->>'description',coalesce(item->>'kind','product'),item->>'category',item->>'value_proposition',nullif(item->>'price_text',''),nullif(item->>'url','')
      where not exists(select 1 from public.products where organization_id=org_id and name=item->>'name');
  end loop;

  for item in select * from jsonb_array_elements(payload->'personas') loop
    insert into public.personas(organization_id,name,description,pains,needs,motivations,objections,channels,metadata)
      select org_id,item->>'name',item->>'description',
        array(select jsonb_array_elements_text(coalesce(item->'pains','[]'))),array(select jsonb_array_elements_text(coalesce(item->'needs','[]'))),array(select jsonb_array_elements_text(coalesce(item->'motivations','[]'))),
        array(select jsonb_array_elements_text(coalesce(item->'objections','[]'))),array(select jsonb_array_elements_text(coalesce(item->'channels','[]'))),coalesce(item->'metadata','{}')
      where not exists(select 1 from public.personas where organization_id=org_id and name=item->>'name');
  end loop;

  select id into first_objective from public.objectives where organization_id=org_id and title=payload->'objective'->>'title' order by created_at limit 1;
  if first_objective is null then
    insert into public.objectives(organization_id,title,description,metric,baseline,target,deadline,budget,market,constraints,priority,created_by)
      values(org_id,payload->'objective'->>'title',payload->'objective'->>'description',payload->'objective'->>'metric',nullif(payload->'objective'->>'baseline','')::numeric,
        (payload->'objective'->>'target')::numeric,nullif(payload->'objective'->>'deadline','')::date,nullif(payload->'objective'->>'budget','')::numeric,payload->'objective'->>'market',
        coalesce(payload->'objective'->'constraints','[]'),coalesce((payload->'objective'->>'priority')::public.task_priority,'medium'),auth.uid()) returning id into first_objective;
    created_objective=true;
  end if;

  insert into public.agents(organization_id,role,display_name,description,autonomy_level,system_instructions) values
    (org_id,'cmo','Sofía','Chief Marketing Officer',2,'Coordina estrategia, objetivos, prioridades y delegación.'),
    (org_id,'market_intelligence','Mateo','Market Intelligence',1,'Analiza mercado, competencia, oportunidades y research.'),
    (org_id,'social_media_director','Valentina','Social Media Director',1,'Planifica estrategia social, canales y performance.'),
    (org_id,'content_strategist','Bruno','Content Strategist',1,'Diseña campañas, topics y planes editoriales.'),
    (org_id,'copywriter','Clara','Copywriter',1,'Crea copy, hooks, scripts y captions.'),
    (org_id,'creative_director','Emilia','Creative Director',1,'Protege marca, consistencia visual y briefs creativos.'),
    (org_id,'analytics','Tomás','Analytics',1,'Interpreta métricas, funnels, anomalías e insights.'),
    (org_id,'marketing_auditor','Vera','Marketing Auditor',1,'Audita decisiones y detecta ineficiencias.')
    on conflict (organization_id,role) do nothing;

  insert into public.agent_settings(organization_id,agent_id,approval_threshold,max_tasks_per_dispatch)
    select org_id,id,case when role='cmo' then 'high'::public.risk_level else 'medium'::public.risk_level end,3 from public.agents where organization_id=org_id
    on conflict (agent_id) do nothing;

  insert into public.agent_capabilities(organization_id,agent_id,capability,description)
    select org_id,a.id,c.capability,c.description from public.agents a cross join lateral (
      select * from (values
        ('cmo','strategy','Define prioridades y coordina el equipo'),('cmo','delegation','Crea trabajo explicable para otros agentes'),
        ('market_intelligence','research','Analiza señales de mercado'),('social_media_director','social_strategy','Planifica canales y calendarios'),
        ('content_strategist','editorial_planning','Diseña campañas y temas'),('copywriter','copywriting','Produce copy y guiones'),
        ('creative_director','brand_governance','Protege consistencia visual'),('analytics','analysis','Interpreta métricas y anomalías'),
        ('marketing_auditor','audit','Cuestiona decisiones e ineficiencias')
      ) as v(role,capability,description) where v.role=a.role
    ) c where a.organization_id=org_id
    on conflict (agent_id,capability) do nothing;

  insert into public.schedules(organization_id,name,cron_expression,timezone,event_type,event_payload,agent_id,next_run_at,idempotency_prefix)
    select org_id,'CMO Daily Review','0 9 * * *',coalesce(org->>'timezone','UTC'),'cmo.daily_review.requested',jsonb_build_object('objective_id',first_objective),id,now()+interval '1 minute','cmo-daily-review'
    from public.agents where organization_id=org_id and role='cmo'
    on conflict (organization_id,name) do nothing;

  if created_objective then
    insert into public.activity_log(organization_id,action,actor_type,actor_id,entity_type,entity_id,summary)
      values(org_id,'objective.created','user',auth.uid(),'objective',first_objective,'Primer objetivo creado durante onboarding');
  end if;
  return first_objective;
end $$;
revoke all on function public.complete_onboarding(jsonb) from public; grant execute on function public.complete_onboarding(jsonb) to authenticated;

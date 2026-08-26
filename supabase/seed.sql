-- LOCAL DEMO ONLY. Never run this file against production.
do $$ declare org uuid:='00000000-0000-0000-0000-000000000001'; objective uuid:='00000000-0000-0000-0000-000000000010'; begin
  insert into public.organizations(id,name,slug,description,industry,country,primary_language,timezone,onboarding_completed_at)
    values(org,'Northstar Urban','northstar-urban-demo','Empresa ficticia para validar M01.','SaaS B2B','Uruguay','es','America/Montevideo',now()) on conflict(id) do nothing;
  insert into public.objectives(id,organization_id,title,description,metric,baseline,target,deadline,market,priority)
    values(objective,org,'Aumentar registros calificados un 30%','Mejorar adquisición sin sacrificar calidad.','Registros calificados',1240,1612,current_date+47,'Uruguay','high') on conflict(id) do nothing;
  insert into public.brands(organization_id,name,description,tone_of_voice,personality,colors,forbidden_claims)
    values(org,'Northstar Urban','Marca ficticia M01.','Claro, experto y cercano',array['práctica','confiable'],'["#102b2a","#16a47a"]',array['resultados garantizados']) on conflict do nothing;
  insert into public.agents(id,organization_id,role,display_name,description,autonomy_level) values
    ('00000000-0000-0000-0000-000000000101',org,'cmo','Sofía','Chief Marketing Officer',2),
    ('00000000-0000-0000-0000-000000000102',org,'market_intelligence','Mateo','Market Intelligence',1),
    ('00000000-0000-0000-0000-000000000103',org,'social_media_director','Valentina','Social Media Director',1),
    ('00000000-0000-0000-0000-000000000104',org,'content_strategist','Bruno','Content Strategist',1),
    ('00000000-0000-0000-0000-000000000105',org,'copywriter','Clara','Copywriter',1),
    ('00000000-0000-0000-0000-000000000106',org,'creative_director','Emilia','Creative Director',1),
    ('00000000-0000-0000-0000-000000000107',org,'analytics','Tomás','Analytics',1),
    ('00000000-0000-0000-0000-000000000108',org,'marketing_auditor','Vera','Marketing Auditor',1)
    on conflict(organization_id,role) do nothing;
  insert into public.schedules(organization_id,name,cron_expression,timezone,event_type,event_payload,agent_id,next_run_at,idempotency_prefix)
    values(org,'CMO Daily Review','0 9 * * *','America/Montevideo','cmo.daily_review.requested',jsonb_build_object('objective_id',objective),'00000000-0000-0000-0000-000000000101',now(),'demo-cmo-daily') on conflict(organization_id,name) do nothing;
  insert into public.events(organization_id,type,source,payload,idempotency_key)
    values(org,'cmo.daily_review.requested','demo',jsonb_build_object('objective_id',objective),'demo:first-autonomous-loop') on conflict(organization_id,idempotency_key) do nothing;
end $$;

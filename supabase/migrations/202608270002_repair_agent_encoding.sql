-- Corrective, forward-only migration.
-- 202608270001 was first applied to production through a clipboard transfer that read the
-- UTF-8 file with the system ANSI codepage, so every accented literal reached Postgres
-- double-encoded: 'Sofía' stored as 'SofÃ­a', 'delegación' as 'delegaciÃ³n'. Only the five
-- agents whose seed text has no accent escaped it.
--
-- Re-apply 202608270001 with a UTF-8 aware transfer to repair the stored function body,
-- then run this to repair the rows that were already written. Both are idempotent, and
-- every statement keys on the stable role or capability, never on the display name.

update public.agents set display_name='Sofía',
  system_instructions='Coordina estrategia, objetivos, prioridades y delegación.'
  where role='cmo';

update public.agents set display_name='Tomás',
  system_instructions='Interpreta métricas, funnels, anomalías e insights.'
  where role='analytics';

update public.agents set system_instructions='Diseña campañas, topics y planes editoriales.'
  where role='content_strategist';

update public.agent_capabilities set description='Analiza señales de mercado' where capability='research';
update public.agent_capabilities set description='Diseña campañas y temas' where capability='editorial_planning';
update public.agent_capabilities set description='Interpreta métricas y anomalías' where capability='analysis';

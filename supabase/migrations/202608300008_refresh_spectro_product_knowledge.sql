-- Refresh the managed knowledge used by Spectro Marketing's own campaigns.
-- Other tenants are untouched; on databases without this organization the migration is a no-op.

with org as (
  select id from public.organizations where name = 'Spectro Marketing' limit 1
)
delete from public.knowledge_items
where source = 'spectro:product-knowledge'
  and organization_id in (select id from org);

with org as (
  select id from public.organizations where name = 'Spectro Marketing' limit 1
)
insert into public.knowledge_items (organization_id, title, content, type, source, created_by_type)
select org.id, item.title, item.content, item.type::public.knowledge_type,
  'spectro:product-knowledge', 'user'
from org, (values
('Spectro Marketing: sistema operativo de marketing automatizable', $txt$
Spectro Marketing es un sistema operativo de marketing multi-tenant que centraliza marca,
productos, audiencias, objetivos, decisiones, contenido e integraciones en PostgreSQL como fuente
unica de verdad. Puede automatizar de punta a punta el trabajo repetitivo: estrategia, plan,
copy, revision, recursos visuales y de audio, aprobaciones y entrega al publicador cuando el canal
esta autorizado. Automatizacion no significa ausencia de gobierno: aprobaciones, gasto, canales y
modo de publicacion son controles configurables. Sus agentes especializados trabajan mediante
tareas persistentes, reintentables, idempotentes y auditadas.
$txt$, 'company'),
('Flujo completo que Spectro puede automatizar', $txt$
El flujo conectado es objetivo -> Campaign Brain -> brief versionado -> aprobacion estrategica ->
Content Factory -> plan por canal -> copy nativo -> revision creativa -> imagenes, voz o musica ->
aprobacion segun politica -> publicacion mediante una integracion autorizada. La aprobacion de
contenido y el modo de publicacion son independientes y empiezan en modo humano seguro. El motor
autonomo usa eventos, horarios, tareas cortas, leases, reintentos e idempotencia. En produccion el
cron y la ejecucion autonoma programada siguen desactivados. Posicionamiento permitido: Spectro
puede automatizar la operacion de marketing de punta a punta con controles configurables.
$txt$, 'product'),
('Campaign Brain: del objetivo a una estrategia auditable', $txt$
Campaign Brain comienza con un objetivo y termina en un Campaign Brief versionado. Ejecuta cinco
etapas encadenadas y reanudables: borrador, investigacion, canales, pilares y angulos, y brief
final. Cada etapa recibe la marca completa, productos, personas, el contenido del conocimiento y
la salida previa. Declara supuestos y vacios externos. Las afirmaciones prohibidas se validan de
forma deterministica antes de que el brief quede listo. Campaign Brain decide la estrategia;
Content Factory produce las piezas.
$txt$, 'product'),
('Content Factory: piezas nativas con linaje completo', $txt$
Content Factory toma un brief aprobado, distribuye pilares por peso de canal y crea piezas nativas
para Instagram, Facebook, TikTok, YouTube Shorts y LinkedIn. El plan es deterministico; el copy y
la revision creativa usan un modelo real. Cada pieza conserva campaña, concepto, plataforma,
formato, version, agente, revisiones, aprobacion y actividad. Pedir cambios crea una nueva version.
La cadena esta construida, aunque la revision completa todavia debe probarse en produccion.
$txt$, 'product'),
('Produccion visual, voz y musica', $txt$
Spectro compone visuales de marca en medidas reales y genera arte fotografico desde el pilar,
angulo y audiencia. Las imagenes son reales y actualmente usan un proveedor gratuito. Puede
generar voz en off y musica instrumental con ElevenLabs, protegidas por techo de gasto. La voz se
elige por tono y region y no sustituye un acento ausente. La musica adapta su duracion al audio.
Spectro previsualiza frames y audio, pero todavia no renderiza video final.
$txt$, 'product'),
('Publicacion e integraciones: estado actual', $txt$
Spectro tiene catalogo de canales, OAuth seguro, credenciales cifradas, identificador de cuenta,
modos de aprobacion y publicacion, y registros idempotentes. LinkedIn incluye OAuth, campo para id
numerico de pagina, publicador y boton sobre piezas aprobadas. Todavia no hubo una publicacion real
ni hay canal conectado. Publicar como pagina requiere w_organization_social mediante el programa
de partners de LinkedIn. Instagram, Facebook, TikTok y YouTube requieren completar apps, permisos
y revision. Nunca afirmar que todas las redes estan conectadas o que existen resultados reales.
$txt$, 'product'),
('Seguridad, aislamiento, auditoria y control de gasto', $txt$
Cada dato pertenece a una organizacion y esta protegido por RLS. Los clientes de Supabase separan
navegador, usuario SSR y administrador server-only. Credenciales sociales y secretos de apps se
cifran con AES-256-GCM antes de guardarse. La actividad guarda resumenes y correlaciones, no
prompts ni secretos. Los efectos externos usan idempotencia. Audio y recursos pagos respetan
techos por organizacion y campaña, con reserva previa, liquidacion real y liberacion al fallar.
$txt$, 'policy'),
('Lo que Spectro todavia no debe prometer', $txt$
No existe evidencia de una publicacion real y no estan conectadas todas las redes. El cron y la
ejecucion autonoma programada estan desactivados. No programa aun un calendario recurrente desde
la interfaz, no gestiona pauta ni reporta metricas reales, no renderiza video final y sus paginas
legales no fueron revisadas por un profesional calificado. Se puede comunicar la capacidad de
automatizar el flujo completo, pero no como si toda capacidad estuviera activa y comprobada.
$txt$, 'policy'),
('Afirmaciones prohibidas al hablar de Spectro', $txt$
Nunca inventar resultados, mejoras, clientes, usuarios, volumen, benchmarks, casos de exito,
certificaciones, premios o comparaciones cuantitativas. No afirmar que reemplaza al equipo, que
opera sin supervision en produccion, que publica en todas las redes o que genera metricas que no
recibio. Formulacion precisa permitida: Spectro puede automatizar de punta a punta la operacion
repetitiva con aprobaciones y limites configurables. Evitar magia, sin esfuerzo, resultados
garantizados, revolucionario, potenciar, desbloquear y el futuro del marketing.
$txt$, 'policy'),
('A quien le sirve Spectro', $txt$
El perfil principal es quien dirige marketing en una PyME B2B o equipo pequeño y necesita sostener
produccion sin perder criterio. Valora consistencia, velocidad con control, conocimiento reusable
y trazabilidad. Teme perder la voz de marca, recibir contenido generico o administrar otra
herramienta. Spectro conecta decisiones, muestra supuestos, conserva versiones y permite elegir
donde interviene una persona y donde actua una politica automatica.
$txt$, 'persona'),
('Como habla Spectro de si mismo', $txt$
Tono claro, directo, profesional y concreto. Hablar de capacidades demostrables y controles
visibles, no superlativos. La idea central es automatizacion gobernada: Spectro permite automatizar
todo el flujo repetitivo sin obligar a perder control. El usuario decide aprobaciones, limites de
gasto, canales y modo de publicacion. Nombrar limitaciones relevantes aumenta credibilidad.
$txt$, 'brand')
) as item(title, content, type);

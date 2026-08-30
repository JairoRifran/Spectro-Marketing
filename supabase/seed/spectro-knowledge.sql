-- Conocimiento de producto administrado de Spectro Marketing.
-- Se puede ejecutar de nuevo: reemplaza solamente los items escritos por esta fuente.

begin;

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
Spectro Marketing es un sistema operativo de marketing multi-tenant. Centraliza conocimiento de
marca, productos, audiencias, objetivos, decisiones, contenido e integraciones en PostgreSQL como
fuente unica de verdad.

Puede automatizar de punta a punta el trabajo repetitivo: convertir un objetivo en estrategia,
crear un plan, escribir y revisar piezas, producir recursos visuales y de audio, aplicar politicas
de aprobacion y entregar el contenido al publicador cuando el canal y sus permisos estan
configurados. Automatizar todo el flujo no significa operar sin gobierno: cada organizacion puede
mantener aprobacion humana o habilitar politicas automaticas de forma explicita.

Los agentes tienen responsabilidades estables: Sofia dirige la estrategia; Mateo investiga;
Valentina prioriza canales; Bruno diseña pilares, angulos y planes; Clara escribe; Emilia dirige
la ejecucion creativa. Las tareas son persistentes, reintentables, idempotentes y auditadas.
$txt$, 'company'),

('Flujo completo que Spectro puede automatizar', $txt$
El flujo conectado es: objetivo de negocio -> Campaign Brain -> Campaign Brief versionado ->
aprobacion estrategica -> Content Factory -> plan por canal -> copy nativo -> revision creativa ->
imagenes, voz o musica cuando corresponde -> aprobacion segun politica -> publicacion mediante una
integracion autorizada.

La aprobacion de contenido y el modo de publicacion son controles independientes. Ambos empiezan
en modo humano seguro; un propietario puede cambiar cada uno de forma deliberada. El motor
autonomo usa eventos, horarios, tareas cortas, leases, reintentos e idempotencia, no procesos
permanentes. En produccion la ejecucion autonoma programada y el cron siguen desactivados hasta
que el propietario decida habilitarlos.

Posicionamiento permitido: "Spectro puede automatizar la operacion de marketing de punta a punta
con controles configurables". No convertir esa capacidad en la afirmacion falsa de que hoy esta
publicando autonomamente en todos los canales.
$txt$, 'product'),

('Campaign Brain: del objetivo a una estrategia auditable', $txt$
Campaign Brain comienza con un objetivo y termina en un Campaign Brief versionado. Ejecuta cinco
etapas encadenadas y reanudables: borrador estrategico, investigacion, estrategia de canales,
pilares y angulos de contenido, y brief final.

Cada etapa recibe la marca completa, productos, personas y el contenido del conocimiento cargado,
ademas de la salida de las etapas anteriores. La investigacion distingue conocimiento disponible
de vacios externos y declara supuestos. Las palabras y afirmaciones prohibidas se validan de forma
deterministica antes de que el brief quede listo. Campaign Brain decide la estrategia; Content
Factory se ocupa de producir las piezas.
$txt$, 'product'),

('Content Factory: piezas nativas con linaje completo', $txt$
Content Factory toma un brief aprobado, distribuye los pilares segun el peso de cada canal y crea
piezas nativas para Instagram, Facebook, TikTok, YouTube Shorts y LinkedIn. Un carrusel, un post
de LinkedIn y un guion vertical no son el mismo texto recortado: cada formato tiene su propia
estructura validada.

El plan es deterministico; el copy y la revision creativa usan un modelo real. Cada pieza conserva
campaña, concepto, plataforma, formato, version, agente autor, revisiones, aprobacion y actividad.
Pedir cambios crea una nueva version sin sobrescribir la anterior. La cadena de revision esta
construida, aunque todavia debe recorrerse completa en produccion.
$txt$, 'product'),

('Produccion visual, voz y musica', $txt$
Spectro compone visuales de marca en medidas reales de entrega y puede generar arte fotografico a
partir del pilar, angulo y audiencia de la pieza. Las imagenes generadas son reales y actualmente
usan un proveedor gratuito. El resultado se puede descargar como PNG.

Tambien puede generar voz en off y musica instrumental con ElevenLabs. La voz se elige por tono y
region; si no existe una voz valida para la region solicitada, el sistema no sustituye el acento.
La musica evita competir con la voz y adapta su duracion al audio existente. Voz y musica estan
protegidas por el techo de gasto. Spectro previsualiza frames y audio, pero todavia no renderiza un
archivo de video final.
$txt$, 'product'),

('Publicacion e integraciones: estado actual', $txt$
Spectro ya tiene catalogo de canales, OAuth seguro, almacenamiento cifrado de credenciales,
identificador de cuenta externa, modos de aprobacion/publicacion y registros idempotentes de
publicacion. LinkedIn es el publicador mas avanzado: existen el flujo OAuth, el campo para el id
numerico de pagina, el publicador y el boton sobre piezas aprobadas.

Todavia no se realizo ninguna publicacion real y no hay un canal conectado. Publicar como pagina
de LinkedIn requiere que la app obtenga w_organization_social mediante su programa de partners;
la opcion self-service publica como persona y no responde al caso elegido. Instagram, Facebook,
TikTok y YouTube requieren completar sus apps, permisos y revision antes de publicar desde
Spectro. Nunca afirmar que todas las redes estan conectadas o que ya existen resultados reales.
$txt$, 'product'),

('Seguridad, aislamiento, auditoria y control de gasto', $txt$
Cada dato de negocio pertenece a una organizacion y esta protegido por RLS. Los clientes de
Supabase estan separados entre navegador, usuario SSR y administrador server-only. Las
credenciales sociales y secretos de apps se cifran con AES-256-GCM antes de guardarse; la clave
de servicio y la clave de cifrado nunca llegan al cliente.

La actividad guarda resumenes e identificadores de correlacion, no prompts ni secretos. Los
efectos externos se reservan con claves de idempotencia. Audio e imagenes pagas respetan techos
por organizacion y campaña: se reserva antes de llamar al proveedor, se liquida el costo real y
se libera la reserva si falla. Un limite no configurado niega el gasto por defecto.
$txt$, 'policy'),

('Lo que Spectro todavia no debe prometer', $txt$
Estas limitaciones forman parte de la verdad del producto:

- No existe evidencia de una publicacion real desde Spectro. El publicador de LinkedIn esta
  construido pero no probado contra la API real.
- No estan conectadas todas las redes y sus permisos dependen de aprobaciones externas.
- La automatizacion autonoma programada y el cron estan desactivados en produccion.
- No programa todavia un calendario editorial recurrente desde la interfaz.
- No gestiona pauta ni presupuesto publicitario y no reporta metricas reales de alcance,
  impresiones, engagement o conversiones.
- No renderiza video final; compone y previsualiza recursos visuales y de audio.
- Las paginas legales existen pero no fueron revisadas por un profesional calificado.

Se puede comunicar la capacidad de automatizar el flujo completo, pero no presentar una capacidad
construida o configurable como si ya estuviera activa y comprobada en produccion.
$txt$, 'policy'),

('Afirmaciones prohibidas al hablar de Spectro', $txt$
Nunca inventar cifras de resultados, mejoras, clientes, usuarios, volumen procesado, benchmarks,
casos de exito, certificaciones, premios o comparaciones cuantitativas. No afirmar que reemplaza a
un equipo de marketing, que opera sin supervision en produccion, que publica en todas las redes,
que una integracion pendiente ya funciona o que genera metricas que nunca recibio.

Si falta evidencia, reformular sin el dato o declarar el supuesto. Si se habla de automatizacion,
usar una formulacion precisa: Spectro puede automatizar de punta a punta la operacion repetitiva
con aprobaciones y limites configurables. Evitar "magia", "sin esfuerzo", "resultados garantizados",
"revolucionario", "potenciar", "desbloquear" y "el futuro del marketing".
$txt$, 'policy'),

('A quien le sirve Spectro', $txt$
El perfil principal es la persona responsable de marketing en una PyME B2B o un equipo pequeño
que necesita sostener produccion sin perder criterio. Su estrategia suele estar dispersa entre
documentos, conversaciones y la memoria de una persona; la ejecucion repetitiva consume tiempo y
hace dificil explicar por que se eligio una pieza.

Valora consistencia, velocidad con control, reutilizacion del conocimiento y trazabilidad. Sus
objeciones reales son perder la voz de marca, recibir contenido generico, delegar demasiado en IA
y terminar administrando otra herramienta que agrega trabajo. Spectro responde conectando las
decisiones, mostrando supuestos, conservando versiones y permitiendo elegir donde interviene una
persona y donde actua una politica automatica.
$txt$, 'persona'),

('Como habla Spectro de si mismo', $txt$
Tono claro, directo, profesional y concreto. Hablar de capacidades demostrables y controles
visibles, no de sensaciones ni superlativos. Preferir "cada pieza conserva su version, autor y
aprobacion" a "trazabilidad total"; preferir "automatiza del objetivo a la publicacion cuando el
canal esta autorizado" a "el marketing se hace solo".

La idea central actual es automatizacion gobernada: Spectro permite automatizar todo el flujo
repetitivo sin obligar a perder control. El usuario decide las aprobaciones, los limites de gasto,
los canales y el modo de publicacion. Nombrar las limitaciones relevantes aumenta credibilidad.
$txt$, 'brand')

) as item(title, content, type);

commit;

-- Conocimiento de producto de Spectro Marketing.
--
-- Esto no es una migracion: es contenido. Se puede correr de nuevo sin romper nada porque
-- primero borra los items que el mismo script escribio, identificados por su source.
--
-- Lo escrito aca alimenta a los agentes cuando generan campanas, asi que describe lo que la
-- herramienta hace HOY. Un conocimiento que prometa lo que todavia no existe produce contenido
-- de marketing con afirmaciones falsas, y eso no se nota hasta que ya esta publicado.
--
-- El texto usa comillas dolarizadas, asi ningun apostrofo puede romper la sentencia.

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
select org.id, item.title, item.content, item.type::public.knowledge_type, 'spectro:product-knowledge', 'user'
from org, (values

('Que es Spectro Marketing', $txt$
Spectro Marketing es un sistema operativo de marketing multi-tenant. No es una herramienta de
publicacion ni un programador de posts: es la capa que decide QUE hacer y por que, y despues lo
produce.

Funciona con agentes especializados que trabajan sobre una base de datos como fuente unica de
verdad. Cada agente tiene un rol estable y una responsabilidad acotada:

- Sofia (CMO): toma el objetivo de negocio y estructura la campana alrededor de el.
- Mateo (Market Intelligence): investiga el mercado y separa lo que sirve de lo que no.
- Valentina (Social Media): decide en que plataformas vale la pena estar y con cuanto peso.
- Bruno (Content Strategist): convierte la estrategia en pilares, angulos y piezas concretas.
- Clara (Copywriter): escribe cada pieza en el formato nativo de su plataforma.
- Emilia (Creative Director): define como se ve y como se mueve cada pieza.

Nada avanza sin una decision humana registrada. Todo queda con trazabilidad auditada.
$txt$, 'company'),

('Campaign Brain: de un objetivo a un brief aprobable', $txt$
Campaign Brain arranca en un objetivo de negocio y termina en un brief de campana versionado
que una persona puede aprobar o discutir.

En el camino produce, en este orden: investigacion de mercado, definicion de audiencia,
priorizacion de canales, pilares de contenido y angulos. Cada paso queda guardado con su
version, de modo que se puede ver por que la campana quedo como quedo.

La investigacion distingue explicitamente entre lo que sale de conocimiento previo y lo que
requiere fuentes externas, y expone los supuestos y los huecos que no pudo cerrar. Un brief que
no dice de donde sale lo que afirma es un brief que nadie puede auditar.

Campaign Brain no produce ni publica posts. Termina en el brief.
$txt$, 'product'),

('Content Factory: del brief a piezas nativas por plataforma', $txt$
Content Factory toma un brief aprobado y produce piezas concretas, una por plataforma y formato.

Reparte los pilares segun el peso que la estrategia le dio a cada canal, y escribe cada pieza
en el formato nativo de su plataforma: un carrusel de Instagram no es el mismo texto de un post
de LinkedIn con otro recorte. Un control de calidad deterministico revisa cada pieza antes de
que llegue a una persona, y bloquea la que no cumple.

Plataformas soportadas: Instagram, Facebook, TikTok, YouTube Shorts y LinkedIn.

Cada pieza mantiene su linaje completo: de que concepto salio, que agente la escribio, que
version es, quien la reviso y quien la decidio.
$txt$, 'product'),

('Produccion de audio: voz en off y musica', $txt$
Spectro genera la voz en off de una pieza a partir de su propio guion, y una pista instrumental
a partir del tono de la marca.

La voz se pide por lo que se quiere, no por un identificador de proveedor: se elige un tono
-- reflexiva, entusiasta, comercial, cercana, autoritaria o informativa -- y una region --
rioplatense, mexicana, castellana, colombiana o espanol neutro. El tono decide como se lee; la
region decide que voz se usa, porque ningun parametro convierte un acento en otro.

Si la marca pidio una region para la que no hay voz cargada, el sistema no genera nada en vez de
usar otro acento.

La musica es siempre instrumental: una voz en off y una pista cantada compiten por la misma
atencion. Cuando ya existe voz, su duracion real define la de la musica.
$txt$, 'product'),

('Produccion visual: composicion y arte generada', $txt$
Cada pieza se compone como diseno deterministico: tipografia sobre una superficie de marca, a
medidas reales de entrega -- 1080x1350 para carrusel, 1080x1920 para vertical. Es una funcion
pura, asi que la misma pieza siempre produce el mismo frame.

Encima de eso puede generarse arte fotografico. La imagen va detras del texto con un velo que
mantiene el titular legible, y el tema sale de lo que la campana ya decidio: su pilar, su angulo
y para quien es. Si ni la campana ni la pieza describen un sujeto, no se genera imagen.

Todo se puede descargar como paquete: las imagenes como PNG a medida de entrega, el audio, y el
texto para pegar en el compositor de cada red.
$txt$, 'product'),

('Control humano y trazabilidad', $txt$
Es la diferencia central de Spectro frente a un generador de contenido.

Ninguna pieza avanza sola. Aprobar, pedir cambios o rechazar es siempre una accion humana
autenticada, y queda registrada con quien la tomo y cuando. Pedir una revision crea una version
nueva: la anterior queda intacta en el historial, nunca se sobreescribe.

Toda la actividad queda en un registro auditado con resumenes y identificadores de correlacion.
Ese registro nunca contiene prompts, credenciales ni secretos.

Cada fila pertenece a una organizacion y esta protegida a nivel de base de datos. Una
organizacion no puede ver el trabajo de otra, y eso lo garantiza el motor, no el codigo.
$txt$, 'product'),

('Control de gasto', $txt$
Generar audio o imagenes cuesta dinero, asi que Spectro tiene un techo de gasto por organizacion
y por campana.

La postura es negar por defecto: un tope que nunca se configuro vale cero, y cero no autoriza
nada. La decision se toma dentro de la base de datos, bajo bloqueo, en la misma transaccion que
escribe la reserva -- un chequeo en codigo es una lectura que ya quedo vieja para cuando se
escribe.

Primero se reserva, despues se llama al proveedor, y al final se liquida con lo que realmente
costo. Si la llamada falla, la reserva se libera. Un reintento presenta la misma clave y no paga
dos veces.

Antes de gastar, la interfaz muestra cuanto costaria. Nada gasta sin decir cuanto gasta.
$txt$, 'product'),

('Lo que Spectro TODAVIA NO hace', $txt$
Este item existe para que ningun contenido generado prometa algo que no es cierto. Al escribir
sobre Spectro, no se puede afirmar nada de lo siguiente:

- NO publica en redes sociales. No hay integracion con Instagram, Facebook, TikTok, YouTube ni
  LinkedIn. El contenido se produce y se descarga; publicar es manual.
- NO programa publicaciones ni gestiona un calendario de posteo.
- NO gestiona pauta ni presupuesto publicitario.
- NO reporta metricas de rendimiento: alcance, impresiones, engagement, conversiones. Como nada
  se publica desde Spectro, cualquier numero de esos seria inventado.
- NO tiene automatizacion activa. Todo corre por una accion humana explicita.
- NO edita ni renderiza video. Ensambla frames y audio para previsualizar, que no es lo mismo.

Escribir sobre cualquiera de estas cosas como si existieran seria una afirmacion falsa sobre el
propio producto.
$txt$, 'policy'),

('Afirmaciones prohibidas al hablar de Spectro', $txt$
Nunca afirmar, en ninguna pieza:

- Cifras de resultados, porcentajes de mejora o casos de exito. No hay clientes con resultados
  medidos todavia.
- Numeros de usuarios, empresas o volumen procesado.
- Comparaciones cuantitativas con competidores.
- Que el marketing se hace "solo" o "sin intervencion humana". Es lo contrario de como funciona:
  el control humano es la caracteristica, no una limitacion.
- Que reemplaza a un equipo de marketing. Coordina y produce; decide una persona.
- Certificaciones, premios o integraciones que no existen.

Cuando haga falta un dato duro que no se tiene, es preferible reformular la idea sin el numero
antes que inventarlo.
$txt$, 'policy'),

('A quien le sirve Spectro', $txt$
Perfil principal: responsable de marketing en una PyME B2B, tipicamente equipo de una a cinco
personas, sin estructura para sostener produccion constante de contenido.

El problema real: el equipo dedica gran parte de la semana a tareas repetitivas que nadie
documento nunca. La estrategia existe en la cabeza de alguien y se pierde entre la ejecucion.

Lo que valora: no producir mas rapido, sino producir con criterio y poder explicar por que se
publico lo que se publico. La trazabilidad no es burocracia para este perfil; es lo que le
permite defender decisiones ante su direccion.

Objeciones frecuentes: miedo a perder control sobre la voz de la marca, desconfianza hacia
contenido generado que suena generico, y experiencias previas con herramientas que prometieron
automatizacion y dejaron mas trabajo del que sacaron.
$txt$, 'persona'),

('Como habla Spectro de si mismo', $txt$
Tono: claro y directo. Sin jerga de producto, sin superlativos, sin promesas de transformacion.

Principios de escritura:

- Decir lo que la herramienta hace, no lo que se siente usarla.
- Preferir un ejemplo concreto a un adjetivo. "Cada pieza guarda quien la aprobo y cuando" dice
  mas que "trazabilidad total".
- Nombrar las limitaciones cuando son relevantes. Una herramienta que dice lo que no hace es mas
  creible que una que solo enumera virtudes.
- No hablarle al lector como si no supiera hacer su trabajo.
- Evitar "revolucionario", "potenciar", "desbloquear", "game changer" y cualquier variante de
  "el futuro del marketing".

El control humano es el argumento central, no una nota al pie. La mayoria de las herramientas de
esta categoria venden que sacan a la persona del medio; Spectro vende lo contrario.
$txt$, 'brand')

) as item(title, content, type);

commit;

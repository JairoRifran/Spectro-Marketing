// A page that has to exist before any of these apps can be submitted.
//
// Meta and LinkedIn both refuse to submit an app without a reachable privacy policy, so the
// integration guide hands out this URL — and a URL in a guide that returns 404 is worse than no
// URL at all. What is written here is a factual description of what this system does with data,
// which is the part that can be stated accurately. It is not legal advice and has not been
// reviewed by anyone qualified to give it; the screen that links here says so.

export const metadata = { title: "Política de privacidad · Spectro" };

export default function Page() {
  return (
    <main className="legal-page">
      <h1>Política de privacidad</h1>
      <p className="legal-note">
        Documento pendiente de revisión legal. Describe con precisión lo que el sistema hace hoy con
        los datos, y por eso sirve para completar los formularios de las plataformas, pero conviene
        que lo revise alguien calificado antes de una presentación formal.
      </p>

      <h2>Qué datos se guardan</h2>
      <p>
        Datos de la cuenta de quien usa el sistema (nombre y correo), los datos de marketing que cada
        organización carga —marca, productos, audiencias, conocimiento— y el contenido que el sistema
        produce a partir de ellos. Cada fila pertenece a una organización y está aislada a nivel de
        base de datos: una organización no puede leer el trabajo de otra.
      </p>

      <h2>Datos de redes sociales</h2>
      <p>
        Cuando se conecta una cuenta, se guarda el identificador público de esa cuenta y los tokens
        de acceso necesarios para publicar en nombre de ella. Los tokens se usan únicamente para las
        acciones que la organización solicita y no se comparten con terceros. Desconectar la cuenta
        los elimina.
      </p>

      <h2>Proveedores externos</h2>
      <p>
        El sistema se apoya en proveedores para generar texto, voz, música e imágenes. Se les envía
        el contenido necesario para producir la pieza pedida. No se les envían credenciales ni datos
        de las cuentas conectadas.
      </p>

      <h2>Registro de actividad</h2>
      <p>
        Toda acción relevante queda registrada con un resumen y un identificador de correlación, para
        que una organización pueda auditar qué se hizo y quién lo decidió. Ese registro no contiene
        prompts, credenciales ni secretos.
      </p>

      <h2>Eliminación</h2>
      <p>
        Una organización puede solicitar la eliminación de sus datos. Al eliminarse la organización,
        se eliminan en cascada su contenido, su conocimiento y sus conexiones.
      </p>
    </main>
  );
}

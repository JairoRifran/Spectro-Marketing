// Required by the same portals as the privacy policy, and linked from the same guide.
// Factual, pending review: see the note in the privacy page.

export const metadata = { title: "Términos de uso · Spectro" };

export default function Page() {
  return (
    <main className="legal-page">
      <h1>Términos de uso</h1>
      <p className="legal-note">
        Documento pendiente de revisión legal. Describe cómo funciona el servicio hoy.
      </p>

      <h2>Qué es este servicio</h2>
      <p>
        Spectro produce material de marketing a partir de los objetivos y el conocimiento que cada
        organización carga. La organización es responsable de lo que decide publicar.
      </p>

      <h2>Contenido generado</h2>
      <p>
        El contenido lo produce un modelo de lenguaje y puede contener errores. El sistema aplica
        controles determinísticos de marca y calidad, pero un control automático no reemplaza el
        criterio de una persona: la responsabilidad editorial de lo publicado es de la organización.
      </p>

      <h2>Publicación</h2>
      <p>
        Cuando una organización conecta una red social, autoriza al sistema a publicar en su nombre
        según la configuración que elija. Esa configuración —revisión humana o automática— es de la
        organización, y queda registrada con quién la decidió.
      </p>

      <h2>Uso aceptable</h2>
      <p>
        No puede usarse para producir contenido engañoso, suplantar a personas u organizaciones, ni
        para vulnerar los términos de las plataformas donde se publique.
      </p>
    </main>
  );
}

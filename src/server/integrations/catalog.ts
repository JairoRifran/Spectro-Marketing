import type { SupportedPlatform } from "@/server/content/platforms";

// How to connect each channel, as steps rather than as requirements.
//
// The first version of this listed what each platform demands. That is not the same as telling
// someone what to do: a requirement says what is missing, and a person staring at it still has
// to work out where to go and in what order. So this is the order, with the portal for each step
// and what comes out of it.
//
// Two things are deliberately vague and one is deliberately precise. The exact wording of menus
// inside each portal changes often enough that naming buttons would age into wrong instructions,
// so steps describe the thing to achieve rather than the clicks. Review timelines are given as
// ranges because they are outside anyone's control. What is precise is the credential each step
// produces, because that is what has to end up in the server's environment for any of it to work.
//
// None of this is something the codebase can do. Every path starts with a person creating an app
// under an account they own, and most end with a vendor deciding whether to grant permission.

export interface IntegrationStep {
  title: string;
  detail: string;
  /** The portal where this step happens. Origins only: deep links rot faster than anything else. */
  where?: string;
}

export interface IntegrationSpec {
  platform: SupportedPlatform;
  label: string;
  /** The account type the platform demands. Getting this wrong is the most common dead end. */
  accountType: string;
  /** Roughly how long the slowest step takes, when it is out of your hands. */
  waiting: string;
  steps: IntegrationStep[];
  /** Environment variables this channel needs on the server once the steps are done. */
  credentials: string[];
  /** The honest catch: what still blocks a working connection, stated before anyone starts. */
  blocker: string;
}

const META_PORTAL = "developers.facebook.com";

export const INTEGRATIONS: IntegrationSpec[] = [
  {
    platform: "linkedin",
    label: "LinkedIn",
    accountType: "Página de empresa donde seas administrador",
    waiting: "La habilitación del producto de publicación suele resolverse en días.",
    steps: [
      { title: "Verificá que administrás la página", detail: "Entrá a la página de empresa y confirmá que tu usuario figura como administrador. Sin eso, el paso 4 no se puede completar.", where: "linkedin.com" },
      { title: "Creá una app", detail: "En el portal de desarrolladores, creá una app y asociala a la página de empresa. Te va a pedir un logo y una URL de política de privacidad.", where: "developer.linkedin.com" },
      { title: "Pedí el producto de publicación", detail: "Dentro de la app, en la lista de productos, solicitá el que permite publicar como la organización. Se aprueba por separado del alta de la app.", where: "developer.linkedin.com" },
      { title: "Verificá la app con la página", detail: "LinkedIn genera un enlace de verificación que tiene que abrir un administrador de la página. Si el paso 1 no estaba, se traba acá." },
      { title: "Configurá la URL de retorno", detail: "Agregá como URL autorizada la de este sistema seguida de /api/integrations/linkedin/callback." },
      { title: "Copiá las credenciales", detail: "De la pestaña de autenticación salen el identificador y el secreto de cliente. Van a Vercel como variables de entorno, nunca a un archivo del repositorio ni a un chat." },
    ],
    credentials: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    blocker: "El permiso para publicar se solicita aparte del alta de la app: tener la app no alcanza.",
  },
  {
    platform: "instagram",
    label: "Instagram",
    accountType: "Cuenta profesional vinculada a una página de Facebook",
    waiting: "La revisión de Meta puede llevar de días a varias semanas.",
    steps: [
      { title: "Pasá la cuenta a profesional", detail: "En la app de Instagram, convertí la cuenta a Empresa o Creador. Una cuenta personal no puede publicar por API.", where: "instagram.com" },
      { title: "Vinculala a una página de Facebook", detail: "Desde la configuración de la cuenta, asociala a una página. Meta trata a Instagram como un anexo de la página, no como un producto aparte." },
      { title: "Creá una app de Meta", detail: "Creá una app de tipo Empresa y agregale el producto de Instagram.", where: META_PORTAL },
      { title: "Pedí los permisos de publicación", detail: "Solicitá los permisos de gestión y publicación de contenido. Meta los concede sólo tras revisar la app, y para eso pide un video mostrando el uso real." },
      { title: "Configurá la URL de retorno", detail: "En la configuración de acceso, agregá la URL de este sistema seguida de /api/integrations/instagram/callback." },
      { title: "Copiá las credenciales", detail: "El identificador y la clave secreta de la app van a Vercel como variables de entorno." },
    ],
    credentials: ["META_APP_ID", "META_APP_SECRET"],
    blocker: "Sin la revisión aprobada la app sólo lee: no publica. Es el paso más lento de las cinco redes.",
  },
  {
    platform: "facebook",
    label: "Facebook",
    accountType: "Página, no perfil personal",
    waiting: "Comparte revisión con Instagram: se resuelven juntas.",
    steps: [
      { title: "Usá la misma app que Instagram", detail: "Si ya creaste la app de Meta para Instagram, no hace falta otra. Agregale el producto de páginas." , where: META_PORTAL },
      { title: "Confirmá que administrás la página", detail: "Tu usuario tiene que tener rol de administrador en la página que va a publicar." },
      { title: "Pedí los permisos de páginas", detail: "Solicitá los permisos de gestión y publicación en páginas, en la misma revisión que Instagram." },
      { title: "Configurá la URL de retorno", detail: "La misma app admite varias URLs; agregá la de este sistema seguida de /api/integrations/facebook/callback." },
    ],
    credentials: ["META_APP_ID", "META_APP_SECRET"],
    blocker: "Depende de la misma revisión de Meta que Instagram; no avanza por separado.",
  },
  {
    platform: "tiktok",
    label: "TikTok",
    accountType: "Cuenta de empresa",
    waiting: "La auditoría de contenido suele llevar semanas.",
    steps: [
      { title: "Pasá la cuenta a empresa", detail: "En la configuración de la cuenta, cambiá a cuenta de empresa.", where: "tiktok.com" },
      { title: "Registrate como desarrollador", detail: "Creá una cuenta de desarrollador y una app.", where: "developers.tiktok.com" },
      { title: "Agregá el producto de publicación", detail: "Habilitá en la app la capacidad de subir contenido y pedí los alcances correspondientes." },
      { title: "Configurá la URL de retorno", detail: "Agregá la URL de este sistema seguida de /api/integrations/tiktok/callback." },
      { title: "Solicitá la auditoría de contenido", detail: "Hasta aprobarla, todo lo que se publique por API queda en visibilidad privada: se sube, pero no lo ve nadie." },
      { title: "Copiá las credenciales", detail: "La clave y el secreto de cliente van a Vercel como variables de entorno." },
    ],
    credentials: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    blocker: "Antes de la auditoría se puede publicar, pero en privado. Conviene saberlo antes de programar nada.",
  },
  {
    platform: "youtube_shorts",
    label: "YouTube Shorts",
    accountType: "Canal de YouTube con acceso de propietario",
    waiting: "La ampliación de cuota, si hace falta, puede llevar semanas.",
    steps: [
      { title: "Creá un proyecto", detail: "Creá un proyecto en la consola de Google Cloud. Es gratis y no requiere facturación para este uso.", where: "console.cloud.google.com" },
      { title: "Habilitá la API de datos de YouTube", detail: "En la biblioteca de APIs del proyecto, habilitá YouTube Data API v3." },
      { title: "Configurá la pantalla de consentimiento", detail: "Completá el formulario de consentimiento OAuth con los datos de la organización." },
      { title: "Creá credenciales OAuth", detail: "Creá un identificador de cliente de tipo aplicación web y agregá como URL autorizada la de este sistema seguida de /api/integrations/youtube/callback." },
      { title: "Verificá el proyecto", detail: "Sin verificación, los videos subidos por API quedan como no listados aunque el canal esté en orden." },
      { title: "Mirá la cuota antes de programar", detail: "La cuota diaria por defecto alcanza para unas pocas subidas. Ampliarla se solicita y se aprueba caso por caso." },
    ],
    credentials: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    blocker: "La cuota inicial es el límite real: no es cuestión de permisos sino de cuántas subidas por día entran.",
  },
];

export const integrationFor = (platform: string) => INTEGRATIONS.find((item) => item.platform === platform) ?? null;

import type { SupportedPlatform } from "@/server/content/platforms";

// What each channel actually requires before anything can be published to it.
//
// "Connect Instagram" is a button in most products and a multi-week errand in reality: a
// developer app, a review by the vendor, a business account of the right kind, and scopes that
// are only granted to apps that passed that review. A screen that hides this shows a connect
// button that cannot work and turns a platform's requirement into our bug.
//
// So the catalogue states the requirement per channel, in the order it has to be satisfied, and
// the screen shows it. None of these are things this codebase can do on its own: every one of
// them starts with a person creating an app under an account they own.

export interface IntegrationRequirement {
  label: string;
  /** Why it exists, so a requirement does not read as bureaucracy. */
  detail: string;
}

export interface IntegrationSpec {
  platform: SupportedPlatform;
  label: string;
  /** The account type the platform demands. Getting this wrong is the most common dead end. */
  accountType: string;
  requirements: IntegrationRequirement[];
  /** Honest note about what still blocks a working connection today. */
  blocker: string;
}

const APP = {
  label: "App de desarrollador",
  detail: "Una aplicación creada en el portal de la plataforma, bajo una cuenta que controles vos.",
};
const OAUTH = {
  label: "Cliente OAuth y URL de retorno",
  detail: "Identificador y secreto de cliente, más la URL a la que la plataforma devuelve al usuario tras autorizar.",
};

export const INTEGRATIONS: IntegrationSpec[] = [
  {
    platform: "instagram",
    label: "Instagram",
    accountType: "Cuenta profesional vinculada a una página de Facebook",
    requirements: [
      APP,
      OAUTH,
      { label: "Revisión de la plataforma", detail: "Publicar en nombre de una cuenta requiere permisos que Meta concede sólo tras revisar la app." },
      { label: "Vínculo con la página", detail: "La cuenta de Instagram tiene que estar asociada a una página, no ser personal." },
    ],
    blocker: "Sin app revisada por Meta no hay publicación posible, sólo lectura.",
  },
  {
    platform: "facebook",
    label: "Facebook",
    accountType: "Página, no perfil personal",
    requirements: [
      APP,
      OAUTH,
      { label: "Revisión de la plataforma", detail: "Los permisos de publicación en páginas se otorgan tras revisión." },
    ],
    blocker: "Comparte app y revisión con Instagram; se resuelven juntas o no se resuelve ninguna.",
  },
  {
    platform: "linkedin",
    label: "LinkedIn",
    accountType: "Página de empresa con administrador",
    requirements: [
      APP,
      OAUTH,
      { label: "Producto de publicación habilitado", detail: "LinkedIn concede la capacidad de publicar por producto, y hay que solicitarla para la app." },
      { label: "Verificación de la página", detail: "La app tiene que quedar asociada a la página de empresa por un administrador de esa página." },
    ],
    blocker: "El permiso de publicación se solicita por separado del alta de la app.",
  },
  {
    platform: "tiktok",
    label: "TikTok",
    accountType: "Cuenta de empresa",
    requirements: [
      APP,
      OAUTH,
      { label: "Auditoría de contenido", detail: "Hasta pasar la auditoría, lo publicado por la API queda restringido a visibilidad privada." },
    ],
    blocker: "Antes de la auditoría se puede publicar, pero nadie más lo ve. Conviene saberlo antes de programar nada.",
  },
  {
    platform: "youtube_shorts",
    label: "YouTube Shorts",
    accountType: "Canal de YouTube con acceso de propietario",
    requirements: [
      APP,
      OAUTH,
      { label: "Cuota de subida", detail: "La API de YouTube limita subidas diarias por proyecto, y la cuota inicial es baja." },
      { label: "Verificación del proyecto", detail: "Sin verificar, las subidas quedan como no listadas." },
    ],
    blocker: "La cuota por defecto alcanza para unas pocas subidas diarias; ampliarla requiere solicitud.",
  },
];

export const integrationFor = (platform: string) => INTEGRATIONS.find((item) => item.platform === platform) ?? null;

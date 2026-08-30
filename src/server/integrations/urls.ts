import type { SupportedPlatform } from "@/server/content/platforms";

// The things a developer portal asks for that only we can supply.
//
// Every one of these guides ends at a form asking for URLs belonging to this system, and until
// now the guide stopped just short of them. That is the least helpful place to stop: the reader
// has done the work, is looking at the field, and has to guess.
//
// The callback is the one that has to be exact. A redirect URI is matched character for character
// by every one of these platforms — a trailing slash, http instead of https, or the preview
// domain instead of the production one all fail with the same unhelpful "redirect_uri mismatch".
// So it is derived from one place and shown to be copied, never retyped.

/**
 * Where this deployment actually lives.
 *
 * Vercel sets VERCEL_PROJECT_PRODUCTION_URL to the stable production domain, which is what a
 * portal needs: VERCEL_URL points at the individual deployment and changes on every push, so an
 * app registered against it would break on the next deploy.
 */
export function appOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const production = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production}`;
  return "http://localhost:3000";
}

/** The path each platform will call back into. Kept next to the routes that implement them. */
export const CALLBACK_PATH: Record<SupportedPlatform, string> = {
  linkedin: "/api/integrations/linkedin/callback",
  instagram: "/api/integrations/instagram/callback",
  facebook: "/api/integrations/facebook/callback",
  tiktok: "/api/integrations/tiktok/callback",
  youtube_shorts: "/api/integrations/youtube/callback",
};

export function callbackUrl(platform: SupportedPlatform, env?: NodeJS.ProcessEnv) {
  return `${appOrigin(env)}${CALLBACK_PATH[platform]}`;
}

/**
 * The other fields these forms ask for, which are the same for every platform.
 *
 * Privacy policy and terms are not optional paperwork: Meta and LinkedIn both refuse to submit
 * an app without reachable URLs for them, and discovering that at the end of the form is how an
 * afternoon gets lost.
 */
export function commonPortalFields(env?: NodeJS.ProcessEnv) {
  const origin = appOrigin(env);
  return [
    { label: "Dominio de la app", value: new URL(origin).host },
    { label: "URL del sitio", value: origin },
    { label: "Política de privacidad", value: `${origin}/legal/privacidad` },
    { label: "Términos de uso", value: `${origin}/legal/terminos` },
  ];
}

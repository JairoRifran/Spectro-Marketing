import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupportedPlatform } from "@/server/content/platforms";

// Which app a connection goes through.
//
// Two sources, one preference. If the organization registered its own developer app, that one is
// used; otherwise the platform's, from the server environment. The order matters: an organization
// that went to the trouble of getting its own app approved did so precisely to stop depending on
// ours, and silently preferring ours would undo that without telling anyone.
//
// The secret is read here and nowhere else. It is never returned to a browser, never put in a
// response body, never logged. Callers get the values or a null, and the screen is told only
// whether a credential exists.

const ENV_KEYS: Record<SupportedPlatform, { id: string; secret: string }> = {
  linkedin: { id: "LINKEDIN_CLIENT_ID", secret: "LINKEDIN_CLIENT_SECRET" },
  instagram: { id: "META_APP_ID", secret: "META_APP_SECRET" },
  facebook: { id: "META_APP_ID", secret: "META_APP_SECRET" },
  tiktok: { id: "TIKTOK_CLIENT_KEY", secret: "TIKTOK_CLIENT_SECRET" },
  youtube_shorts: { id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
};

export interface AppCredentials {
  clientId: string;
  clientSecret: string;
  /** Which app this is, so a person can tell whose review a connection depends on. */
  source: "organization" | "platform";
}

function fromEnv(platform: SupportedPlatform, env: NodeJS.ProcessEnv): AppCredentials | null {
  const keys = ENV_KEYS[platform];
  const clientId = env[keys.id]?.trim();
  const clientSecret = env[keys.secret]?.trim();
  return clientId && clientSecret ? { clientId, clientSecret, source: "platform" } : null;
}

/** The app to use for this organization, preferring its own. */
export async function appCredentials(
  organizationId: string,
  platform: SupportedPlatform,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AppCredentials | null> {
  const { data } = await createAdminClient()
    .from("social_app_credentials")
    .select("client_id,client_secret")
    .eq("organization_id", organizationId)
    .eq("platform", platform)
    .maybeSingle();

  if (data?.client_id && data?.client_secret) {
    return { clientId: data.client_id, clientSecret: data.client_secret, source: "organization" };
  }
  return fromEnv(platform, env);
}

/**
 * Whether a channel can be connected at all, and through whose app.
 *
 * Returns no secret. This is what a screen is allowed to know: that a credential exists and where
 * it came from, so it can show a button instead of a form, or a form instead of a dead end.
 */
export async function credentialStatus(organizationId: string, platform: SupportedPlatform, env: NodeJS.ProcessEnv = process.env) {
  const credentials = await appCredentials(organizationId, platform, env);
  return { configured: Boolean(credentials), source: credentials?.source ?? null };
}

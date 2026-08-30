import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupportedPlatform } from "@/server/content/platforms";
import { DomainError } from "@/server/errors";
import { openSecret, sealSecret, type SecretField } from "./secret-crypto";

export interface SocialToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

function context(organizationId: string, platform: SupportedPlatform, field: SecretField) {
  return { organizationId, platform, field } as const;
}

/** Encrypts a new grant before any value reaches the database client. */
export function sealTokenGrant(
  organizationId: string,
  platform: SupportedPlatform,
  grant: SocialToken,
  env: NodeJS.ProcessEnv = process.env,
) {
  return {
    access_token: sealSecret(grant.accessToken, context(organizationId, platform, "access_token"), env),
    refresh_token: grant.refreshToken
      ? sealSecret(grant.refreshToken, context(organizationId, platform, "refresh_token"), env)
      : null,
    expires_at: grant.expiresAt,
  };
}

/**
 * Reads a token only on the server and upgrades plaintext or old-key values before returning it.
 * A failed rewrite is a hard failure: using the plaintext while leaving it at rest would make the
 * migration look successful when it was not.
 */
export async function socialToken(
  organizationId: string,
  platform: SupportedPlatform,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SocialToken | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("social_tokens")
    .select("access_token,refresh_token,expires_at")
    .eq("organization_id", organizationId)
    .eq("platform", platform)
    .maybeSingle();
  if (error) {
    throw new DomainError("dependency", `No se pudo leer el token social: ${error.code}`, "social_token_read_failed", false);
  }
  if (!data?.access_token) return null;

  const access = openSecret(data.access_token, context(organizationId, platform, "access_token"), env);
  const refresh = data.refresh_token
    ? openSecret(data.refresh_token, context(organizationId, platform, "refresh_token"), env)
    : null;

  if (access.needsRewrite || refresh?.needsRewrite) {
    const { error: updateError } = await admin
      .from("social_tokens")
      .update({
        access_token: sealSecret(access.value, context(organizationId, platform, "access_token"), env),
        refresh_token: refresh ? sealSecret(refresh.value, context(organizationId, platform, "refresh_token"), env) : null,
      })
      .eq("organization_id", organizationId)
      .eq("platform", platform);
    if (updateError) {
      throw new DomainError("dependency", `No se pudo cifrar el token histórico: ${updateError.code}`, "social_token_rewrite_failed", false);
    }
  }

  return { accessToken: access.value, refreshToken: refresh?.value ?? null, expiresAt: data.expires_at };
}

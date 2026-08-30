import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, verifyState } from "@/server/integrations/linkedin";
import { appOrigin } from "@/server/integrations/urls";

// Where LinkedIn sends the browser back.
//
// This route is reachable by anyone, because a redirect target has to be. Everything it trusts
// comes from the signed state rather than from the query string: the organization is the one that
// started the flow, not one a caller can name. Without that, this endpoint would let a stranger
// attach their own LinkedIn account to somebody else's organization.
//
// It always ends in a redirect back to the settings screen with a short reason, never a raw
// error page: a person who just came back from a consent dialog needs to know whether it worked,
// not to read a stack trace.

export const dynamic = "force-dynamic";

function back(reason: string) {
  return Response.redirect(`${appOrigin()}/settings/integrations?linkedin=${reason}`, 302);
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  // The user declined, or LinkedIn refused. Both come back here and neither is a fault.
  const denied = url.searchParams.get("error");
  if (denied) return back(denied === "user_cancelled_login" || denied === "user_cancelled_authorize" ? "cancelado" : "rechazado");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back("incompleto");

  const payload = verifyState(state);
  if (!payload) return back("estado_invalido");

  let grant;
  try {
    grant = await exchangeCode(code);
  } catch {
    // The thrown message is deliberately thin, and even that does not travel in a URL.
    return back("intercambio_fallido");
  }

  const admin = createAdminClient();

  const { error: tokenError } = await admin.from("social_tokens").upsert(
    {
      organization_id: payload.organizationId,
      platform: "linkedin",
      access_token: grant.accessToken,
      refresh_token: grant.refreshToken,
      expires_at: grant.expiresAt,
      scope: grant.scope,
    },
    { onConflict: "organization_id,platform" },
  );
  if (tokenError) return back("guardado_fallido");

  const { error: stateError } = await admin.from("social_integrations").upsert(
    {
      organization_id: payload.organizationId,
      platform: "linkedin",
      status: "connected",
      connected_at: new Date().toISOString(),
      connected_by: payload.userId,
      last_error: null,
      // Non-secret provenance only: what was granted, so a person can see whether the scope they
      // needed actually came back.
      metadata: { scope: grant.scope ?? "", expires_at: grant.expiresAt ?? "" },
    },
    { onConflict: "organization_id,platform" },
  );
  if (stateError) return back("estado_no_guardado");

  await admin.from("activity_log").insert({
    organization_id: payload.organizationId,
    action: "integration.connected",
    actor_type: "user",
    actor_id: payload.userId,
    entity_type: "integration",
    summary: "LinkedIn quedó conectado para publicar en nombre de la organización",
    metadata: { platform: "linkedin", scope: grant.scope ?? "" },
  });

  return back("conectado");
}

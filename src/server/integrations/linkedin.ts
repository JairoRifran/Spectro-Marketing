import { createHmac, timingSafeEqual } from "node:crypto";
import { callbackUrl } from "./urls";

// LinkedIn's half of the connection.
//
// Everything vendor-specific lives here — the two endpoints and the scopes — so that when
// LinkedIn changes something there is one file to read rather than a search. The endpoints are
// stable and documented; the scope list is the part most likely to need adjusting, because a
// platform grants what it approved for your app rather than what you asked for, and an app that
// only got member posting will not be granted the organization scopes no matter what is sent.
//
// The token exchange returns a secret. Nothing in this file logs its response, and callers are
// expected to keep it out of error messages: a token in a log is a token.

export const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";

/**
 * What we ask for.
 *
 * `w_organization_social` is the one that matters: posting as the company page. The identity
 * scopes are what let us show which account was connected, which is the only way a person can
 * confirm they connected the right one.
 */
export const SCOPES = ["openid", "profile", "email", "w_organization_social", "r_organization_social"];

export function isConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.LINKEDIN_CLIENT_ID?.trim() && env.LINKEDIN_CLIENT_SECRET?.trim());
}

/**
 * The `state` parameter, signed rather than stored.
 *
 * It has two jobs: prove the callback belongs to a flow this system started, and carry which
 * organization it was for. A random value in a table would do the first and cost a round trip;
 * signing does both and cannot be forged without the server's own secret. It expires, because a
 * state that never expires is a replay waiting for its moment.
 */
const STATE_TTL_MS = 10 * 60 * 1000;

function stateKey(env: NodeJS.ProcessEnv) {
  const secret = env.INTEGRATION_STATE_SECRET?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("No secret available to sign integration state");
  return secret;
}

export function signState(payload: { organizationId: string; userId: string; issuedAt: number }, env: NodeJS.ProcessEnv = process.env) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", stateKey(env)).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyState(state: string, env: NodeJS.ProcessEnv = process.env) {
  const [body, signature] = state.split(".");
  if (!body || !signature) return null;

  const expected = createHmac("sha256", stateKey(env)).update(body).digest("base64url");
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  // Length-checked first: timingSafeEqual throws on a mismatch rather than returning false.
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as { organizationId: string; userId: string; issuedAt: number };
    if (!payload.organizationId || Date.now() - payload.issuedAt > STATE_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

export function authorizeUrl(state: string, env: NodeJS.ProcessEnv = process.env) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.LINKEDIN_CLIENT_ID!.trim(),
    redirect_uri: callbackUrl("linkedin", env),
    state,
    scope: SCOPES.join(" "),
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface TokenGrant {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
}

/** Exchanges the one-time code for a token. Never logs the response. */
export async function exchangeCode(code: string, env: NodeJS.ProcessEnv = process.env): Promise<TokenGrant> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl("linkedin", env),
      client_id: env.LINKEDIN_CLIENT_ID!.trim(),
      client_secret: env.LINKEDIN_CLIENT_SECRET!.trim(),
    }),
  });

  if (!response.ok) {
    // The body can echo the request, and the request carries the client secret. Only the status
    // travels onward.
    throw new Error(`LinkedIn rejected the token exchange with status ${response.status}`);
  }

  const payload = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!payload.access_token) throw new Error("LinkedIn returned no access token");

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : null,
    scope: payload.scope ?? null,
  };
}

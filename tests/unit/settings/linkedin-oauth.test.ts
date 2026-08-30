import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authorizeUrl, isConfigured, signState, verifyState, SCOPES } from "@/server/integrations/linkedin";

// The connection flow, and the two ways it could go wrong quietly: a forged callback attaching a
// stranger's account to somebody else's organization, and a token reaching somewhere it can be
// read.

const env = {
  LINKEDIN_CLIENT_ID: "client-123",
  LINKEDIN_CLIENT_SECRET: "secret-456",
  INTEGRATION_STATE_SECRET: "state-secret",
  APP_URL: "https://spectro.example",
} as unknown as NodeJS.ProcessEnv;

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const callback = read("../../../src/app/api/integrations/linkedin/callback/route.ts");
const start = read("../../../src/app/api/integrations/linkedin/start/route.ts");
const provider = read("../../../src/server/integrations/linkedin.ts");
const migration = read("../../../supabase/migrations/202608300003_social_tokens.sql");

describe("the state carries what the callback must not be told", () => {
  it("round-trips the organization that started the flow", () => {
    const state = signState({ organizationId: "org-1", userId: "user-1", issuedAt: Date.now() }, env);
    expect(verifyState(state, env)).toMatchObject({ organizationId: "org-1", userId: "user-1" });
  });

  it("refuses a state signed with another secret", () => {
    // Without this, a stranger could name any organization in the query string and attach their
    // own account to it.
    const forged = signState({ organizationId: "org-1", userId: "user-1", issuedAt: Date.now() }, { ...env, INTEGRATION_STATE_SECRET: "otro" } as unknown as NodeJS.ProcessEnv);
    expect(verifyState(forged, env)).toBeNull();
  });

  it("refuses a tampered payload", () => {
    const state = signState({ organizationId: "org-1", userId: "user-1", issuedAt: Date.now() }, env);
    const [, signature] = state.split(".");
    const swapped = `${Buffer.from(JSON.stringify({ organizationId: "org-2", userId: "user-1", issuedAt: Date.now() })).toString("base64url")}.${signature}`;
    expect(verifyState(swapped, env)).toBeNull();
  });

  it("expires, because a state that never does is a replay waiting", () => {
    const old = signState({ organizationId: "org-1", userId: "user-1", issuedAt: Date.now() - 20 * 60 * 1000 }, env);
    expect(verifyState(old, env)).toBeNull();
  });

  it("survives a malformed value without throwing", () => {
    for (const bad of ["", "sinpunto", "a.b", "....", "%%%.%%%"]) expect(verifyState(bad, env)).toBeNull();
  });
});

describe("the authorization request", () => {
  it("asks for the scope that actually posts as the company", () => {
    expect(SCOPES).toContain("w_organization_social");
  });

  it("sends the redirect the screen tells people to register", () => {
    const url = new URL(authorizeUrl("st", env));
    expect(url.searchParams.get("redirect_uri")).toBe("https://spectro.example/api/integrations/linkedin/callback");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("knows when it is not configured", () => {
    expect(isConfigured(env)).toBe(true);
    expect(isConfigured({} as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("what must never leak", () => {
  it("trusts the signed state rather than the query string for the organization", () => {
    expect(callback).toContain("verifyState(state)");
    expect(callback).toContain("payload.organizationId");
    expect(callback).not.toMatch(/searchParams\.get\("organization/);
  });

  it("never puts a vendor response body into an error", () => {
    // The request carried the client secret; the response can echo it.
    expect(provider).toContain("LinkedIn rejected the token exchange with status");
    expect(provider).not.toMatch(/await response\.text\(\)/);
  });

  it("refuses before redirecting when credentials are missing", () => {
    // Sending someone to a consent screen that cannot complete teaches them the button is broken.
    expect(start.indexOf("isConfigured()")).toBeLessThan(start.indexOf("Response.redirect"));
  });

  it("keeps tokens out of every ordinary role", () => {
    // RLS enabled with no policy denies everyone but the service role. That is the design, and a
    // policy added later would silently open it.
    expect(migration).toContain("alter table public.social_tokens enable row level security");
    expect(migration).not.toMatch(/create policy .* on public\.social_tokens/);
  });
});

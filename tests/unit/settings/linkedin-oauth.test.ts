import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authorizeUrl, signState, verifyState, SCOPES } from "@/server/integrations/linkedin";

// The connection flow, and the two ways it could go wrong quietly: a forged callback attaching a
// stranger's account to somebody else's organization, and a token reaching somewhere it can be
// read.

const env = {
  LINKEDIN_CLIENT_ID: "client-123",
  LINKEDIN_CLIENT_SECRET: "secret-456",
  INTEGRATION_STATE_SECRET: "state-secret",
  APP_URL: "https://spectro.example",
} as unknown as NodeJS.ProcessEnv;

const credentials = { clientId: "client-123", clientSecret: "secret-456", source: "platform" as const };

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
    const url = new URL(authorizeUrl("st", credentials, env));
    expect(url.searchParams.get("redirect_uri")).toBe("https://spectro.example/api/integrations/linkedin/callback");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("uses the app it was handed, not one it read for itself", () => {
    // Which app a connection goes through is an organization-level answer, so the module that
    // knows LinkedIn must not also decide whose credentials to use.
    const url = new URL(authorizeUrl("st", { ...credentials, clientId: "propia-999", source: "organization" }, env));
    expect(url.searchParams.get("client_id")).toBe("propia-999");
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

  it("refuses before redirecting when no app is configured", () => {
    // Sending someone to a consent screen that cannot complete teaches them the button is broken.
    expect(start.indexOf("if (!credentials)")).toBeLessThan(start.indexOf("Response.redirect"));
  });

  it("keeps tokens out of every ordinary role", () => {
    // RLS enabled with no policy denies everyone but the service role. That is the design, and a
    // policy added later would silently open it.
    expect(migration).toContain("alter table public.social_tokens enable row level security");
    expect(migration).not.toMatch(/create policy .* on public\.social_tokens/);
  });
});


describe("an organization's own app", () => {
  const credsMigration = read("../../../supabase/migrations/202608300004_org_app_credentials.sql");
  const route = read("../../../src/app/api/integrations/[platform]/credentials/route.ts");
  const resolver = read("../../../src/server/integrations/credentials.ts");

  it("keeps a customer-entered secret exactly as protected as an operator-set one", () => {
    // That a marketing lead typed it into a form rather than an operator setting an environment
    // variable changes nothing about how it has to be kept.
    expect(credsMigration).toContain("alter table public.social_app_credentials enable row level security");
    expect(credsMigration).not.toMatch(/create policy .* on public\.social_app_credentials/);
  });

  it("never echoes the secret back", () => {
    // A response repeating what was just saved puts a client secret in a browser's network log
    // for no reason at all.
    expect(route).toContain('Response.json({ configured: true, source: "organization" })');
    expect(route).not.toContain("clientSecret: parsed.data.clientSecret, source");
  });

  it("prefers the organization's app over the platform's", () => {
    // An organization that got its own app approved did so to stop depending on ours.
    expect(resolver.indexOf('source: "organization"')).toBeLessThan(resolver.indexOf("return fromEnv"));
  });

  it("can be removed, because a credential you cannot rotate is a problem", () => {
    expect(route).toContain("export async function DELETE");
  });

  it("only lets an owner or admin register one", () => {
    expect(route).toContain('context.role !== "owner" && context.role !== "admin"');
  });
});

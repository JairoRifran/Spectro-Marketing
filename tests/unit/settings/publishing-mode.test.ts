import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INTEGRATIONS } from "@/server/integrations/catalog";
import { SUPPORTED_PLATFORMS } from "@/server/content/platforms";
import { appOrigin, callbackUrl, commonPortalFields } from "@/server/integrations/urls";

// Publishing to a real audience under a brand's own name does not come back, and the switch that
// removes the person from that loop is the most consequential control in the product. These
// assert the safe defaults rather than the feature.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const migration = read("../../../supabase/migrations/202608300001_integrations_and_autonomy.sql");
const route = read("../../../src/app/api/settings/publishing-mode/route.ts");
const control = read("../../../src/components/publishing-mode.tsx");
const data = read("../../../src/features/settings/data.ts");

describe("who signs off, by default", () => {
  it("defaults to human review in the database itself", () => {
    // Not in the application, where a missing read or a new code path could skip it.
    expect(migration).toMatch(/publishing_mode text not null default 'human_review'/);
    expect(migration).toMatch(/check \(publishing_mode in \('human_review','autonomous'\)\)/);
  });

  it("reads an unknown value as human review", () => {
    // The safe reading of "we do not know" is that nobody said anything may go out on its own.
    expect(data).toContain('publishing_mode==="autonomous"?"autonomous":"human_review"');
  });

  it("keeps the choice attributable", () => {
    expect(migration).toContain("publishing_mode_updated_by");
    expect(route).toContain("activity_log");
    expect(route).toContain("`org.${gate}_${relaxed ? \"automatic\" : \"human\"}`");
  });

  it("lets only an owner or admin change it", () => {
    expect(route).toContain('context.role !== "owner" && context.role !== "admin"');
  });
});

describe("turning the person off is harder than turning them back on", () => {
  it("asks for a typed confirmation before going autonomous", () => {
    // A toggle invites a flick. This one does not come back.
    expect(control).toContain('const CONFIRM = "AUTOMATICO"');
    expect(control).toContain("typed.trim() !== CONFIRM");
  });

  it("returns to human review with a single press", () => {
    // Making a decision safer must never be harder than making it riskier.
    expect(control).toContain("onClick={() => send(strictValue)}");
  });

  it("says plainly what a deterministic check is not", () => {
    expect(control).toMatch(/aprueba lo que no rompe ninguna regla/);
  });
});

describe("the channel catalogue tells the truth about what is missing", () => {
  it("covers every platform the factory can produce for", () => {
    expect(INTEGRATIONS.map((item) => item.platform).sort()).toEqual([...SUPPORTED_PLATFORMS].sort());
  });

  it("names a real blocker for each, not a generic one", () => {
    const blockers = INTEGRATIONS.map((item) => item.blocker);
    expect(new Set(blockers).size).toBe(blockers.length);
  });

  it("gives steps to follow rather than requirements to contemplate", () => {
    // A requirement says what is missing; a person staring at it still has to work out where to
    // go and in what order.
    for (const item of INTEGRATIONS) {
      expect(item.steps.length, item.platform).toBeGreaterThan(2);
      expect(item.steps.some((step) => step.where), item.platform).toBe(true);
      expect(item.credentials.length, item.platform).toBeGreaterThan(0);
    }
  });

  it("names the environment variables each guide ends in", () => {
    // The point of the guide is a credential on the server. Ending without naming it leaves the
    // last step as "and then somehow".
    for (const item of INTEGRATIONS) {
      for (const name of item.credentials) expect(name, item.platform).toMatch(/^[A-Z][A-Z0-9_]+$/);
    }
  });

  it("points at portals rather than deep links", () => {
    // Deep links inside these portals rot faster than anything else in the guide.
    for (const item of INTEGRATIONS) {
      for (const step of item.steps) {
        if (step.where) expect(step.where, item.platform).not.toContain("/");
      }
    }
  });

  it("puts the reachable channel first", () => {
    // LinkedIn is the fastest to enable and the only one with content already waiting.
    expect(INTEGRATIONS[0]!.platform).toBe("linkedin");
  });

  it("stores no credential anywhere near the application's own database", () => {
    // A token in a table the product reads on every request is a token one query away from a log.
    for (const secret of ["access_token", "refresh_token", "client_secret"]) {
      expect(migration, secret).not.toContain(secret);
    }
  });
});

describe("the migration matches the schema it is written against", () => {
  const foundation = read("../../../supabase/migrations/202608260001_m01_foundation.sql");

  it("casts the role array the way has_org_role declares it", () => {
    // has_org_role takes public.organization_role[]. An uncast literal is text[], and Postgres
    // refuses the policy at create time — which is how the first run of this migration failed.
    expect(foundation).toContain("has_org_role(org_id uuid, allowed public.organization_role[])");
    for (const match of migration.matchAll(/has_org_role\([^)]*\)/g)) {
      expect(match[0]).toContain("::public.organization_role[]");
    }
  });

  it("can be re-run after a failed attempt", () => {
    // A migration nobody dares run twice is a migration nobody dares fix.
    expect(migration).toContain("exception when duplicate_object then null");
  });
});

describe("what the portals ask of us", () => {
  it("derives the callback from the stable production domain, not the deployment", () => {
    // VERCEL_URL points at one deployment and changes on every push, so an app registered
    // against it breaks on the next one.
    expect(callbackUrl("linkedin", { APP_URL: "https://spectro.example" } as unknown as NodeJS.ProcessEnv))
      .toBe("https://spectro.example/api/integrations/linkedin/callback");
    expect(appOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "spectro.vercel.app" } as unknown as NodeJS.ProcessEnv))
      .toBe("https://spectro.vercel.app");
    expect(appOrigin({ APP_URL: "https://spectro.example/" } as unknown as NodeJS.ProcessEnv)).toBe("https://spectro.example");
  });

  it("gives every channel a callback of its own", () => {
    const urls = INTEGRATIONS.map((item) => callbackUrl(item.platform, { APP_URL: "https://x.test" } as unknown as NodeJS.ProcessEnv));
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("offers the fields these forms refuse to submit without", () => {
    // Discovering that a privacy policy is mandatory at the end of the form is how an afternoon
    // gets lost.
    const labels = commonPortalFields({ APP_URL: "https://x.test" } as unknown as NodeJS.ProcessEnv).map((field) => field.label);
    expect(labels).toContain("Política de privacidad");
    expect(labels).toContain("Términos de uso");
  });

  it("points those at pages that exist", () => {
    // A URL in a guide that returns 404 is worse than no URL at all.
    for (const path of ["privacidad", "terminos"]) {
      expect(() => readFileSync(new URL(`../../../src/app/legal/${path}/page.tsx`, import.meta.url))).not.toThrow();
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INTEGRATIONS } from "@/server/integrations/catalog";
import { SUPPORTED_PLATFORMS } from "@/server/content/platforms";

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
    expect(route).toContain("org.publishing_autonomous");
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
    expect(control).toContain('onClick={() => send("human_review")}');
  });

  it("says plainly what a deterministic check is not", () => {
    expect(control).toMatch(/no es\s*\n?\s*un criterio/);
  });
});

describe("the channel catalogue tells the truth about what is missing", () => {
  it("covers every platform the factory can produce for", () => {
    expect(INTEGRATIONS.map((item) => item.platform).sort()).toEqual([...SUPPORTED_PLATFORMS].sort());
  });

  it("names a real blocker for each, not a generic one", () => {
    const blockers = INTEGRATIONS.map((item) => item.blocker);
    expect(new Set(blockers).size).toBe(blockers.length);
    for (const item of INTEGRATIONS) expect(item.requirements.length, item.platform).toBeGreaterThan(1);
  });

  it("stores no credential anywhere near the application's own database", () => {
    // A token in a table the product reads on every request is a token one query away from a log.
    for (const secret of ["access_token", "refresh_token", "client_secret"]) {
      expect(migration, secret).not.toContain(secret);
    }
  });
});

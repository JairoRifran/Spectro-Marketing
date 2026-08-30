import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { campaignCreateSchema } from "@/server/campaigns/schemas";

// Two things the creation form used to say wrongly about how a business works: that it has one
// objective forever, and that which channels it is on is an agent's call.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const form = read("../../../src/components/campaign-create-form.tsx");
const route = read("../../../src/app/api/campaigns/route.ts");
const objectives = read("../../../src/app/api/objectives/route.ts");
const workflow = read("../../../src/server/campaigns/workflow.ts");
const briefs = read("../../../src/server/agents/anthropic/briefs.ts");
const migration = read("../../../supabase/migrations/202608300007_campaign_platforms.sql");

const base = { objectiveId: "0b7d6a1e-2c3f-4d5e-8a9b-0c1d2e3f4a5b" };

describe("an objective is not something typed once", () => {
  it("can be created without leaving the form", () => {
    expect(objectives).toContain('from("objectives")');
    expect(form).toContain('fetch("/api/objectives"');
  });

  it("selects the new one immediately", () => {
    // The reason to write one here is to use it now.
    expect(form).toContain("setObjectiveId(result.id)");
  });

  it("insists on a measure and a number", () => {
    // An objective without a number is a wish, and Campaign Brain reads both to argue a strategy.
    expect(objectives).toContain("metric: z.string()");
    expect(objectives).toContain("target: z.number().finite().positive()");
  });

  it("opens on the draft when there is nothing to choose", () => {
    expect(form).toContain("useState(objectives.length === 0)");
  });

  it("refuses a viewer", () => {
    expect(objectives).toContain('context.role === "viewer"');
  });
});

describe("which channels a campaign may consider", () => {
  it("defaults to no restriction, which is what it always did", () => {
    const parsed = campaignCreateSchema.parse(base);
    expect(parsed.platforms).toEqual([]);
    expect(migration).toContain("not null default '{}'");
  });

  it("accepts only channels the factory can produce for", () => {
    expect(campaignCreateSchema.parse({ ...base, platforms: ["linkedin", "tiktok"] }).platforms).toEqual(["linkedin", "tiktok"]);
    expect(() => campaignCreateSchema.parse({ ...base, platforms: ["threads"] })).toThrow();
  });

  it("stores it and carries it into the strategy", () => {
    expect(route).toContain("preferred_platforms:parsed.data.platforms");
    expect(workflow).toContain("allowedPlatforms");
  });

  it("constrains the strategist without replacing it", () => {
    // An organization may have no presence on a network, or have decided not to be there, and an
    // agent arguing for it is arguing about something already settled. Priority and weight stay
    // the agent's.
    const channels = briefs.slice(briefs.indexOf('"campaign.channel_strategy"'), briefs.indexOf('"campaign.content_plan"'));
    expect(channels).toContain("allowedPlatforms");
    expect(channels).toMatch(/prioridad, rol, formatos y peso/);
  });

  it("says on screen what leaving it blank means", () => {
    expect(form).toMatch(/Valentina evalúa las cinco redes y decide/);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAMPAIGN_STRATEGY_TASK_TYPES, isCampaignStrategyTask, retryAttemptCeiling } from "@/server/campaigns/task-types";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const workflow = read("../../../src/server/campaigns/workflow.ts");
const route = read("../../../src/app/api/campaigns/[id]/run/route.ts");
const page = read("../../../src/app/campaigns/[id]/page.tsx");
const button = read("../../../src/components/campaign-run-button.tsx");

describe("failed Campaign Brain stage recovery", () => {
  it("recognizes only the five strategy stages", () => {
    expect(CAMPAIGN_STRATEGY_TASK_TYPES).toHaveLength(5);
    expect(isCampaignStrategyTask("campaign.research")).toBe(true);
    expect(isCampaignStrategyTask("content.copy")).toBe(false);
  });

  it("preserves earlier attempts and grants at most one new slot when needed", () => {
    expect(retryAttemptCeiling(1, 6)).toBe(6);
    expect(retryAttemptCeiling(6, 6)).toBe(7);
    expect(retryAttemptCeiling(19, 20)).toBe(20);
    expect(retryAttemptCeiling(20, 20)).toBeNull();
  });

  it("requeues the same failed task instead of creating a replacement campaign or task", () => {
    expect(workflow).toContain("requeueFailedCampaignStageForOrganization");
    expect(workflow).toMatch(/\.eq\("status","failed"\)/);
    expect(workflow).toContain('status:"queued"');
    expect(workflow).toContain("attempt_count");
    expect(workflow).not.toMatch(/requeueFailedCampaignStageForOrganization[\s\S]*?\.from\("tasks"\)\.insert/);
  });

  it("records the explicit retry without erasing the original failure evidence", () => {
    expect(workflow).toContain("campaign.stage_retry_requested");
    expect(workflow).toContain("previous_error_code");
    expect(workflow).toContain("previous_attempt_count");
    expect(workflow).toContain('status:"failed",error:failed.error');
    expect(workflow).toContain("max_attempts:failed.max_attempts");
  });

  it("recovers before the route mistakes the request for a new strategy run", () => {
    const recover = route.indexOf("requeueFailedCampaignStageForOrganization(context.orgId");
    const start = route.indexOf("runCampaignBrainForOrganization(context.orgId");
    expect(recover).toBeGreaterThan(-1);
    expect(recover).toBeLessThan(start);
  });

  it("shows an explicit retry control and never retries a terminal failure on mount", () => {
    expect(page).toContain("retryable?");
    expect(page).toContain("retry/>");
    expect(page).not.toMatch(/retry[^>]*auto/);
    expect(button).toContain("Reintentar etapa fallida");
    expect(button).toContain("conserva todo lo ya terminado");
  });

  it("shows the public provider error immediately after a failed request", () => {
    expect(button).toContain("body?.error?.message");
    expect(button).toContain("router.refresh()");
  });
});

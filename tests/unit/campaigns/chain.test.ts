import { describe, expect, it } from "vitest";
import { nextCampaignTasks } from "@/server/campaigns/chain";

describe("what Campaign Brain does next", () => {
  it("ends at the brief, because what follows is a human decision", () => {
    expect(nextCampaignTasks("campaign.strategy.finalize", {}, "t1")).toEqual([]);
  });

  it("ignores a task type that is not part of the chain", () => {
    expect(nextCampaignTasks("content.copy", {}, "t1")).toEqual([]);
  });

  it("carries the campaign forward unchanged", () => {
    const input = { campaignId: "c1", strategyVersion: 2, forbiddenWords: ["revolucionario"] };
    const [next] = nextCampaignTasks("campaign.strategy.draft", input, "t1");
    expect(next!.input).toMatchObject(input);
    expect(next!.input.sourceTaskId).toBe("t1");
  });

  it("hands each step what the step before it produced", () => {
    // Without this every step reads only the original objective: pillars chosen without having
    // seen the research, channels argued without having seen the audience.
    const [research] = nextCampaignTasks("campaign.strategy.draft", { campaignId: "c1" }, "t1", { targetAudience: "PyME B2B" });
    expect(research!.input.upstream).toEqual({ "campaign.strategy.draft": { targetAudience: "PyME B2B" } });

    const [channels] = nextCampaignTasks("campaign.research", research!.input, "t2", { researchMode: "knowledge_based" });
    expect(channels!.input.upstream).toEqual({
      "campaign.strategy.draft": { targetAudience: "PyME B2B" },
      "campaign.research": { researchMode: "knowledge_based" },
    });
  });

  it("keeps what upstream already held when a step produced nothing", () => {
    const carried = { upstream: { "campaign.strategy.draft": { targetAudience: "PyME B2B" } } };
    const [next] = nextCampaignTasks("campaign.research", carried, "t2");
    expect(next!.input.upstream).toEqual(carried.upstream);
  });

  it("assigns each step to the role that owns it", () => {
    const roles = ["campaign.strategy.draft", "campaign.research", "campaign.channel_strategy", "campaign.content_plan"]
      .map((type) => nextCampaignTasks(type, {}, "t1")[0]!.role);
    expect(roles).toEqual(["market_intelligence", "social_media_director", "content_strategist", "cmo"]);
  });
});

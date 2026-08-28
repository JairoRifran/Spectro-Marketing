import { describe, expect, it } from "vitest";
import { buildPipeline, PIPELINE_STAGES, stagesOf, type TaskRow } from "@/server/content-factory/pipeline";

const NOW = "2026-08-27T23:00:00.000Z";
const find = (tasks: TaskRow[], key: string, waiting = 0) => buildPipeline(tasks, waiting, NOW).stages.find((stage) => stage.key === key)!;

describe("agent pipeline snapshot", () => {
  it("reads every stage as idle when nothing is happening", () => {
    const snapshot = buildPipeline([], 0, NOW);
    expect(snapshot.busy).toBe(false);
    expect(snapshot.stages.every((stage) => stage.status === "idle")).toBe(true);
    expect(snapshot.stages.every((stage) => stage.currentTitle === null)).toBe(true);
  });

  it("never invents activity for a stage with no task", () => {
    const snapshot = buildPipeline([{ type: "content.copy", status: "running", title: "Escribir tiktok" }], 0, NOW);
    const emilia = snapshot.stages.find((stage) => stage.key === "creative")!;
    expect(emilia.status).toBe("idle");
    expect(emilia.active).toBe(0);
    expect(emilia.currentTitle).toBeNull();
  });

  it("marks a stage as working only while a task is queued or running", () => {
    expect(find([{ type: "content.copy", status: "running" }], "copy").status).toBe("working");
    expect(find([{ type: "content.copy", status: "queued" }], "copy").status).toBe("working");
    expect(find([{ type: "content.copy", status: "completed" }], "copy").status).toBe("done");
    expect(find([{ type: "content.copy", status: "cancelled" }], "copy").status).toBe("idle");
  });

  it("shows the real task title rather than a generic label", () => {
    const stage = find([{ type: "content.copy", status: "running", title: "Escribir tiktok: Proceso antes que herramienta" }], "copy");
    expect(stage.currentTitle).toBe("Escribir tiktok: Proceso antes que herramienta");
  });

  it("falls back to the stage's own description when a task has no title", () => {
    expect(find([{ type: "content.copy", status: "running", title: null }], "copy").currentTitle).toBe("Escribiendo la pieza");
  });

  it("counts work in flight, finished and failed separately", () => {
    const stage = find([
      { type: "content.copy", status: "running" },
      { type: "content.copy", status: "queued" },
      { type: "content.copy", status: "completed" },
      { type: "content.copy", status: "completed" },
      { type: "content.copy", status: "failed" },
    ], "copy");
    expect(stage.active).toBe(2);
    expect(stage.completed).toBe(2);
    expect(stage.failed).toBe(1);
  });

  it("keeps a failed stage visible instead of hiding the failure", () => {
    const snapshot = buildPipeline([{ type: "content.copy", status: "failed" }], 0, NOW);
    expect(snapshot.totals.failed).toBe(1);
    expect(snapshot.busy).toBe(false);
  });

  it("treats the human stage as working only when a decision is actually pending", () => {
    expect(find([], "human", 0).status).toBe("idle");
    const waiting = find([], "human", 3);
    expect(waiting.status).toBe("working");
    expect(waiting.active).toBe(3);
    expect(waiting.currentTitle).toMatch(/3 piezas esperan/);
  });

  it("uses singular wording for a single pending decision", () => {
    expect(find([], "human", 1).currentTitle).toMatch(/1 pieza espera/);
  });

  it("is busy only while agent work is in flight, not while a human is deciding", () => {
    expect(buildPipeline([], 5, NOW).busy).toBe(false);
    expect(buildPipeline([{ type: "content.plan", status: "queued" }], 0, NOW).busy).toBe(true);
  });

  it("splits the chain into the strategy and content phases in order", () => {
    const snapshot = buildPipeline([], 0, NOW);
    expect(stagesOf(snapshot, "strategy").map((stage) => stage.agentName)).toEqual(["Sofía", "Mateo", "Valentina", "Bruno", "Sofía"]);
    expect(stagesOf(snapshot, "content").map((stage) => stage.agentName)).toEqual(["Bruno", "Clara", "Emilia", "Vos"]);
  });

  it("keys every stage on the stable agent role, never on the display name", () => {
    for (const stage of PIPELINE_STAGES) {
      expect(stage.agentRole).toMatch(/^[a-z_]+$/);
    }
    expect(PIPELINE_STAGES.find((stage) => stage.key === "copy")!.agentRole).toBe("copywriter");
    expect(PIPELINE_STAGES.find((stage) => stage.key === "creative")!.agentRole).toBe("creative_director");
  });

  it("covers every Content Factory task type with a stage", () => {
    const covered = PIPELINE_STAGES.map((stage) => stage.taskType).filter(Boolean);
    for (const type of ["content.plan", "content.copy", "content.creative_review"]) expect(covered).toContain(type);
  });

  it("is deterministic", () => {
    const rows: TaskRow[] = [{ type: "content.copy", status: "running", title: "x" }];
    expect(buildPipeline(rows, 2, NOW)).toEqual(buildPipeline(rows, 2, NOW));
  });
});

// A content approval carries campaign_id, so the campaign strategy panel must exclude them.
// Without the filter it showed a content decision as the strategy decision, and its Approve
// button would have decided the wrong artefact.
describe("campaign approval scoping", () => {
  it("filters content approvals out of the campaign strategy query", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../../../src/features/campaigns/data.ts", import.meta.url), "utf8");
    const line = source.split("\n").find((row) => row.includes('from("approvals")'))!;
    expect(line).toContain('is("content_item_id",null)');
  });
});

// A piece the quality gate sent back has no open approval, so the decision route used to answer
// 409 and the detail page rendered no actions at all: the piece was stuck with no way forward.
// A rewrite is the one outcome that must stay reachable from those states.
describe("revision reachability", () => {
  const read = async (path: string) => {
    const { readFileSync } = await import("node:fs");
    return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
  };

  it("only refuses a missing approval for outcomes that need one", async () => {
    const source = await read("src/app/api/content/[id]/decision/route.ts");
    expect(source).toContain('if (!approval && parsed.data.decision !== "revision")');
    // The approval engine must still be the only path to approved/rejected.
    expect(source).toContain("if (approval) {");
    expect(source.indexOf("decide_approval")).toBeGreaterThan(source.indexOf("if (approval) {"));
  });

  it("offers the rewrite on the states where the piece is stuck", async () => {
    const source = await read("src/app/content/[id]/page.tsx");
    expect(source).toContain('const revisable = ["needs_revision", "rejected"].includes(item.status)');
    expect(source).toContain("pendingDecision || revisable");
    // Approve and reject stay tied to a real pending decision.
    expect(source).toContain('item.status === "waiting_approval" && Boolean(data.approval');
  });

  it("hides approve and reject when there is no decision to make", async () => {
    const source = await read("src/components/content-actions.tsx");
    expect(source).toContain("{!revisionOnly && <button");
    expect(source.match(/\{!revisionOnly && <button/g)!.length).toBe(2);
  });
});

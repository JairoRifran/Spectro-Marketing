import { readFileSync } from "node:fs";
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

  it("tells a task that is running from one that is only queued", () => {
    // These used to be one state, and the screen said "Trabajando ahora" for both. Nothing
    // drains the queue on its own here, so a queued task can sit indefinitely: reading that as
    // work in progress turns "nobody pressed the button" into "this has hung", which sends the
    // person looking for a fault instead of a button.
    expect(find([{ type: "content.copy", status: "running" }], "copy").status).toBe("working");
    expect(find([{ type: "content.copy", status: "queued" }], "copy").status).toBe("queued");
    expect(find([{ type: "content.copy", status: "completed" }], "copy").status).toBe("done");
    expect(find([{ type: "content.copy", status: "cancelled" }], "copy").status).toBe("idle");
  });

  it("still counts a queued task as work the stage owns", () => {
    // Queued is not working, but it is not nothing either: the count is what the screen shows.
    const stage = find([{ type: "content.copy", status: "queued" }, { type: "content.copy", status: "running" }], "copy");
    expect(stage.active).toBe(2);
    expect(stage.status).toBe("working");
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

// Counts alone never explained anything. A stage has to be able to say what it is for and what
// it actually delivered, and both have to come from something real.
describe("stage explanations", () => {
  it("gives every stage a description written for a person, not a task type", () => {
    for (const stage of PIPELINE_STAGES) {
      expect(stage.description.length).toBeGreaterThan(30);
      expect(stage.description).toMatch(/\.$/);
      // No internal vocabulary leaking into the thing a user reads.
      expect(stage.description).not.toMatch(/content\.|campaign\.|task|payload|schema/i);
    }
  });

  it("reports the most recent real task title, not the first row it finds", () => {
    const stage = find([
      { type: "content.copy", status: "completed", title: "Escribir instagram", updatedAt: "2026-08-27T10:00:00.000Z" },
      { type: "content.copy", status: "completed", title: "Escribir linkedin", updatedAt: "2026-08-27T12:00:00.000Z" },
      { type: "content.copy", status: "completed", title: "Escribir tiktok", updatedAt: "2026-08-27T11:00:00.000Z" },
    ], "copy");
    expect(stage.lastTitle).toBe("Escribir linkedin");
  });

  it("has nothing to report for a stage that never ran", () => {
    expect(find([], "copy").lastTitle).toBeNull();
    expect(find([], "human", 2).lastTitle).toBeNull();
  });

  it("still reports what was delivered even when the stage has gone quiet", () => {
    const stage = find([{ type: "content.copy", status: "completed", title: "Escribir linkedin", updatedAt: "2026-08-27T12:00:00.000Z" }], "copy");
    expect(stage.status).toBe("done");
    expect(stage.currentTitle).toBeNull();
    expect(stage.lastTitle).toBe("Escribir linkedin");
  });

  it("orders rows without a timestamp last instead of crashing on them", () => {
    const stage = find([
      { type: "content.copy", status: "completed", title: "Sin fecha" },
      { type: "content.copy", status: "completed", title: "Con fecha", updatedAt: "2026-08-27T09:00:00.000Z" },
    ], "copy");
    expect(stage.lastTitle).toBe("Con fecha");
  });
});

describe("the rail says what is happening, not only that something is", () => {
  const view = readFileSync(new URL("../../../src/components/agent-pipeline.tsx", import.meta.url), "utf8");
  const button = readFileSync(new URL("../../../src/components/campaign-run-button.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../../src/app/globals.css", import.meta.url), "utf8");

  it("puts the actual task on the working card", () => {
    // "Trabajando ahora" says something is happening and never what, so the answer lived only in
    // the panel below and the rail was decoration.
    expect(view).toContain("pipeline-task");
    expect(view).toContain("stage.currentTitle");
  });

  it("stops the button naming a stage it cannot know", () => {
    // It counted its own calls rather than finished work, so a retry advanced the label and it
    // announced the last stage while the first agent was still on the draft.
    // Checked as an absent list rather than an absent phrase: the phrase survives in the comment
    // that explains why it was removed, and that comment is worth more than the assertion.
    expect(button).not.toContain("const STAGES");
    expect(button).toContain('retrying ? "Reintentando…" : "Trabajando…"');
  });

  it("animates only what is actually happening", () => {
    // Motion on an idle card would make idle look busy, which is the confusion the queued and
    // working split exists to remove.
    expect(css).toContain(".pipeline-stage.is-working>button::after");
    expect(css).toContain(".pipeline-stage.is-queued>button{border-style:dashed");
  });

  it("honours a system preference against motion", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});

describe("a working agent is impossible to miss", () => {
  const view = readFileSync(new URL("../../../src/components/agent-pipeline.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../../src/app/globals.css", import.meta.url), "utf8");

  it("keeps something moving while a call is in flight", () => {
    // A model call takes tens of seconds and nothing else changes on its own, so a still card is
    // indistinguishable from a stuck one.
    expect(view).toContain("pipeline-working-dots");
    expect(css).toContain("@keyframes pipeline-bounce");
  });

  it("spins the ring and not the person", () => {
    // Rotating the initials would hide exactly who you are meant to be looking at.
    expect(view).toContain('<i className="pipeline-ring" />');
    expect(css).toContain(".pipeline-ring{position:absolute");
    expect(css).not.toMatch(/\.pipeline-face\{[^}]*animation:pipeline-spin/);
  });

  it("earns attention by contrast rather than by shouting", () => {
    // One card being brighter is a claim; one card being the only bright one is obvious.
    expect(css).toContain(".agent-pipeline.is-busy .pipeline-stage:not(.is-working)>button");
  });

  it("shows these only where work is genuinely happening", () => {
    const stage = view.slice(view.indexOf("function Stage("), view.indexOf("function Phase("));
    expect(stage).toContain('visual === "working" && <i className="pipeline-ring" />');
    expect(stage).toContain('visual === "working" && (');
  });

  it("stops all of it when the system asks for less motion", () => {
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain(".pipeline-ring");
    expect(reduced).toContain(".pipeline-working-dots i");
  });
});

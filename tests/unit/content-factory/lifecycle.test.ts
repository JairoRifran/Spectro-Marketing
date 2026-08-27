import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allowedTransitions, canTransitionContent, CONTENT_STATUSES, contentStatusAfterDecision, isInProduction, isTerminal, nextContentVersion } from "@/server/content-factory/lifecycle";

const migration = readFileSync(new URL("../../../supabase/migrations/202608270005_m02_2b_content_factory.sql", import.meta.url), "utf8");

describe("content lifecycle", () => {
  it("moves forward through the editorial chain", () => {
    const chain = ["concept", "brief", "generating", "creative_review", "ready", "waiting_approval", "approved"] as const;
    for (let index = 0; index < chain.length - 1; index += 1) {
      expect(canTransitionContent(chain[index], chain[index + 1]), `${chain[index]} -> ${chain[index + 1]}`).toBe(true);
    }
  });

  it("refuses to skip review on the way to approval", () => {
    expect(canTransitionContent("brief", "ready")).toBe(false);
    expect(canTransitionContent("generating", "waiting_approval")).toBe(false);
    expect(canTransitionContent("concept", "approved")).toBe(false);
  });

  it("sends a revision back to writing rather than straight to ready", () => {
    expect(allowedTransitions("needs_revision")).toEqual(["generating", "cancelled"]);
    expect(canTransitionContent("needs_revision", "ready")).toBe(false);
    expect(canTransitionContent("needs_revision", "waiting_approval")).toBe(false);
  });

  it("lets a rejected piece be revived through a revision", () => {
    expect(canTransitionContent("rejected", "needs_revision")).toBe(true);
  });

  it("treats approved and cancelled as terminal", () => {
    expect(isTerminal("approved")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(allowedTransitions("approved")).toEqual([]);
    expect(allowedTransitions("cancelled")).toEqual([]);
    for (const status of CONTENT_STATUSES) expect(canTransitionContent("approved", status)).toBe(status === "approved");
  });

  it("allows cancelling from every non-terminal state", () => {
    for (const status of CONTENT_STATUSES) {
      if (isTerminal(status)) continue;
      expect(canTransitionContent(status, "cancelled"), status).toBe(true);
    }
  });

  it("classifies which states still represent work in the factory", () => {
    expect(isInProduction("generating")).toBe(true);
    expect(isInProduction("needs_revision")).toBe(true);
    expect(isInProduction("waiting_approval")).toBe(false);
    expect(isInProduction("approved")).toBe(false);
  });

  it("maps a human decision onto the lifecycle", () => {
    expect(contentStatusAfterDecision("waiting_approval", "approved")).toBe("approved");
    expect(contentStatusAfterDecision("waiting_approval", "rejected")).toBe("rejected");
    expect(contentStatusAfterDecision("waiting_approval", "revision")).toBe("needs_revision");
  });

  it("ignores a decision on a piece that is not waiting for one", () => {
    expect(contentStatusAfterDecision("generating", "approved")).toBe("generating");
  });

  it("increments versions and refuses a nonsense current version", () => {
    expect(nextContentVersion(0)).toBe(1);
    expect(nextContentVersion(2)).toBe(3);
    expect(() => nextContentVersion(-1)).toThrowError();
    expect(() => nextContentVersion(1.5)).toThrowError();
  });
});

describe("database enforces the same lifecycle", () => {
  it("declares every status in the enum", () => {
    for (const status of CONTENT_STATUSES) expect(migration).toContain(`'${status}'`);
  });

  it("rejects an out-of-order transition in a trigger, not only in TypeScript", () => {
    expect(migration).toContain("enforce_content_transition");
    expect(migration).toContain("raise exception 'Invalid content transition");
    expect(migration).toContain("create trigger enforce_content_transition before update of status on public.content_items");
  });

  it("keeps the transition table identical on both sides", () => {
    const pairs: Array<[string, string[]]> = CONTENT_STATUSES.filter((status) => !isTerminal(status)).map((status) => [status, [...allowedTransitions(status)]]);
    for (const [from, targets] of pairs) {
      const clause = migration.match(new RegExp(`when '${from}' then array\\[([^\\]]*)\\]`));
      expect(clause, `missing SQL branch for ${from}`).toBeTruthy();
      const declared = clause![1].split(",").map((value) => value.trim().replace(/'/g, ""));
      expect(declared.sort(), from).toEqual([...targets].sort());
    }
  });

  it("maps an approval decision literally instead of guessing from a note", () => {
    expect(migration).toContain("apply_content_approval");
    expect(migration).not.toMatch(/coalesce\(new\.decision_note,''\)\s*<>\s*''/);
  });

  it("protects every content table with row level security", () => {
    for (const table of ["content_concepts", "content_items", "content_variants", "content_reviews", "content_versions"]) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("public.is_org_member(organization_id)");
  });

  it("keeps a version row unique per content item so a revision cannot overwrite one", () => {
    expect(migration).toContain("unique (content_item_id, version)");
  });
});

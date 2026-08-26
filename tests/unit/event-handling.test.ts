import { describe, expect, it } from "vitest";
import { eventToTask } from "@/server/events/handler";

const base = {
  id: "event-1",
  organization_id: "org-1",
  type: "cmo.daily_review.requested",
  payload: { day: "today" },
  idempotency_key: "once",
  attempt_count: 1,
  max_attempts: 3,
};

describe("event handling", () => {
  it("materializes the CMO review deterministically", () => {
    const task = eventToTask(base, "agent-1");
    expect(task).toMatchObject({
      type: "cmo.daily_review",
      assigned_agent_id: "agent-1",
      source_event_id: "event-1",
      idempotency_key: "event:event-1:cmo-review",
    });
  });

  it("ignores events without an M01 handler", () => {
    expect(eventToTask({ ...base, type: "future.event" })).toBeNull();
  });
});

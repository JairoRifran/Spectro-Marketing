// Content lifecycle. A piece moves forward through named states and never sideways: an
// arbitrary jump is what would let unreviewed copy reach an approval queue, so the transition
// table is the authority and PostgreSQL enforces the same table with a trigger.

export const CONTENT_STATUSES = [
  "concept",
  "brief",
  "generating",
  "creative_review",
  "needs_revision",
  "ready",
  "waiting_approval",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

const TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  concept: ["brief", "cancelled"],
  brief: ["generating", "cancelled"],
  generating: ["creative_review", "needs_revision", "cancelled"],
  creative_review: ["ready", "needs_revision", "cancelled"],
  // A revision goes back to writing, never straight to ready: the new version has to be
  // reviewed again before it can be offered for approval.
  needs_revision: ["generating", "cancelled"],
  ready: ["waiting_approval", "needs_revision", "cancelled"],
  waiting_approval: ["approved", "rejected", "needs_revision", "cancelled"],
  approved: [],
  rejected: ["needs_revision", "cancelled"],
  cancelled: [],
};

export const TERMINAL_STATUSES: readonly ContentStatus[] = ["approved", "cancelled"];

export function canTransitionContent(from: ContentStatus, to: ContentStatus) {
  return from === to || TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: ContentStatus): readonly ContentStatus[] {
  return TRANSITIONS[from];
}

export function isTerminal(status: ContentStatus) {
  return TERMINAL_STATUSES.includes(status);
}

/** Statuses that still represent work in the factory rather than a finished decision. */
export function isInProduction(status: ContentStatus) {
  return ["concept", "brief", "generating", "creative_review", "needs_revision"].includes(status);
}

/**
 * Where a piece lands after a human decision on its approval. Requesting a revision is a
 * third outcome and is modelled explicitly rather than as a rejection, because it keeps the
 * piece alive and produces a new version.
 */
export function contentStatusAfterDecision(status: ContentStatus, decision: "approved" | "rejected" | "revision") {
  if (status !== "waiting_approval") return status;
  if (decision === "approved") return "approved" as const;
  if (decision === "rejected") return "rejected" as const;
  return "needs_revision" as const;
}

export function nextContentVersion(current: number) {
  if (!Number.isInteger(current) || current < 0) throw new Error("Invalid content version");
  return current + 1;
}

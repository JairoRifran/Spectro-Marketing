import type { TaskStatus } from "./types";

export const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  draft: ["pending","queued","cancelled"], pending: ["queued","blocked","waiting_approval","cancelled"],
  queued: ["running","blocked","waiting_approval","cancelled"], running: ["queued","blocked","waiting_approval","completed","failed","cancelled"],
  blocked: ["pending","queued","cancelled"], waiting_approval: ["queued","cancelled"], completed: [], failed: ["queued","cancelled"], cancelled: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus) { return from === to || TASK_TRANSITIONS[from].includes(to); }
export function assertTransition(from: TaskStatus, to: TaskStatus) {
  if (!canTransition(from, to)) throw new Error(`Invalid task transition: ${from} -> ${to}`);
}

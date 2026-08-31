import type { RuntimeTask } from "@/server/tasks/types";
import type { TokenUsage } from "./pricing";

export interface AgentContext { organizationId: string; agent: { id: string; role: string; displayName: string; autonomyLevel: 0|1|2|3; configuration: Record<string,unknown> }; task: RuntimeTask; correlationId: string; }
export interface DelegatedTask { role: string; title: string; description: string; type: string; reason: string; input: Record<string,unknown>; }
/**
 * What one answer cost. Absent when nothing was billed -- a deterministic or local provider.
 *
 * Tokens and dollars travel together because the dollars are derived from a price that can
 * change: a row holding both can be recomputed later, a row holding only money cannot.
 */
export interface AgentRunUsage extends TokenUsage { model: string; costUsd: number }
export interface AgentResult { summary: string; output: Record<string,unknown>; usage?: AgentRunUsage; learnings?: Array<{ observation: string; confidence: number; evidence: unknown[] }>; delegatedTasks?: DelegatedTask[]; }
export interface AgentProvider { readonly name: string; run(context: AgentContext): Promise<AgentResult>; }

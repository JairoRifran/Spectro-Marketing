import type { RuntimeTask } from "@/server/tasks/types";

export interface AgentContext { organizationId: string; agent: { id: string; role: string; displayName: string; autonomyLevel: 0|1|2|3; configuration: Record<string,unknown> }; task: RuntimeTask; correlationId: string; }
export interface DelegatedTask { role: string; title: string; description: string; type: string; reason: string; input: Record<string,unknown>; }
export interface AgentResult { summary: string; output: Record<string,unknown>; learnings?: Array<{ observation: string; confidence: number; evidence: unknown[] }>; delegatedTasks?: DelegatedTask[]; }
export interface AgentProvider { readonly name: string; run(context: AgentContext): Promise<AgentResult>; }

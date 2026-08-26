import type { AgentContext, AgentProvider, AgentResult } from "./contracts";

export class MockProvider implements AgentProvider {
  readonly name = "mock";
  async run(context: AgentContext): Promise<AgentResult> {
    if (context.task.type === "test.fail.retryable") throw Object.assign(new Error("Deterministic retry test"), { retryable: true });
    if (context.task.type === "cmo.daily_review") return {
      summary: "Revisión diaria completada; se delegó el análisis de señales de mercado.",
      output: { provider: "mock", reviewed: ["objectives", "queue", "approvals"], generatedAt: new Date().toISOString() },
      delegatedTasks: [{ role: "market_intelligence", title: "Revisar señales de mercado", description: "Identificar cambios y oportunidades relevantes para los objetivos activos.", type: "market.review_signals", reason: "Seguimiento derivado de la revisión diaria del CMO", input: { sourceTaskId: context.task.id } }],
    };
    return { summary: `Tarea ${context.task.type} completada por MockProvider.`, output: { provider: "mock", deterministic: true, taskType: context.task.type } };
  }
}

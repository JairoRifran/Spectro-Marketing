// The agent pipeline as a read model. It answers one question a person actually asks —
// "where is my work right now, and who has it?" — from the same task rows the runtime writes.
//
// Nothing here invents activity. A stage is only "working" when a task for it is genuinely
// queued or running; when nothing is happening every stage reads idle, which is the honest
// state while AUTOMATION_ENABLED is false and no one has pressed anything.

export type PipelinePhase = "strategy" | "content";
export type StageStatus = "idle" | "working" | "done";

export interface StageDefinition {
  key: string;
  label: string;
  /** Stable M01 agent role. Never the display name. */
  agentRole: string;
  agentName: string;
  phase: PipelinePhase;
  /** Task type that puts work in this stage. Absent for the human decision stage. */
  taskType?: string;
  /** Short line describing what this stage does while it is working. */
  workingLabel: string;
}

export const PIPELINE_STAGES: readonly StageDefinition[] = [
  { key: "strategy_draft", label: "Estrategia", agentRole: "cmo", agentName: "Sofía", phase: "strategy", taskType: "campaign.strategy.draft", workingLabel: "Estructurando la campaña" },
  { key: "research", label: "Research", agentRole: "market_intelligence", agentName: "Mateo", phase: "strategy", taskType: "campaign.research", workingLabel: "Investigando el mercado" },
  { key: "channels", label: "Canales", agentRole: "social_media_director", agentName: "Valentina", phase: "strategy", taskType: "campaign.channel_strategy", workingLabel: "Priorizando canales" },
  { key: "pillars", label: "Pilares", agentRole: "content_strategist", agentName: "Bruno", phase: "strategy", taskType: "campaign.content_plan", workingLabel: "Definiendo pilares y ángulos" },
  { key: "brief", label: "Brief", agentRole: "cmo", agentName: "Sofía", phase: "strategy", taskType: "campaign.strategy.finalize", workingLabel: "Consolidando el brief" },
  { key: "content_plan", label: "Plan editorial", agentRole: "content_strategist", agentName: "Bruno", phase: "content", taskType: "content.plan", workingLabel: "Planificando contenido" },
  { key: "copy", label: "Redacción", agentRole: "copywriter", agentName: "Clara", phase: "content", taskType: "content.copy", workingLabel: "Escribiendo la pieza" },
  { key: "creative", label: "Dirección creativa", agentRole: "creative_director", agentName: "Emilia", phase: "content", taskType: "content.creative_review", workingLabel: "Revisando la dirección visual" },
  { key: "human", label: "Revisión humana", agentRole: "human", agentName: "Vos", phase: "content", workingLabel: "Esperando tu decisión" },
];

export interface TaskRow {
  type: string;
  status: string;
  title?: string | null;
}

export interface PipelineStage extends StageDefinition {
  status: StageStatus;
  active: number;
  completed: number;
  failed: number;
  /** What this stage is on right now, taken from a real task title. */
  currentTitle: string | null;
}

export interface PipelineSnapshot {
  stages: PipelineStage[];
  /** True while any task is queued or running; the UI polls only while this holds. */
  busy: boolean;
  totals: { active: number; completed: number; failed: number };
  waitingApproval: number;
  updatedAt: string;
}

const ACTIVE_STATUSES = ["queued", "running"];

/**
 * Folds task rows and the approval queue into one snapshot. Pure: the same rows always
 * produce the same picture, which is what makes it testable and what stops the UI from
 * animating something the database never said.
 */
export function buildPipeline(tasks: TaskRow[], waitingApproval: number, now: string): PipelineSnapshot {
  const stages: PipelineStage[] = PIPELINE_STAGES.map((definition) => {
    if (!definition.taskType) {
      return {
        ...definition,
        status: waitingApproval > 0 ? "working" : "idle",
        active: waitingApproval,
        completed: 0,
        failed: 0,
        currentTitle: waitingApproval > 0 ? `${waitingApproval} ${waitingApproval === 1 ? "pieza espera" : "piezas esperan"} tu decisión` : null,
      };
    }
    const rows = tasks.filter((task) => task.type === definition.taskType);
    const active = rows.filter((task) => ACTIVE_STATUSES.includes(task.status));
    const completed = rows.filter((task) => task.status === "completed").length;
    const failed = rows.filter((task) => task.status === "failed").length;
    const running = active.find((task) => task.status === "running") ?? active[0];
    return {
      ...definition,
      status: active.length ? "working" : completed > 0 ? "done" : "idle",
      active: active.length,
      completed,
      failed,
      currentTitle: active.length ? running?.title ?? definition.workingLabel : null,
    };
  });

  const totals = stages.reduce(
    (accumulator, stage) => ({
      active: accumulator.active + (stage.taskType ? stage.active : 0),
      completed: accumulator.completed + stage.completed,
      failed: accumulator.failed + stage.failed,
    }),
    { active: 0, completed: 0, failed: 0 },
  );

  return { stages, busy: totals.active > 0, totals, waitingApproval, updatedAt: now };
}

/** Stages belonging to one phase, in order. */
export function stagesOf(snapshot: PipelineSnapshot, phase: PipelinePhase) {
  return snapshot.stages.filter((stage) => stage.phase === phase);
}

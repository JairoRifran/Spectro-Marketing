// The agent pipeline as a read model. It answers one question a person actually asks —
// "where is my work right now, and who has it?" — from the same task rows the runtime writes.
//
// Nothing here invents activity. A stage is "working" only when one of its tasks is actually
// running, and "queued" when work is waiting for someone to press the button; when nothing is
// happening every stage reads idle, which is the honest state while AUTOMATION_ENABLED is false.
//
// Those first two used to be the same state. A queued task made a stage announce "Trabajando
// ahora", so a campaign that had stopped looked like a campaign in progress -- and the obvious
// reading of a stage that says it is working for five minutes is that it hung, when in fact
// nobody had started it. With nothing driving the queue on its own, the difference between
// waiting to run and running is the whole question a person is asking of this screen.

export type PipelinePhase = "strategy" | "content";
export type StageStatus = "idle" | "queued" | "working" | "done";

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
  /**
   * What this stage is for, in the words a person would use. Static on purpose: it explains the
   * role, while the task rows explain what the role actually did.
   */
  description: string;
}

export const PIPELINE_STAGES: readonly StageDefinition[] = [
  { key: "strategy_draft", label: "Estrategia", agentRole: "cmo", agentName: "Sofía", phase: "strategy", taskType: "campaign.strategy.draft", workingLabel: "Estructurando la campaña", description: "Toma el objetivo de negocio y arma la campaña alrededor de él." },
  { key: "research", label: "Research", agentRole: "market_intelligence", agentName: "Mateo", phase: "strategy", taskType: "campaign.research", workingLabel: "Investigando el mercado", description: "Busca qué está pasando en el mercado y separa lo que sirve de lo que no." },
  { key: "channels", label: "Canales", agentRole: "social_media_director", agentName: "Valentina", phase: "strategy", taskType: "campaign.channel_strategy", workingLabel: "Priorizando canales", description: "Decide en qué plataformas vale la pena estar y con cuánto peso cada una." },
  { key: "pillars", label: "Pilares", agentRole: "content_strategist", agentName: "Bruno", phase: "strategy", taskType: "campaign.content_plan", workingLabel: "Definiendo pilares y ángulos", description: "Convierte la estrategia en pilares y ángulos concretos para hablar." },
  { key: "brief", label: "Brief", agentRole: "cmo", agentName: "Sofía", phase: "strategy", taskType: "campaign.strategy.finalize", workingLabel: "Consolidando el brief", description: "Cierra todo en un brief versionado que se puede aprobar o discutir." },
  { key: "content_plan", label: "Plan editorial", agentRole: "content_strategist", agentName: "Bruno", phase: "content", taskType: "content.plan", workingLabel: "Planificando contenido", description: "Reparte los pilares en piezas concretas, una por plataforma y formato." },
  { key: "copy", label: "Redacción", agentRole: "copywriter", agentName: "Clara", phase: "content", taskType: "content.copy", workingLabel: "Escribiendo la pieza", description: "Escribe cada pieza en el formato nativo de su plataforma, no un texto que se copia y pega." },
  { key: "creative", label: "Dirección creativa", agentRole: "creative_director", agentName: "Emilia", phase: "content", taskType: "content.creative_review", workingLabel: "Revisando la dirección visual", description: "Define cómo se ve y cómo se mueve cada pieza antes de que la mires." },
  { key: "human", label: "Revisión humana", agentRole: "human", agentName: "Vos", phase: "content", workingLabel: "Esperando tu decisión", description: "Aprobás, pedís cambios o rechazás. Nada avanza sin que vos lo decidas." },
];

export interface TaskRow {
  type: string;
  status: string;
  title?: string | null;
  /** Used only to pick the most recent row for a stage. Absent rows sort last. */
  updatedAt?: string | null;
}

export interface PipelineStage extends StageDefinition {
  status: StageStatus;
  active: number;
  completed: number;
  failed: number;
  /** What this stage is on right now, taken from a real task title. */
  currentTitle: string | null;
  /**
   * The most recent real task title for this stage, whatever its status. It is what lets a
   * finished or idle stage say what it actually delivered instead of only how many.
   */
  lastTitle: string | null;
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
        lastTitle: null,
      };
    }
    const rows = tasks.filter((task) => task.type === definition.taskType);
    const active = rows.filter((task) => ACTIVE_STATUSES.includes(task.status));
    const inFlight = rows.filter((task) => task.status === "running").length;
    const completed = rows.filter((task) => task.status === "completed").length;
    const failed = rows.filter((task) => task.status === "failed").length;
    const running = active.find((task) => task.status === "running") ?? active[0];
    const latest = [...rows].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
    return {
      ...definition,
      status: inFlight ? "working" : active.length ? "queued" : completed > 0 ? "done" : "idle",
      active: active.length,
      completed,
      failed,
      currentTitle: active.length ? running?.title ?? definition.workingLabel : null,
      lastTitle: latest?.title ?? null,
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

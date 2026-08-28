"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PipelineSnapshot, PipelineStage, StageStatus } from "@/server/content-factory/pipeline";

// Live view of where the work is and who has it.
//
// Built as a rail of people rather than a diagram of boxes. The first version drew nine
// identical discs, so a finished pipeline read as nine anonymous ticks and the counts floated
// with no unit — "16" of what? Here every stage is the agent who does it, with their own colour
// and their state written out, because "Clara · 16 piezas escritas" is understood at a glance
// and a green circle is not.
//
// Every state comes from a real task row. A stage pulses only while an agent genuinely holds
// work; waiting on a person is drawn differently, because at that point the system is doing
// nothing and must not look busy.

/** Poll fast while agents are working, slowly when idle, and never in a tight loop. */
const BUSY_INTERVAL_MS = 3000;
const IDLE_INTERVAL_MS = 15000;

/** Keyed on the stable M01 agent role, never on the display name. */
const TONE: Record<string, string> = {
  cmo: "coral",
  market_intelligence: "blue",
  social_media_director: "violet",
  content_strategist: "green",
  copywriter: "amber",
  creative_director: "rose",
  human: "slate",
};

type VisualState = StageStatus | "waiting";

/**
 * Waiting on a person is not an agent working. Separating it keeps a pulsing stage meaning one
 * single thing: an agent has the work right now.
 */
function visualStateOf(stage: PipelineStage): VisualState {
  if (stage.status === "working" && !stage.taskType) return "waiting";
  return stage.status;
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** The state in the words a person would use, never a bare number with no unit. */
function stateLine(stage: PipelineStage, visual: VisualState) {
  if (visual === "working") return stage.active > 1 ? plural(stage.active, "tarea en curso", "tareas en curso") : "Trabajando ahora";
  if (visual === "waiting") return plural(stage.active, "pieza te espera", "piezas te esperan");
  if (visual === "done") return plural(stage.completed, "tarea lista", "tareas listas");
  return "Sin trabajo";
}

function Stage({ stage }: { stage: PipelineStage }) {
  const visual = visualStateOf(stage);
  return (
    <li className={`pipeline-stage is-${visual} tone-${TONE[stage.agentRole] ?? "slate"}`}>
      <span className="pipeline-face" aria-hidden="true">
        {initials(stage.agentName)}
        {visual === "done" && <b className="pipeline-face-tick">✓</b>}
      </span>
      <strong className="pipeline-who">{stage.agentName}</strong>
      <span className="pipeline-does">{stage.label}</span>
      <span className="pipeline-state">{stateLine(stage, visual)}</span>
      {stage.failed > 0 && (
        <span className="pipeline-broke">{plural(stage.failed, "falló", "fallaron")}</span>
      )}
    </li>
  );
}

function Phase({ title, caption, stages }: { title: string; caption: string; stages: PipelineStage[] }) {
  return (
    <div className="pipeline-phase-block">
      <p className="pipeline-phase-title"><b>{title}</b> {caption}</p>
      <ol className="pipeline-rail">
        {stages.map((stage) => <Stage key={stage.key} stage={stage} />)}
      </ol>
    </div>
  );
}

/** One sentence that says what is going on, so nobody has to decode the rail to find out. */
function headline(snapshot: PipelineSnapshot, waiting: boolean) {
  if (snapshot.busy) return "Tu equipo está trabajando ahora";
  if (waiting) return "El trabajo está hecho y espera tu decisión";
  if (snapshot.totals.completed > 0) return "Todo el trabajo pedido está terminado";
  return "Todavía no le pediste trabajo al equipo";
}

export function AgentPipeline({ campaignId, initial }: { campaignId?: string | null; initial: PipelineSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [stale, setStale] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endpoint = campaignId ? `/api/campaigns/${campaignId}/pipeline` : "/api/pipeline";

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) {
        setStale(true);
        return;
      }
      setSnapshot(await response.json());
      setStale(false);
    } catch {
      // A dropped poll is not an error worth showing; the next tick recovers it.
      setStale(true);
    }
  }, [endpoint]);

  useEffect(() => {
    const schedule = () => {
      timer.current = setTimeout(async () => {
        await refresh();
        schedule();
      }, snapshot.busy ? BUSY_INTERVAL_MS : IDLE_INTERVAL_MS);
    };
    schedule();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh, snapshot.busy]);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const strategy = snapshot.stages.filter((stage) => stage.phase === "strategy");
  const content = snapshot.stages.filter((stage) => stage.phase === "content");
  const busyStages = snapshot.stages.filter((stage) => visualStateOf(stage) === "working");
  const waitingStages = snapshot.stages.filter((stage) => visualStateOf(stage) === "waiting");

  return (
    <section className={`agent-pipeline${snapshot.busy ? " is-busy" : ""}`} aria-label="Estado del trabajo de los agentes">
      <header>
        <div>
          <span>{campaignId ? "PIPELINE DE LA CAMPAÑA" : "PIPELINE DEL EQUIPO"}</span>
          <h3>{headline(snapshot, waitingStages.length > 0)}</h3>
        </div>
        <p className="pipeline-summary">
          {plural(snapshot.totals.completed, "tarea lista", "tareas listas")}
          {snapshot.totals.active > 0 && <> · {plural(snapshot.totals.active, "en curso", "en curso")}</>}
          {snapshot.totals.failed > 0 && <> · <b className="pipeline-failed">{plural(snapshot.totals.failed, "falló", "fallaron")}</b></>}
          {stale && <> · <span className="pipeline-stale">sin actualizar</span></>}
        </p>
      </header>

      {/* What is happening in full words. The rail has room for a state, not for a task title. */}
      {(busyStages.length > 0 || waitingStages.length > 0) && (
        <ul className="pipeline-now">
          {[...busyStages, ...waitingStages].map((stage) => (
            <li key={stage.key} className={stage.taskType ? "is-agent" : "is-human"}>
              <span className="pipeline-now-avatar">{initials(stage.agentName)}</span>
              <div>
                <strong>{stage.agentName}</strong>
                <p>{stage.currentTitle ?? stage.workingLabel}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Phase title="Estrategia" caption="deciden qué vale la pena hacer" stages={strategy} />
      <Phase title="Contenido" caption="lo convierten en piezas y te lo traen" stages={content} />
    </section>
  );
}

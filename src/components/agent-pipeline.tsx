"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PipelineSnapshot, PipelineStage, StageStatus } from "@/server/content-factory/pipeline";

// Live view of where the work is and who has it.
//
// Built as a rail of people rather than a diagram of boxes. Counts alone never explained
// anything — "16" of what, and 16 of them doing what? — so every stage is the agent who does it
// and the rail is paired with a panel that says, in words, what that agent is for and what they
// actually produced. The panel follows the work on its own and can be pinned to anyone.
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

/**
 * The dynamic half of the explanation: what this agent is on, or the last thing they actually
 * delivered. Never a placeholder — if there is no real task title, it says so.
 */
function activityLine(stage: PipelineStage, visual: VisualState) {
  if (visual === "working") return { kicker: "Ahora mismo", text: stage.currentTitle ?? stage.workingLabel };
  if (visual === "waiting") return { kicker: "Te toca a vos", text: stage.currentTitle ?? "Hay piezas esperando tu decisión." };
  if (stage.lastTitle) return { kicker: "Lo último que entregó", text: stage.lastTitle };
  return { kicker: "Sin actividad", text: "Todavía no le tocó trabajar en esto." };
}

/** Where the eye should land: the work, then the decision, then whatever moved last. */
function focusKeyOf(snapshot: PipelineSnapshot) {
  const stages = snapshot.stages;
  const working = stages.find((stage) => visualStateOf(stage) === "working");
  const waiting = stages.find((stage) => visualStateOf(stage) === "waiting");
  const done = [...stages].reverse().find((stage) => stage.status === "done");
  return (working ?? waiting ?? done ?? stages[0])?.key ?? null;
}

function Stage({ stage, selected, onSelect }: { stage: PipelineStage; selected: boolean; onSelect: () => void }) {
  const visual = visualStateOf(stage);
  return (
    <li className={`pipeline-stage is-${visual} tone-${TONE[stage.agentRole] ?? "slate"}${selected ? " is-selected" : ""}`}>
      <button type="button" onClick={onSelect} aria-pressed={selected}>
        <span className="pipeline-face" aria-hidden="true">
          {initials(stage.agentName)}
          {visual === "done" && <b className="pipeline-face-tick">✓</b>}
        </span>
        <strong className="pipeline-who">{stage.agentName}</strong>
        <span className="pipeline-does">{stage.label}</span>
        <span className="pipeline-state">{stateLine(stage, visual)}</span>
        {stage.failed > 0 && <span className="pipeline-broke">{plural(stage.failed, "falló", "fallaron")}</span>}
      </button>
    </li>
  );
}

function Phase({ title, caption, stages, selectedKey, onSelect }: {
  title: string;
  caption: string;
  stages: PipelineStage[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="pipeline-phase-block">
      <p className="pipeline-phase-title"><b>{title}</b> {caption}</p>
      <ol className="pipeline-rail">
        {stages.map((stage) => (
          <Stage key={stage.key} stage={stage} selected={stage.key === selectedKey} onSelect={() => onSelect(stage.key)} />
        ))}
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
  // Null means "follow the work". Clicking an agent pins the panel to them until they unpin it.
  const [pinned, setPinned] = useState<string | null>(null);
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
  const waitingStages = snapshot.stages.filter((stage) => visualStateOf(stage) === "waiting");

  const focusKey = useMemo(() => focusKeyOf(snapshot), [snapshot]);
  const selectedKey = pinned ?? focusKey;
  const selected = snapshot.stages.find((stage) => stage.key === selectedKey) ?? snapshot.stages[0];
  const selectedVisual = selected ? visualStateOf(selected) : "idle";
  const activity = selected ? activityLine(selected, selectedVisual) : null;

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

      <Phase title="Estrategia" caption="deciden qué vale la pena hacer" stages={strategy} selectedKey={selectedKey} onSelect={setPinned} />
      <Phase title="Contenido" caption="lo convierten en piezas y te lo traen" stages={content} selectedKey={selectedKey} onSelect={setPinned} />

      {/* The explanation. Half of it is what the role is for, which never changes; the other half
          is what that agent actually did, which comes from the task rows and moves with them. */}
      {selected && activity && (
        <div className={`pipeline-explain is-${selectedVisual} tone-${TONE[selected.agentRole] ?? "slate"}`} aria-live="polite">
          <span className="pipeline-explain-face" aria-hidden="true">{initials(selected.agentName)}</span>
          <div>
            <p className="pipeline-explain-who">
              <strong>{selected.agentName}</strong> · {selected.label}
              {pinned && <button type="button" className="pipeline-unpin" onClick={() => setPinned(null)}>seguir el trabajo</button>}
            </p>
            <p className="pipeline-explain-role">{selected.description}</p>
            <p className="pipeline-explain-now"><b>{activity.kicker}:</b> {activity.text}</p>
          </div>
        </div>
      )}
    </section>
  );
}

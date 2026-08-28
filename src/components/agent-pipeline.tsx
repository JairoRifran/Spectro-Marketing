"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PipelineSnapshot, PipelineStage, StageStatus } from "@/server/content-factory/pipeline";

// Live view of where the work is and who has it.
//
// Deliberately SVG rather than a 3D scene: this is a nine-node state diagram, so depth and a
// camera would buy nothing and cost a WebGL dependency. The drawing is aria-hidden and purely
// decorative; the band and list underneath carry the same information as text, which is what a
// screen reader and a narrow phone actually get.
//
// Every moving thing on screen is driven by a real task row. A link only flows when the stage it
// feeds is genuinely working, so the animation cannot suggest progress the database never made.

const STRATEGY_X = [90, 270, 450, 630, 810];
const CONTENT_X = [90, 330, 570, 810];
const STRATEGY_Y = 74;
const CONTENT_Y = 196;

/** Poll fast while agents are working, slowly when idle, and never in a tight loop. */
const BUSY_INTERVAL_MS = 3000;
const IDLE_INTERVAL_MS = 15000;

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

/**
 * Waiting on a person is not an agent working, and drawing it the same way overstates what the
 * system is doing. The human stage gets its own state so a pulsing green node always means an
 * agent genuinely holds the work.
 */
type VisualState = StageStatus | "waiting";

function visualStateOf(stage: PipelineStage): VisualState {
  if (stage.status === "working" && !stage.taskType) return "waiting";
  return stage.status;
}

function Node({ stage, x, y }: { stage: PipelineStage; x: number; y: number }) {
  const total = stage.active + stage.completed;
  const visual = visualStateOf(stage);
  return (
    <g className={`pipeline-node is-${visual}${stage.failed ? " has-failed" : ""}`}>
      {visual === "working" && <circle cx={x} cy={y} r={34} className="pipeline-pulse" />}
      <circle cx={x} cy={y} r={26} className="pipeline-disc" />
      {visual === "done" ? (
        <path d={`M ${x - 8} ${y} l 5.5 6 l 10.5 -12`} className="pipeline-tick" />
      ) : (
        <text x={x} y={y + 4} textAnchor="middle" className="pipeline-initials">{initials(stage.agentName)}</text>
      )}
      <text x={x} y={y + 46} textAnchor="middle" className="pipeline-agent">{stage.agentName}</text>
      <text x={x} y={y + 60} textAnchor="middle" className="pipeline-label">{stage.label}</text>
      {total > 0 && (
        <g className="pipeline-badge">
          <circle cx={x + 22} cy={y - 22} r={11} />
          <text x={x + 22} y={y - 18} textAnchor="middle">{total}</text>
        </g>
      )}
    </g>
  );
}

/**
 * A link carries work from one stage to the next. It flows only while the stage it feeds is
 * working; once that stage is done the link is drawn as travelled, not as moving.
 */
function Connector({ from, to, y, state }: { from: number; to: number; y: number; state: "idle" | "done" | "flowing" }) {
  const x1 = from + 30;
  const x2 = to - 30;
  return (
    <g className={`pipeline-flow is-${state}`}>
      <line x1={x1} y1={y} x2={x2} y2={y} className="pipeline-link" />
      {state === "flowing" && (
        <circle r={4} cy={y} className="pipeline-parcel">
          <animate attributeName="cx" from={x1} to={x2} dur="1.6s" repeatCount="indefinite" />
        </circle>
      )}
    </g>
  );
}

function Row({ stages, xs, y, phase }: { stages: PipelineStage[]; xs: number[]; y: number; phase: string }) {
  return (
    <>
      <text x={0} y={y - 52} className="pipeline-phase">{phase}</text>
      {stages.map((stage, index) => index > 0 && (
        <Connector
          key={`link-${stage.key}`}
          from={xs[index - 1]}
          to={xs[index]}
          y={y}
          state={visualStateOf(stage) === "working" ? "flowing" : stage.status === "idle" ? "idle" : "done"}
        />
      ))}
      {stages.map((stage, index) => <Node key={stage.key} stage={stage} x={xs[index]} y={y} />)}
    </>
  );
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
  const working = snapshot.stages.filter((stage) => stage.status === "working");

  return (
    <section className={`agent-pipeline${snapshot.busy ? " is-busy" : ""}`} aria-label="Estado del trabajo de los agentes">
      <header>
        <div>
          <span>{campaignId ? "PIPELINE DE LA CAMPAÑA" : "PIPELINE DEL EQUIPO"}</span>
          <h3>{snapshot.busy ? "Los agentes están trabajando" : working.length ? "Esperando una decisión humana" : "Sin trabajo en curso"}</h3>
        </div>
        <p className="pipeline-summary">
          {snapshot.totals.completed} completadas · {snapshot.totals.active} en curso
          {snapshot.totals.failed > 0 && <> · <b className="pipeline-failed">{snapshot.totals.failed} fallidas</b></>}
          {stale && <> · <span className="pipeline-stale">sin actualizar</span></>}
        </p>
      </header>

      <svg className="pipeline-canvas" viewBox="0 0 900 270" role="presentation" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
        <Row stages={strategy} xs={STRATEGY_X} y={STRATEGY_Y} phase="ESTRATEGIA" />
        <Row stages={content} xs={CONTENT_X} y={CONTENT_Y} phase="CONTENIDO" />
      </svg>

      {/* The single most useful line on the page while something is happening: who has the work
          and what exactly they are on, in their own words from the task title. */}
      {working.length > 0 ? (
        <ul className="pipeline-now">
          {working.map((stage) => (
            <li key={stage.key} className={stage.taskType ? "is-agent" : "is-human"}>
              <span className="pipeline-now-avatar">{initials(stage.agentName)}</span>
              <div>
                <strong>{stage.agentName}</strong>
                <p>{stage.currentTitle ?? stage.workingLabel}</p>
              </div>
              {stage.active > 1 && <span className="pipeline-now-count">{stage.active}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="pipeline-idle">
          Nadie está ejecutando nada en este momento. El trabajo arranca cuando vos lo pedís desde una campaña.
        </p>
      )}

      {/* The full map, including the stages with nothing in them. This is the accessible carrier
          of the whole picture and the only one left once the drawing is hidden on a phone, so it
          is never collapsed behind a disclosure. */}
      <ol className="pipeline-list">
        {snapshot.stages.map((stage) => (
          <li key={stage.key} className={`is-${visualStateOf(stage)}`}>
            <span className="pipeline-list-agent">{stage.agentName}</span>
            <span className="pipeline-list-stage">{stage.label}</span>
            <span className="pipeline-list-state">
              {stage.status === "working" ? stage.currentTitle ?? stage.workingLabel : stage.status === "done" ? `${stage.completed} completadas` : "Idle"}
            </span>
            {stage.failed > 0 && <span className="pipeline-list-failed">{stage.failed} fallidas</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

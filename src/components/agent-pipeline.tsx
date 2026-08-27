"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PipelineSnapshot, PipelineStage } from "@/server/content-factory/pipeline";

// Live view of where the work is and who has it.
//
// Deliberately SVG rather than a 3D scene: this is a nine-node state diagram, so depth and a
// camera would buy nothing and cost a WebGL dependency. The drawing is aria-hidden and purely
// decorative; the list underneath carries the same information as text, which is what a screen
// reader and a narrow phone actually get.

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

function Node({ stage, x, y }: { stage: PipelineStage; x: number; y: number }) {
  const total = stage.active + stage.completed;
  return (
    <g className={`pipeline-node is-${stage.status}${stage.failed ? " has-failed" : ""}`}>
      {stage.status === "working" && <circle cx={x} cy={y} r={34} className="pipeline-pulse" />}
      <circle cx={x} cy={y} r={26} className="pipeline-disc" />
      <text x={x} y={y + 4} textAnchor="middle" className="pipeline-initials">{initials(stage.agentName)}</text>
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

function Connector({ from, to, y, active }: { from: number; to: number; y: number; active: boolean }) {
  return <line x1={from + 30} y1={y} x2={to - 30} y2={y} className={active ? "pipeline-link is-active" : "pipeline-link"} />;
}

export function AgentPipeline({ campaignId, initial }: { campaignId: string; initial: PipelineSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [stale, setStale] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/pipeline`, { cache: "no-store" });
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
  }, [campaignId]);

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
    <section className="agent-pipeline" aria-label="Estado del trabajo de los agentes">
      <header>
        <div>
          <span>PIPELINE</span>
          <h3>{snapshot.busy ? "Los agentes están trabajando" : working.length ? "Esperando una decisión humana" : "Sin trabajo en curso"}</h3>
        </div>
        <p className="pipeline-summary">
          {snapshot.totals.completed} completadas · {snapshot.totals.active} en curso
          {snapshot.totals.failed > 0 && <> · <b className="pipeline-failed">{snapshot.totals.failed} fallidas</b></>}
          {stale && <> · <span className="pipeline-stale">sin actualizar</span></>}
        </p>
      </header>

      <svg className="pipeline-canvas" viewBox="0 0 900 270" role="presentation" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
        <text x={0} y={22} className="pipeline-phase">ESTRATEGIA</text>
        {strategy.map((stage, index) => index > 0 && (
          <Connector key={`s${index}`} from={STRATEGY_X[index - 1]} to={STRATEGY_X[index]} y={STRATEGY_Y} active={stage.status !== "idle"} />
        ))}
        {strategy.map((stage, index) => <Node key={stage.key} stage={stage} x={STRATEGY_X[index]} y={STRATEGY_Y} />)}

        <text x={0} y={148} className="pipeline-phase">CONTENIDO</text>
        {content.map((stage, index) => index > 0 && (
          <Connector key={`c${index}`} from={CONTENT_X[index - 1]} to={CONTENT_X[index]} y={CONTENT_Y} active={stage.status !== "idle"} />
        ))}
        {content.map((stage, index) => <Node key={stage.key} stage={stage} x={CONTENT_X[index]} y={CONTENT_Y} />)}
      </svg>

      <ol className="pipeline-list">
        {snapshot.stages.map((stage) => (
          <li key={stage.key} className={`is-${stage.status}`}>
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

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Running Campaign Brain from the screen.
//
// The endpoint advances what it can in one request and says whether the chain is drained, so
// this asks again until it is. That loop exists because a real model answers one stage at a time
// and five of them do not fit in a single serverless invocation.
//
// The stages are named as they complete rather than shown as a spinner: five slow steps behind
// one unchanging label reads as a hang, and the first thing anyone does with a hang is press the
// button again.

const STAGES = ["Estructurando la estrategia", "Investigando el mercado", "Priorizando canales", "Definiendo pilares y ángulos", "Consolidando el brief"];
/** Bounded so a chain that never drains stops asking instead of looping against the API forever. */
const MAX_CALLS = 12;

export function CampaignRunButton({ id, demo, resume = false }: {
  id: string;
  demo: boolean;
  /** The chain already started and stopped partway, so this continues it rather than opening a new one. */
  resume?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "error">("idle");
  const [stage, setStage] = useState(0);

  async function run() {
    if (demo) { router.refresh(); return; }
    setState("running");
    setStage(0);

    for (let call = 0; call < MAX_CALLS; call += 1) {
      const response = await fetch(`/api/campaigns/${id}/run`, { method: "POST" });
      if (!response.ok) { setState("error"); return; }
      const result = (await response.json()) as { done?: boolean };
      // Refreshed on every pass, so the pipeline view fills in as the work happens rather than
      // arriving all at once at the end.
      router.refresh();
      if (result.done) { setState("idle"); return; }
      setStage((current) => Math.min(current + 1, STAGES.length - 1));
    }

    // Out of calls with work still queued: the campaign is not broken, but it is not finished
    // either, and saying so is better than a button that quietly goes back to idle.
    setState("error");
  }

  return (
    <div className="run-action">
      <button className="primary-button" onClick={run} disabled={state === "running"}>
        {state === "running" ? `${STAGES[stage]}…` : resume ? "Continuar estrategia" : "Run Campaign Brain"}
      </button>
      {resume && state === "idle" && <small>La estrategia quedó a medias. Continúa donde se cortó, sin rehacer lo terminado.</small>}
      {state === "error" && <small>No se pudo completar. Revisá actividad y estado.</small>}
    </div>
  );
}

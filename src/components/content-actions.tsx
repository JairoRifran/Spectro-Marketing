"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// The three human outcomes. A revision cannot be sent without feedback, because the feedback is
// what the next version has to answer — an empty revision would just reproduce the same draft.

export function ContentActions({ id, demo, canDecide, revisionOnly = false }: { id: string; demo: boolean; canDecide: boolean; revisionOnly?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("");
  const [revising, setRevising] = useState(false);
  const [feedback, setFeedback] = useState("");

  if (!canDecide) return <p className="panel-empty">Tu rol no permite decidir sobre este contenido.</p>;

  async function send(decision: "approve" | "reject" | "revision") {
    if (demo) { setMessage("Decisión registrada en modo demo."); return; }
    setState("working");
    setMessage("");
    const response = await fetch(`/api/content/${id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, feedback: decision === "revision" ? feedback : undefined }),
    });
    if (!response.ok) {
      setState("error");
      setMessage("No se pudo registrar la decisión.");
      return;
    }
    setState("idle");
    setRevising(false);
    setFeedback("");
    router.refresh();
  }

  return (
    <div className="content-actions">
      <div className="content-action-row">
        {!revisionOnly && <button className="primary-button" onClick={() => send("approve")} disabled={state === "working"}>Aprobar</button>}
        <button className={revisionOnly ? "primary-button" : "secondary-button"} onClick={() => setRevising((open) => !open)} disabled={state === "working"} aria-expanded={revising}>
          {revisionOnly ? "Reescribir esta pieza" : "Pedir revisión"}
        </button>
        {!revisionOnly && <button className="secondary-button danger" onClick={() => send("reject")} disabled={state === "working"}>Rechazar</button>}
      </div>
      {revising && (
        <div className="content-revision">
          <label htmlFor="content-feedback">Qué hay que cambiar</label>
          <textarea
            id="content-feedback"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="El hook es demasiado corporativo. Quiero algo más directo y natural."
            rows={3}
          />
          <button className="primary-button" onClick={() => send("revision")} disabled={state === "working" || feedback.trim().length < 5}>
            {state === "working" ? "Creando nueva versión…" : "Enviar revisión"}
          </button>
          <small>Se crea una versión nueva. La actual queda intacta en el historial.</small>
        </div>
      )}
      {message && <p className={state === "error" ? "form-error" : "form-note"}>{message}</p>}
    </div>
  );
}

/** Bounded on both ends: a loop that never gives up is a loop that spends money all night. */
const MAX_CALLS = 60;
const MAX_WAIT_MS = 30_000;

export function ContentGenerateButton({ campaignId, demo, auto = false }: {
  campaignId: string;
  demo: boolean;
  /**
   * Production is already under way, so pick it up without waiting to be pressed.
   *
   * The loop lives in this page. A reload, a navigation, a closed laptop -- any of them used to
   * abandon a run halfway, leaving pieces queued with nothing to drain them and no sign that
   * anything was wrong. This continues work a person already authorised; it never starts any.
   */
  auto?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "error">("idle");

  // Same loop the campaign button runs, for the same reason: the endpoint advances one piece at
  // a time and says whether work remains, and a piece that ran long is queued again seconds
  // later. Waiting here is what keeps our sixty-second ceiling from becoming something the user
  // has to manage by pressing.
  const started = useRef(false);
  useEffect(() => {
    if (!auto || demo || started.current) return;
    started.current = true;
    void run();
    // Once per mount: the effect is a resume, not a schedule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, demo]);

  async function run() {
    if (demo) { router.refresh(); return; }
    setState("running");

    for (let call = 0; call < MAX_CALLS; call += 1) {
      const response = await fetch(`/api/campaigns/${campaignId}/content`, { method: "POST" });
      if (!response.ok) { setState("error"); return; }
      const result = (await response.json()) as { done?: boolean; nextAttemptAt?: string | null; report?: { claimed?: number } };
      router.refresh();
      if (result.done) { setState("idle"); return; }
      if (result.report?.claimed === 0) {
        const dueIn = result.nextAttemptAt ? Date.parse(result.nextAttemptAt) - Date.now() : 5_000;
        await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(dueIn, 1_000), MAX_WAIT_MS)));
      }
    }

    setState("error");
  }

  return (
    <div className="run-action">
      <button className="primary-button" onClick={run} disabled={state === "running"}>
        {state === "running" ? "Produciendo contenido…" : "Generar contenido"}
      </button>
      {state === "error" && <small>No se pudo completar la producción. Revisá el estado de la campaña y la actividad.</small>}
    </div>
  );
}

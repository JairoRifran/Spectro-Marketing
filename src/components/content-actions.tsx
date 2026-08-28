"use client";
import { useState } from "react";
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

export function ContentGenerateButton({ campaignId, demo }: { campaignId: string; demo: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "error">("idle");

  async function run() {
    if (demo) { router.refresh(); return; }
    setState("running");
    const response = await fetch(`/api/campaigns/${campaignId}/content`, { method: "POST" });
    if (!response.ok) { setState("error"); return; }
    router.refresh();
    setState("idle");
  }

  return (
    <div className="run-action">
      <button className="primary-button" onClick={run} disabled={state === "running"}>
        {state === "running" ? "Bruno está planificando…" : "Generate Content Plan"}
      </button>
      {state === "error" && <small>No se pudo generar el plan. Revisá el estado de la campaña y la actividad.</small>}
    </div>
  );
}

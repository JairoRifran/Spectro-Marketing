"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Choosing whether a piece may go out without a person.
//
// This is the most consequential switch in the product, so it is deliberately not a toggle. A
// toggle invites a flick; publishing to a real audience under a brand's own name does not come
// back. It states what each mode means in the terms that matter — who signs — and asks for the
// word to be typed before it will move to autonomous.
//
// Moving back to human review needs no confirmation. Making a decision safer should never be
// harder than making it riskier.

const CONFIRM = "AUTOMATICO";

export function PublishingMode({ mode, canDecide, demo, connected }: {
  mode: "human_review" | "autonomous";
  canDecide: boolean;
  demo: boolean;
  /** How many channels could actually receive a post. Zero makes autonomous meaningless. */
  connected: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  async function send(next: "human_review" | "autonomous") {
    if (demo) { router.refresh(); return; }
    setState("working");
    const response = await fetch("/api/settings/publishing-mode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });
    if (!response.ok) {
      setState("error");
      setMessage("No se pudo cambiar el modo. Revisá tu permiso y volvé a intentar.");
      return;
    }
    setConfirming(false);
    setTyped("");
    setState("idle");
    router.refresh();
  }

  if (!canDecide) {
    return <p className="panel-empty">Tu rol no permite cambiar quién aprueba lo que se publica.</p>;
  }

  return (
    <div className="publishing-mode">
      <div className={`mode-current is-${mode}`}>
        <strong>{mode === "human_review" ? "Revisión humana" : "Automático"}</strong>
        <span>
          {mode === "human_review"
            ? "Ninguna pieza sale sin una decisión autenticada. Queda registrado quién aprobó y cuándo."
            : "Las piezas que pasan los controles salen sin que nadie las mire. La firma sigue siendo de la organización."}
        </span>
      </div>

      {connected === 0 && (
        <p className="mode-note">
          No hay ningún canal conectado todavía, así que hoy este modo no cambia nada en la práctica:
          no hay dónde publicar. Sirve para dejar la decisión tomada antes de conectar.
        </p>
      )}

      {mode === "autonomous" ? (
        <button type="button" className="ghost-button" onClick={() => send("human_review")} disabled={state === "working"}>
          Volver a revisión humana
        </button>
      ) : confirming ? (
        <div className="mode-confirm">
          <p>
            En automático, una pieza puede llegar a la audiencia sin que ninguna persona la haya leído.
            Los controles de marca y calidad se siguen aplicando, pero un control determinístico no es
            un criterio: aprueba lo que no rompe ninguna regla, no lo que conviene decir.
          </p>
          <label htmlFor="confirm-auto">Escribí <b>{CONFIRM}</b> para confirmar</label>
          <input id="confirm-auto" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
          <div className="mode-actions">
            <button type="button" className="primary-button" disabled={typed.trim() !== CONFIRM || state === "working"} onClick={() => send("autonomous")}>
              Pasar a automático
            </button>
            <button type="button" className="ghost-button" onClick={() => { setConfirming(false); setTyped(""); }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" className="ghost-button" onClick={() => setConfirming(true)}>Pasar a automático</button>
      )}

      {state === "error" && <small className="mode-error">{message}</small>}
    </div>
  );
}

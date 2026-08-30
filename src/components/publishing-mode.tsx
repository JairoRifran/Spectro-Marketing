"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// The two gates, and who stands at each.
//
// They are drawn as two separate controls because they are two decisions with very different
// costs. A piece approved by policy and never published is a draft nobody read. A piece
// published without a person is under the organization's own name, in front of its audience,
// and does not come back.
//
// Relaxing either one asks for a typed word; restoring it is a single press. Making a decision
// safer must never be harder than making it riskier. And the confirmation says what the
// deterministic gate is not: it approves what breaks no rule, which is not the same as what is
// worth saying.

const CONFIRM = "AUTOMATICO";

interface GateCopy {
  title: string;
  strict: { label: string; detail: string };
  relaxed: { label: string; detail: string };
  warning: string;
}

const COPY: Record<"content" | "publishing", GateCopy> = {
  content: {
    title: "Aprobación de contenido",
    strict: { label: "Revisión humana", detail: "Cada pieza espera una decisión autenticada antes de darse por terminada." },
    relaxed: { label: "Automática", detail: "Una pieza que pasa el control de calidad queda aprobada por política, sin lectura humana." },
    warning: "El control de calidad es determinístico: aprueba lo que no rompe ninguna regla, que no es lo mismo que lo que conviene decir. Las piezas aprobadas así quedan registradas como aprobadas por política, nunca como aprobadas por una persona.",
  },
  publishing: {
    title: "Publicación en redes",
    strict: { label: "Revisión humana", detail: "Nada sale a una audiencia real sin que alguien lo firme." },
    relaxed: { label: "Automática", detail: "Las piezas aprobadas salen solas a los canales conectados." },
    warning: "Una publicación llega a la audiencia bajo el nombre de la organización y no se puede deshacer: borrarla después no borra a quien ya la vio.",
  },
};

function Gate({ gate, mode, strictValue, relaxedValue, canDecide, demo, note }: {
  gate: "content" | "publishing";
  mode: string;
  strictValue: string;
  relaxedValue: string;
  canDecide: boolean;
  demo: boolean;
  note?: string;
}) {
  const router = useRouter();
  const copy = COPY[gate];
  const relaxed = mode === relaxedValue;
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  async function send(next: string) {
    if (demo) { router.refresh(); return; }
    setState("working");
    const response = await fetch("/api/settings/publishing-mode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gate, mode: next }),
    });
    if (!response.ok) { setState("error"); return; }
    setConfirming(false);
    setTyped("");
    setState("idle");
    router.refresh();
  }

  return (
    <section className="gate">
      <h4>{copy.title}</h4>
      <div className={`mode-current ${relaxed ? "is-autonomous" : ""}`}>
        <strong>{relaxed ? copy.relaxed.label : copy.strict.label}</strong>
        <span>{relaxed ? copy.relaxed.detail : copy.strict.detail}</span>
      </div>

      {note && <p className="mode-note">{note}</p>}

      {!canDecide ? (
        <p className="panel-empty">Tu rol no permite cambiar esto.</p>
      ) : relaxed ? (
        <button type="button" className="ghost-button" onClick={() => send(strictValue)} disabled={state === "working"}>
          Volver a revisión humana
        </button>
      ) : confirming ? (
        <div className="mode-confirm">
          <p>{copy.warning}</p>
          <label htmlFor={`confirm-${gate}`}>Escribí <b>{CONFIRM}</b> para confirmar</label>
          <input id={`confirm-${gate}`} value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
          <div className="mode-actions">
            <button type="button" className="primary-button" disabled={typed.trim() !== CONFIRM || state === "working"} onClick={() => send(relaxedValue)}>
              Pasar a automático
            </button>
            <button type="button" className="ghost-button" onClick={() => { setConfirming(false); setTyped(""); }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" className="ghost-button" onClick={() => setConfirming(true)}>Pasar a automático</button>
      )}

      {state === "error" && <small className="mode-error">No se pudo cambiar. Revisá tu permiso y volvé a intentar.</small>}
    </section>
  );
}

export function PublishingMode({ contentMode, publishingMode, canDecide, demo, connected }: {
  contentMode: "human" | "automatic";
  publishingMode: "human_review" | "autonomous";
  canDecide: boolean;
  demo: boolean;
  /** How many channels could actually receive a post. Zero makes the publishing gate theoretical. */
  connected: number;
}) {
  return (
    <div className="publishing-mode">
      <Gate gate="content" mode={contentMode} strictValue="human" relaxedValue="automatic" canDecide={canDecide} demo={demo} />
      <Gate
        gate="publishing"
        mode={publishingMode}
        strictValue="human_review"
        relaxedValue="autonomous"
        canDecide={canDecide}
        demo={demo}
        note={connected === 0
          ? "No hay canales conectados, así que hoy esta decisión no cambia nada en la práctica: no hay dónde publicar. Sirve para dejarla tomada antes de conectar."
          : undefined}
      />
    </div>
  );
}

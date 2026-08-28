"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, CircleAlert, Loader2 } from "lucide-react";
import type { VoiceoverPreflight } from "@/features/media/voiceover-preflight";

// Producing the voiceover for a piece. The first place in Spectro where pressing something
// spends real money, so the money is on screen before the button is.
//
// Two states are deliberately different. "Already produced" costs nothing and says so; "not yet"
// shows what it would cost and asks. Collapsing them into one button would make a free action
// and a paid one look identical, which is precisely the button nobody should be offered.

const PROBLEM_MESSAGE: Record<string, string> = {
  no_narration: "Esta pieza no tiene nada para narrar. Solo los videos llevan voz en off.",
  no_profile: "Todavía no elegiste cómo quiere que la lean tu marca. Configurá tono y región en Configuración → Voz.",
};

export function VoiceoverAction({ contentItemId, demo, preflight }: {
  contentItemId: string;
  demo: boolean;
  /** Worked out on the server, so there is no loading state and no second opinion about cost. */
  preflight: VoiceoverPreflight;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function produce() {
    if (demo) { setMessage("En modo demo no se genera ni se gasta."); return; }
    setState("working");
    setMessage(null);
    const response = await fetch(`/api/content/${contentItemId}/voiceover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // New per attempt: a retry of this same request reuses it, a deliberate second attempt
      // is a new request and is charged as one.
      body: JSON.stringify({ requestId: crypto.randomUUID() }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setState("idle");
      setMessage(payload?.message ?? PROBLEM_MESSAGE[payload?.error] ?? "No se pudo generar la voz.");
      return;
    }
    setState("done");
    router.refresh();
  }

  if (!preflight.hasNarration) {
    return <p className="voiceover-none">Esta pieza no lleva voz en off.</p>;
  }

  return (
    <div className="voiceover-action">
      {preflight.existing ? (
        <div className="voiceover-ready">
          <AudioLines size={15} />
          <div>
            <strong>Voz en off lista</strong>
            <small>
              {preflight.existing.durationSeconds ? `${Number(preflight.existing.durationSeconds).toFixed(1)}s · ` : ""}
              {preflight.existing.generatedBy === "mock" ? "generada con el proveedor de prueba" : "generada con el proveedor real"}
            </small>
          </div>
        </div>
      ) : (
        <>
          <p className="voiceover-cost">
            {preflight.characters} caracteres · costo estimado <strong>{preflight.estimate}</strong>
          </p>
          <button className="secondary-button" onClick={produce} disabled={state === "working"}>
            {state === "working" ? <><Loader2 size={14} className="spin" /> Generando…</> : <><AudioLines size={14} /> Generar voz en off</>}
          </button>
          <small className="voiceover-note">Se cobra contra el tope de la organización. Nada se publica.</small>
        </>
      )}
      {message && <p className="form-error voiceover-error"><CircleAlert size={13} /> {message}</p>}
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, CircleAlert, Music, Loader2 } from "lucide-react";
import type { SoundPreflight, TrackState } from "@/features/media/sound-preflight";

// The audio a piece can have, and what making it would cost.
//
// Voice and music are shown apart because they are separate decisions with separate prices. A
// piece can reasonably have one and not the other, and a single "audio" control would hide which
// — and hide that pressing it spends twice.
//
// The price is on the button in both places. This is the part of Spectro that spends real money,
// and a control that spends without saying how much is the one control nobody should be offered.

type Kind = "voice" | "music";

const ENDPOINT: Record<Kind, string> = { voice: "voiceover", music: "music" };
const NOUN: Record<Kind, string> = { voice: "voz en off", music: "música" };

const PROBLEM: Record<string, string> = {
  no_narration: "Esta pieza no tiene nada para narrar.",
  no_soundtrack: "Esta pieza se lee en silencio, no lleva música.",
  no_profile: "Elegí primero cómo quiere sonar tu marca, en Configuración → Voz.",
  provider_cannot_compose: "El proveedor configurado no compone música.",
};

export function SoundActions({ contentItemId, demo, preflight, compact = false }: {
  contentItemId: string;
  demo: boolean;
  preflight: SoundPreflight;
  /** The gallery form: same decisions, less furniture. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Kind | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function produce(kind: Kind) {
    if (demo) { setMessage("En modo demo no se genera ni se gasta."); return; }
    setBusy(kind);
    setMessage(null);
    const response = await fetch(`/api/content/${contentItemId}/${ENDPOINT[kind]}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // New per attempt: a retry of this same request reuses it, a deliberate second attempt is
      // a new request and is charged as one.
      body: JSON.stringify({ requestId: crypto.randomUUID() }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(null);

    if (!response.ok) {
      setMessage(payload?.message ?? PROBLEM[payload?.error] ?? `No se pudo generar la ${NOUN[kind]}.`);
      return;
    }
    router.refresh();
  }

  const tracks: Array<{ kind: Kind; state: TrackState; icon: typeof AudioLines }> = [
    { kind: "voice", state: preflight.voice, icon: AudioLines },
    { kind: "music", state: preflight.music, icon: Music },
  ];
  const usable = tracks.filter((track) => track.state.possible);

  if (usable.length === 0) {
    return compact ? null : <p className="voiceover-none">Esta pieza no lleva audio.</p>;
  }

  if (compact) {
    return (
      <div className="voiceover-compact">
        {usable.map(({ kind, state, icon: Icon }) => (
          state.existing ? (
            <span key={kind} className="voiceover-has"><Icon size={13} /> Con {NOUN[kind]}</span>
          ) : (
            <span key={kind} className="sound-pending">
              <span className="voiceover-missing"><CircleAlert size={13} /> Sin {NOUN[kind]}</span>
              <button className="voiceover-quick" onClick={() => produce(kind)} disabled={busy !== null}>
                {busy === kind ? "Generando…" : `Generar · ${state.estimate}`}
              </button>
            </span>
          )
        ))}
        {message && <small className="form-error">{message}</small>}
      </div>
    );
  }

  return (
    <div className="voiceover-action">
      {usable.map(({ kind, state, icon: Icon }) => (
        <div key={kind} className="sound-track">
          {state.existing ? (
            <>
              <div className="voiceover-ready-head">
                <Icon size={15} />
                <div>
                  <strong>{kind === "voice" ? "Voz en off lista" : "Música lista"}</strong>
                  <small>
                    {state.existing.durationSeconds ? `${Number(state.existing.durationSeconds).toFixed(1)}s · ` : ""}
                    {state.existing.generatedBy === "mock" ? "proveedor de prueba" : "proveedor real"}
                  </small>
                </div>
              </div>
              {/* Saying it is ready without letting anyone hear it is the one thing this panel
                  exists to avoid. */}
              {state.existing.url
                ? <audio className="voiceover-player" controls preload="none" src={state.existing.url} aria-label={`Escuchar la ${NOUN[kind]}`} />
                : <small className="voiceover-note">El archivo existe pero no se pudo generar un enlace para escucharlo.</small>}
            </>
          ) : (
            <>
              <p className="voiceover-cost">
                {kind === "voice" ? "Voz en off" : "Música instrumental"} · costo estimado <strong>{state.estimate}</strong>
              </p>
              <button className="secondary-button" onClick={() => produce(kind)} disabled={busy !== null}>
                {busy === kind ? <><Loader2 size={14} className="spin" /> Generando…</> : <><Icon size={14} /> Generar {NOUN[kind]}</>}
              </button>
            </>
          )}
        </div>
      ))}

      {preflight.needsProfile && (
        <p className="voiceover-note">Elegí cómo quiere sonar tu marca en Configuración → Voz antes de generar.</p>
      )}
      <small className="voiceover-note">Se cobra contra el tope de la organización. Nada se publica.</small>
      {message && <p className="form-error voiceover-error"><CircleAlert size={13} /> {message}</p>}
    </div>
  );
}

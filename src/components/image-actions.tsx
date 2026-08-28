"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, ImageIcon, Loader2 } from "lucide-react";

// Generating the artwork for a piece, one frame at a time.
//
// One at a time because the free service rate limits to roughly one image every fifteen seconds.
// A button that generated all of them would sit spinning for a minute and then be killed by the
// platform, so the wait is made explicit and each frame is asked for on its own.
//
// Nothing here shows a price, and that is a fact rather than an omission: the configured service
// costs nothing. If a paid one is ever configured this control has to gain a price before it
// gains a click, the same as every other spending surface.

const PROBLEM: Record<string, string> = {
  no_direction: "Esta lámina no tiene dirección visual escrita, así que no hay nada que dibujar.",
  unknown_slot: "Esa lámina no existe en esta pieza.",
  spend_refused: "El tope de gasto no permite esta imagen.",
};

export function ImageActions({ contentItemId, demo, frames, existing, compact = false }: {
  contentItemId: string;
  demo: boolean;
  /** Every frame the composition produces, in order. */
  frames: Array<{ key: string; label: string }>;
  /** The slots that already have a picture. */
  existing: string[];
  /** The gallery form: the count, and the next one missing. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const has = new Set(existing);

  async function generate(slot: string) {
    if (demo) { setMessage("En modo demo no se generan imágenes."); return; }
    setBusy(slot);
    setMessage(null);
    const response = await fetch(`/api/content/${contentItemId}/image`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slot, requestId: crypto.randomUUID() }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(null);

    if (!response.ok) {
      setMessage(payload?.message ?? PROBLEM[payload?.error] ?? "No se pudo generar la imagen.");
      return;
    }
    router.refresh();
  }

  if (frames.length === 0) {
    return compact ? null : <p className="voiceover-none">Esta pieza no tiene láminas para ilustrar.</p>;
  }

  if (compact) {
    // One at a time is the service's constraint, so the control offers the next missing frame
    // rather than a button that would be killed halfway through the set.
    const missing = frames.filter((frame) => !has.has(frame.key));
    const done = frames.length - missing.length;
    return (
      <div className="voiceover-compact">
        {missing.length === 0 ? (
          <span className="voiceover-has"><Check size={13} /> {frames.length} {frames.length === 1 ? "lámina ilustrada" : "láminas ilustradas"}</span>
        ) : (
          <span className="sound-pending">
            <span className="voiceover-missing"><CircleAlert size={13} /> {done}/{frames.length} con imagen</span>
            <button className="voiceover-quick" onClick={() => generate(missing[0].key)} disabled={busy !== null}>
              {busy ? <><Loader2 size={12} className="spin" /> Generando…</> : <><ImageIcon size={12} /> Ilustrar {missing[0].label}</>}
            </button>
          </span>
        )}
        {message && <small className="form-error">{message}</small>}
      </div>
    );
  }

  return (
    <div className="image-actions">
      <p className="panel-note">
        La imagen va detrás del texto, con un velo que mantiene el titular legible. El proveedor
        gratuito permite una imagen cada 15 segundos, así que se piden de a una.
      </p>

      <ul className="image-slots">
        {frames.map((frame) => (
          <li key={frame.key} className={has.has(frame.key) ? "is-done" : ""}>
            <span className="image-slot-label">{frame.label}</span>
            {has.has(frame.key) ? (
              <span className="voiceover-has"><Check size={13} /> Con imagen</span>
            ) : (
              <button className="voiceover-quick" onClick={() => generate(frame.key)} disabled={busy !== null}>
                {busy === frame.key ? <><Loader2 size={12} className="spin" /> Generando…</> : <><ImageIcon size={12} /> Generar</>}
              </button>
            )}
          </li>
        ))}
      </ul>

      {message && <p className="form-error voiceover-error"><CircleAlert size={13} /> {message}</p>}
    </div>
  );
}

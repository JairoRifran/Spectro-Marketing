"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Send } from "lucide-react";

// Sending a piece to a real audience.
//
// The only control in this product whose effect cannot be undone from inside it. Deleting a post
// afterwards does not un-show it to whoever already scrolled past, so this asks once, in plain
// terms, naming the page it is about to post to — a confirmation that says "are you sure?" and
// nothing else is a confirmation people learn to click through.
//
// It stays disabled while the request is in flight. Publishing is not idempotent at LinkedIn and
// a double press is a second post; the database refuses the duplicate, but the button should not
// be the thing relying on that.

export function PublishAction({ contentItemId, page, demo, publishedUrl }: {
  contentItemId: string;
  /** The page this will post to, so the confirmation names it rather than gesturing at it. */
  page: string | null;
  demo: boolean;
  publishedUrl: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "confirming" | "working" | "error">("idle");
  const [message, setMessage] = useState("");

  if (publishedUrl) {
    return (
      <p className="publish-done">
        Publicado en LinkedIn ·{" "}
        <a href={publishedUrl} target="_blank" rel="noreferrer">Ver el post <ExternalLink size={12} /></a>
      </p>
    );
  }

  if (!page) {
    return <p className="publish-blocked">Falta indicar en qué página publicar, en Configuración → Integración.</p>;
  }

  async function publish() {
    if (demo) { router.refresh(); return; }
    setState("working");
    const response = await fetch(`/api/content/${contentItemId}/publish`, { method: "POST" });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      setState("error");
      setMessage(body.message ?? "No se pudo publicar.");
      return;
    }
    setState("idle");
    router.refresh();
  }

  if (state === "confirming") {
    return (
      <div className="publish-confirm">
        <p>
          Esto publica la pieza en la página <b>{page}</b>, visible para cualquiera. Borrarla después
          no la borra de quien ya la vio.
        </p>
        <div className="mode-actions">
          <button type="button" className="primary-button" onClick={publish}>Sí, publicar ahora</button>
          <button type="button" className="ghost-button" onClick={() => setState("idle")}>Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="publish-action">
      <button type="button" className="primary-button" onClick={() => setState("confirming")} disabled={state === "working"}>
        <Send size={14} /> {state === "working" ? "Publicando…" : "Publicar en LinkedIn"}
      </button>
      {state === "error" && <small className="mode-error">{message}</small>}
    </div>
  );
}

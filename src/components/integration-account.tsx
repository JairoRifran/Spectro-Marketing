"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Naming the page a channel publishes to.
//
// Separate from connecting, because they answer different questions: authorising says this system
// may act for you, naming the page says where. One LinkedIn account can administer several pages,
// and picking one silently is how a campaign ends up on the wrong company's feed.
//
// The field asks for the number rather than the URL. It is visible in the address bar of the
// page's own admin dashboard, and the form says exactly where to look — "paste the id" is only
// useful to someone who already knows what an id is.

export function IntegrationAccount({ platform, current, canEdit, demo }: {
  platform: string;
  current: string | null;
  canEdit: boolean;
  demo: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("");

  if (!canEdit) return null;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (demo) { router.refresh(); return; }
    setState("working");
    const response = await fetch(`/api/integrations/${platform}/account`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: value.trim() }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      setState("error");
      setMessage(body.message ?? "No se pudo guardar.");
      return;
    }
    setState("idle");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="integration-account-form">
      <label htmlFor={`${platform}-page`}>Página donde publicar</label>
      <p className="field-help">
        Es el número que aparece en la dirección del panel de administración de la página:
        {" "}<code>linkedin.com/company/<b>144808906</b>/admin</code>. Sólo el número.
      </p>
      <div className="field-row">
        <input
          id={`${platform}-page`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          inputMode="numeric"
          placeholder="144808906"
          autoComplete="off"
        />
        <button type="submit" className="ghost-button" disabled={state === "working" || !value.trim()}>
          {current ? "Cambiar" : "Guardar"}
        </button>
      </div>
      {current && <small className="field-note">Publicando en la página <b>{current}</b>.</small>}
      {state === "error" && <small className="mode-error">{message}</small>}
    </form>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Registering an organization's own developer app, from the screen.
//
// Most organizations should never see this open. A client id and secret identify the application
// to the platform rather than the customer, so one reviewed app serves everyone and connecting is
// a single button. This is for the two cases where that is not true: an organization that already
// has its own approved app, and one that does not want to wait for ours to be reviewed.
//
// So it is collapsed by default, under a link that says who it is for. Putting a client secret
// field in front of someone who does not need one invites them to go and get one.
//
// The secret is write-only. It is sent once and never comes back — the screen is told whether a
// credential exists and where it came from, never what it is.

export function IntegrationCredentials({ platform, label, configured, source, canEdit, demo, envVars }: {
  platform: string;
  label: string;
  configured: boolean;
  source: "organization" | "platform" | null;
  canEdit: boolean;
  demo: boolean;
  /** Named so an operator knows which variables set the platform-wide app. */
  envVars: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (demo) { router.refresh(); return; }
    setState("working");
    const response = await fetch(`/api/integrations/${platform}/credentials`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    });
    if (!response.ok) {
      setState("error");
      setMessage("No se pudo guardar. Revisá que los dos valores estén completos y tu permiso.");
      return;
    }
    // Cleared immediately: there is no reason for a secret to stay in a form field after it has
    // been stored, and every reason for it not to.
    setClientId("");
    setClientSecret("");
    setOpen(false);
    setState("idle");
    router.refresh();
  }

  async function clear() {
    if (demo) { router.refresh(); return; }
    setState("working");
    const response = await fetch(`/api/integrations/${platform}/credentials`, { method: "DELETE" });
    if (!response.ok) { setState("error"); setMessage("No se pudo quitar."); return; }
    setState("idle");
    router.refresh();
  }

  if (!canEdit) return null;

  if (source === "organization") {
    return (
      <p className="integration-pending">
        Esta organización usa su propia app de {label}.{" "}
        <button type="button" className="link-button" onClick={clear} disabled={state === "working"}>Quitar y volver a la de la plataforma</button>
      </p>
    );
  }

  return (
    <div className="integration-own-app">
      {!open ? (
        <button type="button" className="link-button" onClick={() => setOpen(true)}>
          {configured ? "Usar una app propia en vez de la de la plataforma" : "Tengo mi propia app de " + label}
        </button>
      ) : (
        <form onSubmit={submit} className="own-app-form">
          <p>
            Sólo si ya tenés una app de desarrollador aprobada. Si no, no hace falta: la conexión normal
            usa la app de la plataforma y no te pide ninguna credencial.
          </p>
          <label htmlFor={`${platform}-id`}>Client ID</label>
          <input id={`${platform}-id`} value={clientId} onChange={(event) => setClientId(event.target.value)} autoComplete="off" required />
          <label htmlFor={`${platform}-secret`}>Client Secret</label>
          <input id={`${platform}-secret`} type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} autoComplete="off" required />
          {/* Precise, because the earlier wording said "cifrado" and nothing here encrypts it.
              Claiming a protection that does not exist is worse than naming the one that does. */}
          <small>Se guarda del lado del servidor, en una tabla que ninguna sesión de usuario puede leer, y no vuelve a mostrarse.</small>
          <div className="mode-actions">
            <button type="submit" className="primary-button" disabled={state === "working"}>Guardar</button>
            <button type="button" className="ghost-button" onClick={() => { setOpen(false); setClientId(""); setClientSecret(""); }}>Cancelar</button>
          </div>
        </form>
      )}
      {!configured && (
        <p className="integration-pending">
          A nivel plataforma se configura con{" "}
          {envVars.map((name, index) => <span key={name}>{index > 0 ? " y " : ""}<code>{name}</code></span>)}{" "}
          en el servidor.
        </p>
      )}
      {state === "error" && <small className="mode-error">{message}</small>}
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Starting a campaign.
//
// Two things were missing and both said something wrong about how a business works. The objective
// could only be the one typed during onboarding, which quietly claims a company has one goal
// forever — so a new one can be written here, without leaving the page to go and find the form
// that creates it.
//
// And the channels were entirely the strategist's call. That is right for priority and weight and
// wrong for existence: an organization may have no presence on TikTok, or may have decided not to
// be there, and an agent arguing for it is arguing about something already settled. Choosing none
// keeps the old behaviour, which is that the strategist considers everything.

const PLATFORMS = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube_shorts", label: "YouTube Shorts" },
] as const;

type Objective = { id: string; title: string; metric: string; target: number };

export function CampaignCreateForm({ objectives, demo }: { objectives: Objective[]; demo: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(objectives);
  const [objectiveId, setObjectiveId] = useState("");
  const [creatingObjective, setCreatingObjective] = useState(objectives.length === 0);
  const [draft, setDraft] = useState({ title: "", metric: "", target: "" });
  const [platforms, setPlatforms] = useState<string[]>([]);

  async function saveObjective() {
    if (demo) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/objectives", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: draft.title.trim(), metric: draft.metric.trim(), target: Number(draft.target) }),
    });
    const result = (await response.json().catch(() => null)) as (Objective & { message?: string }) | null;
    if (!response.ok || !result?.id) {
      setError(result?.message ?? "No pudimos crear el objetivo.");
      setBusy(false);
      return;
    }
    // Selected immediately: the reason to write one here is to use it now.
    setAvailable((current) => [...current, result]);
    setObjectiveId(result.id);
    setCreatingObjective(false);
    setDraft({ title: "", metric: "", target: "" });
    setBusy(false);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      objectiveId,
      name: String(form.get("name") || "") || undefined,
      specificAudience: String(form.get("specificAudience") || ""),
      startDate: String(form.get("startDate") || "") || null,
      endDate: String(form.get("endDate") || "") || null,
      budget: form.get("budget") ? Number(form.get("budget")) : null,
      constraints: String(form.get("constraints") || "").split("\n").map((item) => item.trim()).filter(Boolean),
      developStrategy: form.get("developStrategy") === "on",
      platforms,
    };
    if (demo) { router.push("/campaigns/00000000-0000-0000-0000-000000000401"); return; }
    const response = await fetch("/api/campaigns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.id) { router.push(`/campaigns/${result.id}`); router.refresh(); return; }
    setError(result?.message ?? "No pudimos crear la campaña.");
    setBusy(false);
  }

  const objectiveReady = Boolean(objectiveId);
  const draftReady = draft.title.trim().length > 3 && draft.metric.trim().length > 1 && Number(draft.target) > 0;

  return (
    <form className="campaign-form" onSubmit={submit}>
      <section>
        <span className="step-number">01</span>
        <div>
          <h2>Objetivo de negocio</h2>
          <p>Campaign Brain conserva esta relación durante toda la estrategia.</p>

          {!creatingObjective ? (
            <>
              <label>
                Objetivo
                <select name="objectiveId" required value={objectiveId} onChange={(event) => setObjectiveId(event.target.value)}>
                  <option value="" disabled>Seleccionar objetivo</option>
                  {available.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.target} {item.metric}</option>)}
                </select>
              </label>
              <button type="button" className="link-button" onClick={() => setCreatingObjective(true)}>Crear un objetivo nuevo</button>
            </>
          ) : (
            <div className="objective-draft">
              <p>Un objetivo necesita una medida y un número. Sin ellos es un deseo, y Campaign Brain los usa para argumentar la estrategia.</p>
              <label>Objetivo<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Aumentar registros calificados un 30%" /></label>
              <div className="field-grid">
                <label>Métrica<input value={draft.metric} onChange={(event) => setDraft({ ...draft, metric: event.target.value })} placeholder="Registros calificados" /></label>
                <label>Meta<input value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value })} type="number" min="0" step="any" placeholder="1300" /></label>
              </div>
              <div className="mode-actions">
                <button type="button" className="ghost-button" disabled={!draftReady || busy} onClick={saveObjective}>Guardar objetivo</button>
                {available.length > 0 && <button type="button" className="link-button" onClick={() => setCreatingObjective(false)}>Usar uno existente</button>}
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <span className="step-number">02</span>
        <div>
          <h2>Canales</h2>
          <p>Si dejás todos sin marcar, Valentina evalúa las cinco redes y decide. Marcá sólo si ya hay una decisión tomada.</p>
          <div className="platform-choices">
            {PLATFORMS.map((platform) => (
              <label key={platform.value} className={platforms.includes(platform.value) ? "is-on" : ""}>
                <input
                  type="checkbox"
                  checked={platforms.includes(platform.value)}
                  onChange={(event) => setPlatforms((current) => event.target.checked ? [...current, platform.value] : current.filter((item) => item !== platform.value))}
                />
                {platform.label}
              </label>
            ))}
          </div>
          {platforms.length > 0 && (
            <p className="field-note">Valentina va a trabajar sólo con {platforms.length === 1 ? "ese canal" : "esos canales"} y seguirá decidiendo prioridad, rol y peso dentro de ellos.</p>
          )}
        </div>
      </section>

      <section>
        <span className="step-number">03</span>
        <div>
          <h2>Contexto opcional</h2>
          <p>Podés orientar a Spectro sin definir la estrategia por adelantado.</p>
          <div className="field-grid">
            <label>Nombre de campaña<input name="name" placeholder="Spectro puede proponerlo" /></label>
            <label>Presupuesto estimado<input name="budget" type="number" min="0" step="0.01" placeholder="Opcional" /></label>
            <label>Inicio<input name="startDate" type="date" /></label>
            <label>Fin<input name="endDate" type="date" /></label>
            <label className="wide">Audiencia específica<textarea name="specificAudience" placeholder="Ej. dueños de empresas de 5–50 personas..." /></label>
            <label className="wide">Restricciones, una por línea<textarea name="constraints" placeholder="No usar promesas absolutas" /></label>
          </div>
        </div>
      </section>

      <section className="strategy-option">
        <input id="developStrategy" name="developStrategy" type="checkbox" defaultChecked />
        <label htmlFor="developStrategy">
          <strong>Dejar que Spectro desarrolle la estrategia</strong>
          <span>Sofía coordinará research, canales, pilares y brief mediante una ejecución manual segura.</span>
        </label>
      </section>

      {error && <p className="form-error">{error}</p>}

      <footer>
        <button type="button" className="secondary-button" onClick={() => router.back()}>Cancelar</button>
        <button className="primary-button" disabled={busy || !objectiveReady}>{busy ? "Construyendo estrategia…" : "Crear campaña"}</button>
      </footer>
    </form>
  );
}

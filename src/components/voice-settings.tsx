"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Trash2 } from "lucide-react";
import {
  GENDER_LABEL,
  REGION_LABEL,
  TONE_LABEL,
  VOICE_GENDERS,
  VOICE_REGIONS,
  VOICE_TONES,
  languagesPresent,
  languageLabel,
  type VoiceGenderName,
  type VoiceRegionName,
  type VoiceToneName,
} from "@/features/media/vocabulary";
import type { VoiceSettingsData } from "@/features/media/voice-settings";

// Choosing the voice of a brand.
//
// Two separate things on one screen, and keeping them separate is the point. The account's
// voices are whatever the vendor happens to hold; the brand's voices are the ones somebody
// decided to use and said where they are from. The vendor's own accent labels are shown as
// hints, never applied: "latin american" is not a region, and guessing would put a Mexican
// voice on a Rioplatense brand.

export function VoiceSettings({ data }: { data: VoiceSettingsData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState(data.profile?.tone ?? "");
  const [region, setRegion] = useState(data.profile?.region ?? "");
  const [gender, setGender] = useState<VoiceGenderName>(data.profile?.gender ?? "indistinta");
  const [draft, setDraft] = useState<Record<string, { region: string; gender: string }>>({});
  const [language, setLanguage] = useState("");
  const readOnly = data.role === "viewer";

  async function send(body: Record<string, unknown>, failure: string) {
    if (data.mode === "demo") { setMessage("En modo demo no se guarda."); return; }
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/media/voices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setMessage(
        payload?.error === "already_added" ? "Esa voz ya estaba cargada."
          : payload?.error === "forbidden_by_policy" ? "La base de datos rechazo el cambio: falta la politica de escritura sobre las voces."
          : failure,
      );
      return;
    }
    router.refresh();
  }

  const loadedIds = new Set(data.loaded.map((voice) => voice.providerVoiceId));

  // Built from what the account actually holds, so a language nobody anticipated is still
  // offered rather than filtered out of existence.
  const languages = languagesPresent(data.available);
  const visible = language
    ? data.available.filter((voice) => voice.labels.language?.toLowerCase() === language)
    : data.available;

  // Rendered beside whatever was pressed. A single notice at the foot of the page is invisible
  // to somebody scrolled down to the list, and a failure nobody sees reads as nothing happening.
  const notice = message ? <p className="form-error voice-notice">{message}</p> : null;

  return (
    <div className="voice-settings">
      <section className="detail-panel wide">
        <span className="section-kicker">COMO QUIERE QUE LA LEAN</span>
        <h3>La voz de la marca</h3>
        <p className="panel-note">
          El tono decide cómo se lee; la región decide qué voz se usa. Ningún parámetro convierte
          un acento en otro, así que si no hay voz cargada para esa región Spectro no genera nada
          en vez de usar otra.
        </p>

        <div className="voice-choice">
          <label>
            <span>Tono</span>
            <select value={tone} onChange={(event) => setTone(event.target.value)} disabled={readOnly}>
              <option value="">Sin elegir</option>
              {VOICE_TONES.map((option) => (
                <option key={option} value={option}>{TONE_LABEL[option as VoiceToneName]}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Región</span>
            <select value={region} onChange={(event) => setRegion(event.target.value)} disabled={readOnly}>
              <option value="">Sin elegir</option>
              {VOICE_REGIONS.map((option) => (
                <option key={option} value={option}>{REGION_LABEL[option as VoiceRegionName]}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Género</span>
            <select value={gender} onChange={(event) => setGender(event.target.value as VoiceGenderName)} disabled={readOnly}>
              {VOICE_GENDERS.map((option) => (
                <option key={option} value={option}>{GENDER_LABEL[option]}</option>
              ))}
            </select>
          </label>
          <button
            className="primary-button"
            disabled={busy || readOnly || !tone || !region}
            onClick={() => send({ action: "set_profile", tone, region, gender }, "No se pudo guardar la elección.")}
          >
            Guardar
          </button>
        </div>

        {data.profile && (
          data.resolves
            ? <p className="voice-status ok"><Check size={14} /> Hay una voz cargada para esta elección.</p>
            : <p className="voice-status warn"><CircleAlert size={14} /> No hay ninguna voz cargada para {REGION_LABEL[data.profile.region] ?? data.profile.region}. Cargá una abajo.</p>
        )}
        {!data.profile && <p className="voice-status warn"><CircleAlert size={14} /> Todavía no elegiste tono ni región.</p>}
        {notice}
      </section>

      <section className="detail-panel wide">
        <span className="section-kicker">VOCES DE LA MARCA</span>
        <h3>Las que Spectro puede usar</h3>
        {data.loaded.length === 0 ? (
          <p className="panel-empty">Todavía no cargaste ninguna voz.</p>
        ) : (
          <ul className="voice-list">
            {data.loaded.map((voice) => (
              <li key={voice.id}>
                <div>
                  <strong>{voice.label}</strong>
                  <small>{REGION_LABEL[voice.region as VoiceRegionName] ?? voice.region} · {GENDER_LABEL[voice.gender as VoiceGenderName] ?? voice.gender}</small>
                </div>
                {!readOnly && (
                  <button
                    className="icon-button"
                    aria-label={`Quitar ${voice.label}`}
                    disabled={busy}
                    onClick={() => send({ action: "remove_voice", id: voice.id }, "No se pudo quitar la voz.")}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="detail-panel wide">
        <span className="section-kicker">EN TU CUENTA DE {data.providerName.toUpperCase()}</span>
        <h3>Voces disponibles para cargar</h3>
        {languages.length > 1 && (
          <div className="voice-filter">
            <label htmlFor="voice-language">Idioma</label>
            <select id="voice-language" value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="">Todos ({data.available.length})</option>
              {languages.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label} ({data.available.filter((voice) => voice.labels.language?.toLowerCase() === option.code).length})
                </option>
              ))}
            </select>
          </div>
        )}
        {data.availableError ? (
          // An empty list and a failed lookup are different things, and showing the second as the
          // first would read as "your account has no voices".
          <p className="voice-status warn"><CircleAlert size={14} /> {data.availableError}</p>
        ) : data.available.length === 0 ? (
          <p className="panel-empty">El proveedor no devolvió ninguna voz.</p>
        ) : visible.length === 0 ? (
          <p className="panel-empty">Ninguna voz en {languageLabel(language)}.</p>
        ) : (
          <ul className="voice-available">
            {visible.map((voice) => {
              const already = loadedIds.has(voice.providerVoiceId);
              const pick = draft[voice.providerVoiceId] ?? { region: "", gender: "indistinta" };
              return (
                <li key={voice.providerVoiceId} className={already ? "is-loaded" : ""}>
                  <div className="voice-available-main">
                    <strong>{voice.name}</strong>
                    <small>
                      {Object.entries(voice.labels).map(([key, value]) => `${key}: ${value}`).join(" · ") || "Sin etiquetas"}
                    </small>
                    {/* The provider's own sample. Playing it calls no API and costs nothing;
                        preload is off so opening the screen does not fetch every voice. */}
                    {voice.previewUrl
                      ? <audio className="voice-preview" controls preload="none" src={voice.previewUrl} aria-label={`Escuchar ${voice.name}`} />
                      : <small className="voice-no-preview">Sin muestra disponible</small>}
                  </div>
                  {already ? (
                    <span className="voice-status ok"><Check size={13} /> Cargada</span>
                  ) : (
                    <div className="voice-assign">
                      <select
                        aria-label={`Región para ${voice.name}`}
                        value={pick.region}
                        disabled={readOnly}
                        onChange={(event) => setDraft((current) => ({ ...current, [voice.providerVoiceId]: { ...pick, region: event.target.value } }))}
                      >
                        <option value="">Elegí región</option>
                        {VOICE_REGIONS.map((option) => <option key={option} value={option}>{REGION_LABEL[option as VoiceRegionName]}</option>)}
                      </select>
                      <select
                        aria-label={`Género para ${voice.name}`}
                        value={pick.gender}
                        disabled={readOnly}
                        onChange={(event) => setDraft((current) => ({ ...current, [voice.providerVoiceId]: { ...pick, gender: event.target.value } }))}
                      >
                        {VOICE_GENDERS.map((option) => <option key={option} value={option}>{GENDER_LABEL[option]}</option>)}
                      </select>
                      <button
                        className="secondary-button"
                        disabled={busy || readOnly || !pick.region}
                        onClick={() => send({
                          action: "add_voice",
                          providerVoiceId: voice.providerVoiceId,
                          region: pick.region,
                          gender: pick.gender,
                          label: voice.name,
                        }, "No se pudo cargar la voz.")}
                      >
                        Cargar
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {notice}
      </section>
    </div>
  );
}

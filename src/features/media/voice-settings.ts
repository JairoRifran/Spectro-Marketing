import { getOrganizationContext } from "@/features/organizations/context";
import { getMediaProvider } from "@/server/media/providers";
import { resolveBrandVoice } from "@/server/media/brand-voice";
import { voiceProfileSchema, type VoiceProfile } from "@/server/media/voice-profile";
import type { AvailableVoice } from "@/server/media/provider";
import { isDemoMode } from "@/lib/env";

// What the voice settings screen needs, read in one place.
//
// The vendor's catalogue and the organization's own list are deliberately separate. One is what
// the account happens to contain; the other is what somebody decided to use and how they
// described it. Collapsing them would mean every voice in the account silently becomes a voice
// of the brand.

export interface LoadedVoice {
  id: string;
  providerVoiceId: string;
  region: string;
  gender: string;
  label: string;
}

export interface VoiceSettingsData {
  mode: "demo" | "live";
  orgName: string;
  role: string;
  /** Null when the brand has not chosen how it wants to be read. */
  profile: VoiceProfile | null;
  loaded: LoadedVoice[];
  /** What the provider reports the account has, or an explanation of why that is unknown. */
  available: AvailableVoice[];
  availableError: string | null;
  providerName: string;
  /** Whether the brand's current choice actually resolves to a voice it has. */
  resolves: boolean;
}

/**
 * The mistake this catches is one the vendor's own interface invites.
 *
 * Its API keys page shows an identifier for every key, and that is what a copy button there
 * yields; the secret itself is shown once, when the key is created or rotated. The two look
 * alike, so the wrong one gets pasted and the only feedback is an authentication error that
 * says nothing about which of the two values is in play.
 *
 * Checked only when a call has already failed, never as a gate: a prefix is a vendor convention
 * and could change, and refusing a working key because it does not match a guess would be worse
 * than the confusion this avoids. Reports the shape of the value, never the value.
 */
function configuredKeyHint(env: Record<string, string | undefined>): string {
  const key = env.ELEVENLABS_API_KEY?.trim();
  if (!key || key.startsWith("sk_")) return "";
  return "El valor configurado no parece una clave de ElevenLabs: las claves empiezan con 'sk_' y el panel muestra por defecto el identificador, no la clave. Rota la clave para que te muestre la verdadera.";
}

export async function getVoiceSettings(): Promise<VoiceSettingsData | null> {
  if (isDemoMode) return demoVoiceSettings();
  const ctx = await getOrganizationContext();
  if (!ctx) return null;

  const provider = getMediaProvider();

  const [brand, voices] = await Promise.all([
    ctx.db.from("brands").select("voice_tone,voice_region,voice_gender").eq("organization_id", ctx.orgId).limit(1).maybeSingle(),
    ctx.db.from("brand_voices").select("id,provider_voice_id,region,gender,label").eq("organization_id", ctx.orgId).order("label"),
  ]);

  // Listing costs nothing, but it can fail — an expired key, a vendor outage. That is reported
  // rather than shown as an empty account, which would read as "you have no voices".
  let available: AvailableVoice[] = [];
  let availableError: string | null = null;
  try {
    available = provider.listVoices ? await provider.listVoices() : [];
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No se pudo consultar el proveedor.";
    availableError = [configuredKeyHint(process.env), detail].filter(Boolean).join(" ");
  }

  // The database speaks snake_case; the screen speaks its own shape. One conversion, here.
  const rows = (voices.data ?? []) as Array<{ id: string; provider_voice_id: string; region: string; gender: string; label: string }>;
  const resolution = resolveBrandVoice(
    brand.data as { voice_tone: string | null; voice_region: string | null; voice_gender: string | null } | null,
    rows,
  );
  const loaded: LoadedVoice[] = rows.map((row) => ({
    id: row.id, providerVoiceId: row.provider_voice_id, region: row.region, gender: row.gender, label: row.label,
  }));

  return {
    mode: "live",
    orgName: ctx.orgName,
    role: ctx.role,
    profile: resolution.ok ? resolution.resolved.profile : (resolution.profile ?? null),
    loaded,
    available,
    availableError,
    providerName: provider.name,
    resolves: resolution.ok,
  };
}

function demoVoiceSettings(): VoiceSettingsData {
  const profile = voiceProfileSchema.parse({ tone: "cercana", region: "rioplatense", gender: "femenina" });
  const loaded: LoadedVoice[] = [
    { id: "demo-1", providerVoiceId: "mock-voz-1", region: "rioplatense", gender: "femenina", label: "Voz principal (mock)" },
  ];
  return {
    mode: "demo",
    orgName: "Northstar Urban",
    role: "owner",
    profile,
    loaded,
    available: [
      { providerVoiceId: "mock-voz-1", name: "Voz de prueba 1 (mock)", labels: { accent: "rioplatense", gender: "female" }, category: "mock" },
      { providerVoiceId: "mock-voz-2", name: "Voz de prueba 2 (mock)", labels: { accent: "neutral", gender: "male" }, category: "mock" },
    ],
    availableError: null,
    providerName: "mock",
    resolves: true,
  };
}

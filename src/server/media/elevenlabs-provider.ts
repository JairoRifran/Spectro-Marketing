import { MediaProviderError, speechRequestSchema, type MediaProvider, type SpeechRequest, type SpeechResult } from "./provider";
import type { Delivery } from "./voice-profile";

// The ElevenLabs adapter.
//
// Written against the published contract for POST /v1/text-to-speech/{voice_id}, which
// authenticates with an `xi-api-key` header and answers with the audio bytes themselves rather
// than a JSON envelope. Two things about that shape matter upward:
//
//   * The response carries no usage or cost header, so there is nothing truthful to settle with
//     except the estimate. The ledger already treats that as the fallback path.
//   * The audio comes back compressed, so its duration cannot be known without decoding it.
//     It is reported as absent rather than guessed.
//
// The key never leaves this module: not into an error message, not into a log line, not into the
// ledger summary. Nor does the text — a vendor error that echoed the script back would put the
// content into anything that captures errors.

const ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";
const MODEL = "eleven_multilingual_v2";
const OUTPUT_FORMAT = "mp3_44100_128";
const TIMEOUT_MS = 30_000;

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  /** Injectable so the adapter can be tested without a network. */
  fetchImpl?: typeof fetch;
}

/**
 * Neutral delivery into this vendor's settings, within the ranges its documentation states.
 *
 * `stability` runs the other way from expressiveness — the vendor describes a high value as more
 * monotonous — so it is inverted rather than passed through. It is also floored well above zero:
 * the bottom of that range is erratic rather than expressive, and a brand channel is the wrong
 * place to find that out.
 */
function voiceSettings(delivery: Delivery) {
  return {
    stability: Number((0.9 - delivery.expressiveness * 0.6).toFixed(2)),
    similarity_boost: 0.75,
    style: Number((delivery.intensity * 0.6).toFixed(2)),
    use_speaker_boost: true,
    speed: Number(delivery.pace.toFixed(2)),
  };
}

/**
 * Maps a vendor response onto the contract's reasons.
 *
 * Nothing here is documented as a fixed error code, so the mapping is by status class and
 * deliberately conservative: anything unrecognised is treated as unavailable, which is
 * retryable, rather than as rejected, which is not. Getting that backwards either retries a
 * request that will never succeed or gives up on one that would have.
 */
function reasonFor(status: number) {
  if (status === 429) return "quota_exceeded" as const;
  if (status === 401 || status === 403) return "rejected" as const;
  if (status === 422 || status === 400) return "rejected" as const;
  if (status >= 500) return "unavailable" as const;
  return "unavailable" as const;
}

export class ElevenLabsProvider implements MediaProvider {
  readonly name = "elevenlabs";
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: ElevenLabsConfig) {
    if (!config.apiKey || !config.voiceId) {
      throw new MediaProviderError("invalid_request", "elevenlabs", "Falta configurar la clave o la voz.");
    }
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  billedCharacters(request: SpeechRequest): number {
    return [...request.text].length;
  }

  async synthesizeSpeech(request: SpeechRequest): Promise<SpeechResult> {
    const parsed = speechRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new MediaProviderError("invalid_request", this.name, "La solicitud de voz no es valida.");
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${ENDPOINT}/${encodeURIComponent(this.config.voiceId)}`, {
        method: "POST",
        headers: {
          "xi-api-key": this.config.apiKey,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: parsed.data.text,
          model_id: MODEL,
          output_format: OUTPUT_FORMAT,
          // No language_code: the vendor documents it as ignored by the multilingual model this
          // uses, and sending a field that is silently dropped only suggests it does something.
          ...(parsed.data.delivery ? { voice_settings: voiceSettings(parsed.data.delivery) } : {}),
        }),
        // Without this a hung vendor holds the function open until the platform kills it.
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // Never surface the caught error: it can carry the request, and the request carries the key.
      throw new MediaProviderError("unavailable", this.name, "No se pudo contactar al proveedor de voz.");
    }

    if (!response.ok) {
      throw new MediaProviderError(reasonFor(response.status), this.name, `El proveedor de voz respondio ${response.status}.`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) {
      throw new MediaProviderError("unavailable", this.name, "El proveedor de voz devolvio un archivo vacio.");
    }

    return {
      bytes,
      mimeType: response.headers.get("content-type") ?? "audio/mpeg",
      // No usage header is published, so there is nothing truthful to report. The ledger settles
      // with the estimate rather than with a number invented here.
      costMicros: undefined,
      durationSeconds: undefined,
      providerRef: response.headers.get("request-id") ?? undefined,
      generatedBy: "provider",
    };
  }
}

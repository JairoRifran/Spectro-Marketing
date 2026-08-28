import { MediaProviderError } from "./provider";
import { imageRequestSchema, MockImageProvider, type ImageProvider, type ImageRequest, type ImageResult } from "./image-provider";

// A free, keyless image service.
//
// Chosen because it is the only one that genuinely costs nothing without an account, and the
// trade-offs are real rather than hidden: it rate limits an anonymous caller to roughly one
// image every fifteen seconds, it watermarks unless the caller has registered, and it is a
// community service with no service level to rely on.
//
// So it sits behind the same contract as everything else, and swapping it for a paid service is
// configuration rather than surgery. It reports that it does not charge, which keeps it out of
// the spend ceiling: a reservation for nothing is a ledger row that makes reconciling against a
// bill harder, and that is the only thing the ledger is for.

const ENDPOINT = "https://image.pollinations.ai/prompt";
// Generous, because the service is slow by design: it queues rather than refusing under load.
const TIMEOUT_MS = 90_000;

export interface PollinationsConfig {
  /** A registered token lifts the rate limit and removes the watermark. Optional by design. */
  token?: string;
  fetchImpl?: typeof fetch;
}

export class PollinationsProvider implements ImageProvider {
  readonly name = "pollinations";
  readonly charges = false;
  readonly costPerImageMicros = 0;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: PollinationsConfig = {}) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async generateImage(request: ImageRequest): Promise<ImageResult> {
    const parsed = imageRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new MediaProviderError("invalid_request", this.name, "La solicitud de imagen no es valida.");
    }

    const query = new URLSearchParams({
      width: String(parsed.data.width),
      height: String(parsed.data.height),
      // The same seed returns the same picture, which is what makes a regeneration comparable.
      seed: String(parsed.data.seed),
      // Nothing here belongs in a public feed: these are unpublished drafts of a brand's work.
      private: "true",
      safe: "true",
    });
    // Only claim the watermark is gone when there is a token to justify it; asking without one
    // is ignored, and a caller that believed it would ship a watermarked image.
    if (this.config.token) query.set("nologo", "true");

    const url = `${ENDPOINT}/${encodeURIComponent(parsed.data.prompt)}?${query}`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: this.config.token ? { authorization: `Bearer ${this.config.token}` } : {},
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new MediaProviderError("unavailable", this.name, "No se pudo contactar al proveedor de imagenes.");
    }

    if (response.status === 429) {
      // Its own rate limit, not Spectro's ceiling. Worth telling apart: one is waiting, the
      // other is a decision somebody made about money.
      throw new MediaProviderError("quota_exceeded", this.name, "El proveedor gratuito limita a una imagen cada 15 segundos. Espera un momento y volve a intentar.");
    }
    if (!response.ok) {
      throw new MediaProviderError(response.status >= 500 ? "unavailable" : "rejected", this.name, `El proveedor de imagenes respondio ${response.status}.`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) {
      throw new MediaProviderError("unavailable", this.name, "El proveedor de imagenes devolvio un archivo vacio.");
    }

    const mimeType = response.headers.get("content-type") ?? "image/jpeg";
    // A service that answers a GET with a web page instead of a picture has failed in a way a
    // status code did not report, and storing that page as an asset would be the real damage.
    if (!mimeType.startsWith("image/")) {
      throw new MediaProviderError("unavailable", this.name, "El proveedor de imagenes no devolvio una imagen.");
    }

    return { bytes, mimeType, generatedBy: "provider" };
  }
}

/**
 * Which image provider is in use.
 *
 * The free one is the default rather than a fallback: it needs no account, so there is no state
 * in which image generation is simply unavailable. Demo uses the offline placeholder, because a
 * demo that reaches out to a third party is not a demo.
 */
export function getImageProvider(env: Record<string, string | undefined>, demo: boolean): ImageProvider {
  // A demo that reaches out to a third party is not a demo: it is slow, it can fail, and it
  // makes a walkthrough depend on somebody else's uptime.
  if (demo) return new MockImageProvider();
  return new PollinationsProvider({ token: env.POLLINATIONS_TOKEN?.trim() || undefined });
}

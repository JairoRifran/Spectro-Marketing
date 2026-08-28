import { ElevenLabsProvider } from "./elevenlabs-provider";
import { MockMediaProvider } from "./mock-provider";
import type { MediaProvider } from "./provider";

// Which provider is in use, decided from configuration alone.
//
// Default to the mock. A missing key means the real provider is not configured, and the honest
// response to that is free output that is obviously not real — not an error, and certainly not a
// silent attempt to call a vendor with an empty credential.
//
// Which voice to use is not decided here. It belongs to the brand, is resolved per request from
// the profile the brand asked for, and travels in the request. A voice fixed at construction
// could only ever be one region.

/**
 * Read as a plain string map rather than a shape with two optional keys: an all-optional
 * interface is a weak type, and TypeScript refuses to accept `process.env` against it.
 */
export type MediaProviderEnv = Record<string, string | undefined>;

export function isRealMediaProviderConfigured(env: MediaProviderEnv): boolean {
  return Boolean(env.ELEVENLABS_API_KEY?.trim());
}

export function getMediaProvider(env: MediaProviderEnv = process.env): MediaProvider {
  if (!isRealMediaProviderConfigured(env)) return new MockMediaProvider();
  return new ElevenLabsProvider({ apiKey: env.ELEVENLABS_API_KEY!.trim() });
}

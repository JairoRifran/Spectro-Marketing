import { MediaProviderError, speechRequestSchema, type MediaProvider, type SpeechRequest, type SpeechResult } from "./provider";
import { durationSeconds, encodeWav, SAMPLE_RATE } from "./wav";

// A provider that costs nothing and produces a file that really plays.
//
// It exists so the whole chain — reserve, call, settle, download, play — can be exercised before
// a vendor is ever contacted. Silent placeholder bytes would let all of that pass tests against
// something no decoder accepts, and the first real integration would be the first time any of it
// actually ran.
//
// What it returns is a tone, not speech, and that is the point. Mock output has to be impossible
// to mistake for the real thing: nobody hears a beep and thinks a voice actor read their script.
// It is also deterministic, so the same text always produces byte-identical audio.

const TONE_HZ = 440;
const AMPLITUDE = 0.18;

/** Roughly how long this would take to say. Not a claim, just a plausible length for a tone. */
function spokenSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(0.6, Math.min(120, words / 2.6));
}

/**
 * A tone whose pitch steps with the text, so two different scripts are audibly different files
 * rather than the same beep twice. Derived from the text, so it stays deterministic.
 */
function tone(text: string, seconds: number): Int16Array {
  const count = Math.floor(seconds * SAMPLE_RATE);
  const samples = new Int16Array(count);
  let hash = 0;
  for (const character of text) hash = (hash * 31 + character.codePointAt(0)!) % 997;
  const frequency = TONE_HZ + (hash % 220);

  for (let index = 0; index < count; index += 1) {
    // Fade the ends so the file does not click when it starts or stops.
    const fade = Math.min(1, index / 800, (count - index) / 800);
    const value = Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE);
    samples[index] = Math.round(value * AMPLITUDE * fade * 32_767);
  }
  return samples;
}

export class MockMediaProvider implements MediaProvider {
  readonly name = "mock";

  billedCharacters(request: SpeechRequest): number {
    return [...request.text].length;
  }

  async synthesizeSpeech(request: SpeechRequest): Promise<SpeechResult> {
    const parsed = speechRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new MediaProviderError("invalid_request", this.name, "La solicitud de voz no es válida.");
    }

    const seconds = spokenSeconds(parsed.data.text);
    const samples = tone(parsed.data.text, seconds);

    return {
      bytes: encodeWav({ samples }),
      mimeType: "audio/wav",
      durationSeconds: durationSeconds(samples.length),
      // Costs nothing, and says so rather than leaving the caller to settle with an estimate.
      costMicros: 0,
      generatedBy: "mock",
    };
  }
}

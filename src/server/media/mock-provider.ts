import { MediaProviderError, musicRequestSchema, speechRequestSchema, type AvailableVoice, type MediaProvider, type MusicRequest, type SpeechRequest, type SpeechResult } from "./provider";
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

  /**
   * A backing track that is audibly a placeholder.
   *
   * Two low tones rather than a beep, so it reads as "music goes here" while being impossible to
   * mistake for something composed. It runs the full requested length, because a mock that
   * silently returns something shorter would let the whole assembly path pass tests against a
   * duration nothing else will ever produce.
   */
  async composeMusic(request: MusicRequest): Promise<SpeechResult> {
    const parsed = musicRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new MediaProviderError("invalid_request", this.name, "La solicitud de musica no es valida.");
    }

    const seconds = parsed.data.seconds;
    const count = Math.floor(seconds * SAMPLE_RATE);
    const samples = new Int16Array(count);
    for (let index = 0; index < count; index += 1) {
      const t = index / SAMPLE_RATE;
      const fade = Math.min(1, index / 4000, (count - index) / 4000);
      const value = Math.sin(2 * Math.PI * 110 * t) * 0.6 + Math.sin(2 * Math.PI * 165 * t) * 0.4;
      samples[index] = Math.round(value * 0.12 * fade * 32_767);
    }

    return {
      bytes: encodeWav({ samples }),
      mimeType: "audio/wav",
      durationSeconds: durationSeconds(samples.length),
      costMicros: 0,
      generatedBy: "mock",
    };
  }

  /**
   * A small, obviously fake catalogue so the assignment screen can be used and tested without a
   * vendor. The names say what they are: nobody should be able to load these by accident and
   * then wonder why the audio is a beep.
   */
  async listVoices(): Promise<AvailableVoice[]> {
    return [
      {
        providerVoiceId: "mock-voz-1",
        name: "Voz de prueba 1 (mock)",
        labels: { accent: "rioplatense", gender: "female", language: "es" },
        category: "mock",
        previewUrl: this.preview("Voz de prueba uno"),
      },
      {
        providerVoiceId: "mock-voz-2",
        name: "Voz de prueba 2 (mock)",
        labels: { accent: "american", gender: "male", language: "en" },
        category: "mock",
        previewUrl: this.preview("Test voice two"),
      },
    ];
  }

  /**
   * The mock's preview is the mock's own audio, inlined. It keeps the player on the settings
   * screen exercisable without a vendor, and it cannot be mistaken for a real sample because it
   * is the same tone the mock synthesises.
   */
  private preview(text: string): string {
    const bytes = encodeWav({ samples: tone(text, 0.4) });
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:audio/wav;base64,${btoa(binary)}`;
  }
}

// A minimal 16-bit PCM WAV writer.
//
// The mock provider needs to return a file that actually plays. Returning invented bytes would
// let every layer above it — storage, download, the player in the browser — pass tests against
// something no audio decoder would accept, and the first real integration would then be the
// first time any of it was exercised.
//
// PCM WAV is the one audio container simple enough to write correctly by hand: a 44-byte header
// and raw samples. No dependency, no encoder, and a file that opens anywhere.

export const SAMPLE_RATE = 22_050;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;

export interface WavInput {
  /** Signed 16-bit samples, one channel. */
  samples: Int16Array;
  sampleRate?: number;
}

export function encodeWav({ samples, sampleRate = SAMPLE_RATE }: WavInput): Uint8Array {
  const byteRate = (sampleRate * CHANNELS * BITS_PER_SAMPLE) / 8;
  const blockAlign = (CHANNELS * BITS_PER_SAMPLE) / 8;
  const dataSize = samples.length * 2;
  const output = new Uint8Array(44 + dataSize);
  const view = new DataView(output.buffer);

  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);       // PCM header size
  view.setUint16(20, 1, true);        // format: PCM
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  ascii(36, "data");
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(44 + index * 2, samples[index], true);
  }

  return output;
}

/** How long a buffer of samples lasts, for reporting rather than for arithmetic on money. */
export function durationSeconds(sampleCount: number, sampleRate = SAMPLE_RATE): number {
  return sampleCount / sampleRate;
}

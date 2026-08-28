import type { PlatformContentVariant } from "../content/schemas/variant";
import type { FrameSpec } from "./spec";

// How long each composed frame stays on screen in an assembled preview.
//
// Two sources of truth have to be reconciled and neither can simply win. The script says how the
// piece should be paced, beat by beat, which is an editorial decision. The audio says how long
// the words actually take, which is a fact. So the script sets the proportions and the audio
// sets the total: the pacing is honoured, and the last frame does not sit in silence or get cut
// off mid-sentence.
//
// With no audio yet there is nothing to reconcile against, and the script's own seconds are used
// unchanged.

export interface FrameTiming {
  key: string;
  seconds: number;
}

/**
 * The script's intended weight for each frame.
 *
 * A cover is held long enough to be read but not long enough to stall — the opening frame decides
 * whether anything else is watched, and a still that lingers is how a viewer leaves.
 */
export function intendedTimings(variant: PlatformContentVariant, frames: FrameSpec[]): FrameTiming[] {
  if (frames.length === 0) return [];

  if (variant.detail.shape === "video") {
    const scenes = variant.detail.script.scenes;
    return frames.map((frame) => {
      if (frame.key === "cover") return { key: frame.key, seconds: 2.5 };
      const index = Number(frame.key.replace("scene-", ""));
      const scene = Number.isInteger(index) ? scenes[index] : undefined;
      return { key: frame.key, seconds: scene?.durationSeconds ?? 3 };
    });
  }

  if (variant.detail.shape === "story") {
    return frames.map((frame, index) => ({
      key: frame.key,
      seconds: variant.detail.shape === "story" ? (variant.detail.story.frames[index]?.durationSeconds ?? 5) : 5,
    }));
  }

  // A carousel is paced by whoever is scrolling it. Even beats are a stand-in for that, not a
  // claim about how long anybody will look.
  return frames.map((frame) => ({ key: frame.key, seconds: 3 }));
}

/**
 * Stretches or compresses the intended pacing to fit a real audio track.
 *
 * Proportional rather than padded: adding the difference to the last frame would leave a still
 * hanging while the voice has already finished, and trimming only the last one would cut a beat
 * that the script gave time to. Every frame keeps its share.
 */
export function fitToDuration(timings: FrameTiming[], audioSeconds: number | null): FrameTiming[] {
  if (!audioSeconds || audioSeconds <= 0 || timings.length === 0) return timings;
  const total = timings.reduce((sum, timing) => sum + timing.seconds, 0);
  if (total <= 0) {
    const even = audioSeconds / timings.length;
    return timings.map((timing) => ({ ...timing, seconds: even }));
  }
  const factor = audioSeconds / total;
  return timings.map((timing) => ({ ...timing, seconds: timing.seconds * factor }));
}

/** Cumulative start time of each frame, for deciding which one is showing at a given moment. */
export function startTimes(timings: FrameTiming[]): number[] {
  const starts: number[] = [];
  let elapsed = 0;
  for (const timing of timings) {
    starts.push(elapsed);
    elapsed += timing.seconds;
  }
  return starts;
}

/** Which frame is on screen at a given moment. Past the end, the last one holds. */
export function frameAt(timings: FrameTiming[], seconds: number): number {
  if (timings.length === 0) return -1;
  const starts = startTimes(timings);
  for (let index = starts.length - 1; index >= 0; index -= 1) {
    if (seconds >= starts[index]) return index;
  }
  return 0;
}

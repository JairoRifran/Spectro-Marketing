"use client";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { FrameCanvas } from "./frame-canvas";
import { fitToDuration, frameAt, type FrameTiming } from "@/server/media/timing";
import type { BrandIdentity } from "@/server/media/identity";
import type { FrameSpec } from "@/server/media/spec";

// The piece, assembled: its frames in sequence with its voice over them.
//
// Not a rendered video and it does not pretend to be one. It is the two things that exist —
// composed frames and synthesised audio — played together, which is enough to answer the
// question a rendered file would answer: does this hold for its whole length, and does the
// voice land on the beat it was written for.
//
// When the audio has loaded, its real length sets the total and the script's pacing sets the
// proportions. Before that, and when there is no audio at all, the script's own seconds are used
// unchanged rather than guessed at.

export function AssembledPreview({ frames, timings, identity, audioUrl, label }: {
  frames: FrameSpec[];
  timings: FrameTiming[];
  identity: BrandIdentity;
  audioUrl?: string | null;
  label: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioSeconds, setAudioSeconds] = useState<number | null>(null);

  const fitted = fitToDuration(timings, audioSeconds);
  const total = fitted.reduce((sum, timing) => sum + timing.seconds, 0);
  const index = Math.max(0, frameAt(fitted, elapsed));

  // Without audio there is no clock to follow, so the preview keeps its own.
  useEffect(() => {
    if (!playing) return;
    // The clock comes from the frame callback's own timestamp rather than from reading the
    // performance counter: same number, and nothing impure is called during a render.
    let last: number | null = null;
    const step = (now: number) => {
      const delta = last === null ? 0 : (now - last) / 1000;
      last = now;
      setElapsed((current) => {
        const next = audioRef.current && !audioRef.current.paused ? audioRef.current.currentTime : current + delta;
        if (next >= total) {
          setPlaying(false);
          return total;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, total]);

  function toggle() {
    const audio = audioRef.current;
    if (playing) {
      audio?.pause();
      setPlaying(false);
      return;
    }
    if (elapsed >= total) restart();
    if (audio) void audio.play().catch(() => undefined);
    setPlaying(true);
  }

  function restart() {
    const audio = audioRef.current;
    if (audio) audio.currentTime = 0;
    setElapsed(0);
  }

  if (frames.length === 0) return null;

  return (
    <div className="assembled" aria-label={`Vista ensamblada de ${label}`}>
      <div className="assembled-stage">
        <FrameCanvas spec={frames[index]} identity={identity} />
      </div>

      <div className="assembled-controls">
        <button type="button" className="assembled-play" onClick={toggle} aria-label={playing ? "Pausar" : "Reproducir"}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button type="button" className="assembled-restart" onClick={() => { restart(); }} aria-label="Volver al principio">
          <RotateCcw size={14} />
        </button>

        {/* One segment per frame, sized by how long it holds, so the pacing is visible and not
            just felt. */}
        <div className="assembled-track" role="presentation">
          {fitted.map((timing, position) => (
            <span
              key={timing.key}
              className={position === index ? "is-current" : position < index ? "is-past" : ""}
              style={{ flexGrow: Math.max(timing.seconds, 0.1) }}
            />
          ))}
        </div>

        <span className="assembled-time">
          {elapsed.toFixed(1)}s / {total.toFixed(1)}s
        </span>
      </div>

      <p className="assembled-caption">
        {frames[index].label}
        {audioUrl ? "" : " · sin voz todavía"}
      </p>

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onLoadedMetadata={(event) => {
            const duration = event.currentTarget.duration;
            // Streams sometimes report Infinity until they are seeked; an unusable number is
            // treated as no answer rather than as a length.
            setAudioSeconds(Number.isFinite(duration) && duration > 0 ? duration : null);
          }}
          onEnded={() => setPlaying(false)}
        />
      )}
    </div>
  );
}

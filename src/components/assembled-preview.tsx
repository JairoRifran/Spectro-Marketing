"use client";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { FrameCanvas } from "./frame-canvas";
import { Caption, PostChrome, VerticalChrome } from "./platform-chrome";
import type { MockAccount } from "@/features/content/account";
import { fitToDuration, frameAt, type FrameTiming } from "@/server/media/timing";
import type { BrandIdentity } from "@/server/media/identity";
import type { FrameSpec } from "@/server/media/spec";

// The piece, assembled: its frames in sequence with its voice and its music over them.
//
// Not a rendered video and it does not pretend to be one. It is the things that actually exist —
// composed frames, a synthesised voice, a composed track — played together, which answers the
// question a rendered file would: does this hold for its whole length, does the voice land on the
// beat it was written for, and does the music sit under it or fight it.
//
// The two tracks are mixed rather than merely both present. Music at full volume under a
// voiceover makes the narration unintelligible, which is the single most common way an otherwise
// finished piece is unusable — so it is ducked, and only plays at its own level when there is no
// voice to sit under.

/** Where the music sits when a voice is speaking over it, and when it plays alone. */
const MUSIC_UNDER_VOICE = 0.22;
const MUSIC_ALONE = 0.7;

export function AssembledPreview({ frames, timings, identity, images = {}, voiceUrl, musicUrl, label, chrome }: {
  frames: FrameSpec[];
  timings: FrameTiming[];
  identity: BrandIdentity;
  /** Links for the picture slots the frames refer to. */
  images?: Record<string, string>;
  voiceUrl?: string | null;
  musicUrl?: string | null;
  label: string;
  /**
   * The platform interface to play the piece inside. Without it the frames are shown bare, which
   * is useful for checking the artwork and useless for checking whether the caption covers the
   * last line of it.
   */
  chrome?: { kind: "vertical" | "post"; platform: string; account: MockAccount; caption: string } | null;
}) {
  const voiceRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioSeconds, setAudioSeconds] = useState<number | null>(null);

  const fitted = fitToDuration(timings, audioSeconds);
  const total = fitted.reduce((sum, timing) => sum + timing.seconds, 0);
  const index = Math.max(0, frameAt(fitted, elapsed));

  // The voice is the clock when there is one: it is what the pacing was fitted to.
  const clockRef = voiceUrl ? voiceRef : musicUrl ? musicRef : null;

  useEffect(() => {
    if (musicRef.current) musicRef.current.volume = voiceUrl ? MUSIC_UNDER_VOICE : MUSIC_ALONE;
  }, [voiceUrl, musicUrl]);

  useEffect(() => {
    if (!playing) return;
    // The clock comes from the frame callback's own timestamp rather than from reading the
    // performance counter: same number, and nothing impure is called during a render.
    let last: number | null = null;
    const step = (now: number) => {
      const delta = last === null ? 0 : (now - last) / 1000;
      last = now;
      setElapsed((current) => {
        const clock = clockRef?.current;
        const next = clock && !clock.paused ? clock.currentTime : current + delta;
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
  }, [playing, total, clockRef]);

  function eachTrack(action: (audio: HTMLAudioElement) => void) {
    for (const ref of [voiceRef, musicRef]) {
      if (ref.current) action(ref.current);
    }
  }

  function toggle() {
    if (playing) {
      eachTrack((audio) => audio.pause());
      setPlaying(false);
      return;
    }
    if (elapsed >= total) restart();
    // Both start together; a track that starts late is a track out of sync for the whole piece.
    eachTrack((audio) => void audio.play().catch(() => undefined));
    setPlaying(true);
  }

  function restart() {
    eachTrack((audio) => { audio.currentTime = 0; });
    setElapsed(0);
  }

  if (frames.length === 0) return null;

  const tracks = [voiceUrl ? "voz" : null, musicUrl ? "música" : null].filter(Boolean);

  return (
    <div className="assembled" aria-label={`Vista ensamblada de ${label}`}>
      <div className="assembled-stage">
        {chrome?.kind === "vertical" ? (
          <VerticalChrome account={chrome.account} caption={chrome.caption} platform={chrome.platform}>
            <FrameCanvas spec={frames[index]} identity={identity} images={images} />
          </VerticalChrome>
        ) : chrome?.kind === "post" ? (
          <PostChrome
            account={chrome.account}
            // Kept from the static simulation: where the caption is cut and how many slides
            // there are is information about how the piece reads, not decoration.
            dots={frames.length > 1 ? (
              <div className="mock-dots" aria-hidden="true">
                {frames.map((frame, position) => (
                  <span key={frame.key} className={position === index ? "is-active" : ""} />
                ))}
              </div>
            ) : undefined}
            caption={<Caption text={`${chrome.account.handle} ${chrome.caption}`} limit={125} />}
          >
            <div className="mock-media is-composed">
              <FrameCanvas spec={frames[index]} identity={identity} images={images} />
            </div>
          </PostChrome>
        ) : (
          <FrameCanvas spec={frames[index]} identity={identity} images={images} />
        )}
      </div>

      <div className="assembled-controls">
        <button type="button" className="assembled-play" onClick={toggle} aria-label={playing ? "Pausar" : "Reproducir"}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button type="button" className="assembled-restart" onClick={restart} aria-label="Volver al principio">
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
        {tracks.length > 0 ? ` · con ${tracks.join(" y ")}` : " · sin audio todavía"}
      </p>

      {voiceUrl && (
        <audio
          ref={voiceRef}
          src={voiceUrl}
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

      {musicUrl && (
        <audio
          ref={musicRef}
          src={musicUrl}
          preload="metadata"
          onLoadedMetadata={(event) => {
            if (voiceUrl) return;
            const duration = event.currentTarget.duration;
            setAudioSeconds(Number.isFinite(duration) && duration > 0 ? duration : null);
          }}
        />
      )}
    </div>
  );
}

"use client";
import { useState, type ReactNode } from "react";
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Music2, Repeat2, Send, ThumbsUp, Volume2 } from "lucide-react";
import type { PlatformContentVariant } from "@/server/content/schemas/variant";
import type { FrameSpec } from "@/server/media/spec";
import type { MockAccount } from "@/features/content/account";
import { FORMAT_LABEL, PLATFORM_LABEL } from "@/features/content/labels";
import { FrameCanvas } from "./frame-canvas";
import { FrameExport } from "./frame-export";
import type { BrandIdentity } from "@/server/media/identity";

// What the piece will look like where it lands.
//
// This is the counterpart to ContentPreview, not a replacement: that one shows the craft —
// beats, slides, visual direction — so a reviewer can judge it. This one answers the other
// question, "how will this read in the feed?", by putting the copy inside the chrome of its
// platform while nothing is published yet.
//
// It deliberately shows NO engagement figures. A mockup with "1.234 me gusta" invents a number
// that someone will eventually read as real, and this product does not fabricate metrics. The
// affordances are drawn because they change how copy reads — a caption is truncated in a feed,
// a vertical video hides text behind the action rail — the counts are not.
//
// The imagery does not exist yet either: nothing generates pictures at this stage. Rather than
// fake a photo, the media area shows the direction written for whoever produces it, which is
// the honest content of that rectangle today.

function initials(name: string) {
  return name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "SP";
}

function Avatar({ account }: { account: MockAccount }) {
  return <span className="mock-avatar" aria-hidden="true">{initials(account.name)}</span>;
}

/** A feed truncates. Seeing where the cut falls is half the point of previewing a caption. */
function Caption({ text, limit }: { text: string; limit: number }) {
  const [open, setOpen] = useState(false);
  const flat = text.trim();
  const needsCut = flat.length > limit;
  if (!needsCut || open) {
    return (
      <p className="mock-caption">
        {flat}
        {needsCut && <button type="button" onClick={() => setOpen(false)}>ver menos</button>}
      </p>
    );
  }
  return (
    <p className="mock-caption">
      {flat.slice(0, limit).trimEnd()}…
      <button type="button" onClick={() => setOpen(true)}>más</button>
    </p>
  );
}

/**
 * The media rectangle. There is no picture to show, so it carries the direction that will be
 * handed to whatever produces one, plus any text meant to be burned into the frame.
 */
/**
 * The media rectangle. It used to be a placeholder; it now holds the frame that composition
 * actually produced, at the delivery proportions it will be exported at.
 */
function Media({ frame, identity, children }: { frame?: FrameSpec; identity: BrandIdentity; children?: ReactNode }) {
  if (frame) {
    return (
      <div className="mock-media is-composed">
        <FrameCanvas spec={frame} identity={identity} />
        {frame.truncated && <span className="mock-media-warn">El texto no entra completo en el frame</span>}
      </div>
    );
  }
  return (
    <div className="mock-media">
      {children}
      <span className="mock-media-note" aria-hidden="true">Sin frame compuesto</span>
    </div>
  );
}

/** The brief for whoever makes the picture. A note about the frame, so it sits outside it. */
function Direction({ text }: { text: string }) {
  return <p className="mock-direction"><b>Dirección visual</b>{text}</p>;
}

/**
 * Says which platform this is, in its own colour. Without it three cards side by side read as
 * three copies of the same thing, which is exactly the opposite of the point.
 */
function PlatformTag({ variant }: { variant: PlatformContentVariant }) {
  return (
    <p className="mock-tag">
      <span className="mock-tag-dot" aria-hidden="true" />
      <strong>{PLATFORM_LABEL[variant.platform] ?? variant.platform}</strong>
      <span>{FORMAT_LABEL[variant.format] ?? variant.format}</span>
    </p>
  );
}

/** Vertical video: TikTok, Reels, Shorts. Same chrome, different rail and labels per platform. */
function VerticalVideo({ variant, account, frames, identity }: Renderable) {
  const script = variant.detail.shape === "video" ? variant.detail.script : null;
  const [scene, setScene] = useState(0);
  if (!script) return null;
  const current = script.scenes[Math.min(scene, script.scenes.length - 1)];
  const isYouTube = variant.platform === "youtube_shorts";
  // Scene 0 is the cover; later scenes only have a composed card when they carry burnt-in text.
  const composed = frames.find((item) => item.key === (scene === 0 ? "cover" : `scene-${scene}`));

  return (
    <div className="mock-vertical">
      <div className="mock-phone">
        <div className={`mock-frame${composed ? " has-art" : ""}`}>
          {/* The opening frame is the hook: it is what decides whether anything else is read.
              Where composition produced a frame, that frame is the picture; the platform chrome
              sits on top of it exactly as it will in the feed. */}
          {composed ? (
            <div className="mock-frame-art"><FrameCanvas spec={composed} identity={identity} /></div>
          ) : (
            <>
              <p className="mock-hook">{scene === 0 ? script.hook : current.onScreenText ?? ""}</p>
              <p className="mock-scene-visual">{current.visual}</p>
            </>
          )}
          {current.voiceover && <p className="mock-voiceover"><Volume2 size={11} /> {current.voiceover}</p>}

          <div className="mock-rail" aria-hidden="true">
            <span><Heart size={19} /></span>
            <span><MessageCircle size={19} /></span>
            <span>{isYouTube ? <Repeat2 size={19} /> : <Bookmark size={19} />}</span>
            <span><Send size={19} /></span>
          </div>

          <div className="mock-vertical-foot">
            <p className="mock-handle"><Avatar account={account} /> {account.handle}</p>
            <p className="mock-vertical-caption">{variant.caption}</p>
            <p className="mock-sound"><Music2 size={11} /> Audio original · {account.name}</p>
          </div>
        </div>
        <p className="mock-duration">{script.estimatedDurationSeconds}s · {script.scenes.length} escenas</p>
      </div>

      {/* Stepping through the scenes is what turns a script into something you can picture. */}
      <div className="mock-timeline">
        <p className="mock-timeline-title">Recorré el video escena por escena</p>
        <ol>
          {script.scenes.map((item, index) => (
            <li key={index} className={index === scene ? "is-active" : ""}>
              <button type="button" onClick={() => setScene(index)} aria-pressed={index === scene}>
                <b>{index + 1}</b>
                <span>{item.onScreenText ?? item.visual}</span>
                <time>{item.durationSeconds}s</time>
              </button>
            </li>
          ))}
        </ol>
        <p className="mock-payoff"><b>Cierre</b>{script.payoff}</p>
        <p className="mock-payoff"><b>Llamado a la acción</b>{script.cta}</p>
      </div>
    </div>
  );
}

/** Stories: the same vertical frame, but a timed sequence with segment bars on top. */
function StorySequence({ variant, account, frames, identity }: Renderable) {
  const story = variant.detail.shape === "story" ? variant.detail.story : null;
  const [index, setIndex] = useState(0);
  if (!story) return null;
  const frame = story.frames[Math.min(index, story.frames.length - 1)];
  const composed = frames[Math.min(index, story.frames.length - 1)];

  return (
    <div className="mock-vertical">
      <div className="mock-phone">
        <div className="mock-frame is-story">
          <div className="mock-segments" aria-hidden="true">
            {story.frames.map((_, position) => <span key={position} className={position <= index ? "is-seen" : ""} />)}
          </div>
          {composed && <div className="mock-frame-art"><FrameCanvas spec={composed} identity={identity} /></div>}
          <p className="mock-handle mock-story-handle"><Avatar account={account} /> {account.handle}</p>
          {!composed && <p className="mock-hook">{frame.text}</p>}
          <p className="mock-story-role">{frame.role} · {frame.durationSeconds}s</p>
        </div>
        <div className="mock-story-nav">
          {story.frames.map((item, position) => (
            <button key={position} type="button" onClick={() => setIndex(position)} aria-pressed={position === index} aria-label={`Story ${position + 1}: ${item.role}`}>
              {position + 1}
            </button>
          ))}
        </div>
      </div>
      <div className="mock-timeline">
        <p className="mock-timeline-title">La secuencia completa</p>
        <ol>
          {story.frames.map((item, position) => (
            <li key={position} className={position === index ? "is-active" : ""}>
              <button type="button" onClick={() => setIndex(position)} aria-pressed={position === index}>
                <b>{position + 1}</b><span>{item.text}</span><time>{item.durationSeconds}s</time>
              </button>
            </li>
          ))}
        </ol>
        <p className="mock-payoff"><b>Dirección visual</b>{story.visualDirection}</p>
      </div>
    </div>
  );
}

/** Carousel: Instagram slides, or a LinkedIn document, which is the same gesture. */
function Carousel({ variant, account, frames, identity }: Renderable) {
  const carousel = variant.detail.shape === "carousel" ? variant.detail.carousel : null;
  const [slide, setSlide] = useState(0);
  if (!carousel) return null;
  const slides = [
    { ...carousel.cover, kind: "Portada" },
    ...carousel.slides.map((item, index) => ({ ...item, kind: `Lámina ${index + 2}` })),
    { ...carousel.ctaSlide, kind: "Cierre" },
  ];
  const current = slides[Math.min(slide, slides.length - 1)];

  return (
    <div className="mock-post">
      <header className="mock-post-head">
        <Avatar account={account} />
        <div><strong>{account.handle}</strong><small>{account.name}</small></div>
        <MoreHorizontal size={16} aria-hidden="true" />
      </header>
      <Media frame={frames[Math.min(slide, frames.length - 1)]} identity={identity}>
        <span className="mock-slide-kind">{current.kind}</span>
        <h4 className="mock-slide-headline">{current.headline}</h4>
        {current.body && <p className="mock-slide-body">{current.body}</p>}
      </Media>
      <div className="mock-dots" role="tablist" aria-label="Láminas">
        {slides.map((item, index) => (
          <button key={index} type="button" role="tab" aria-selected={index === slide} aria-label={item.kind} className={index === slide ? "is-active" : ""} onClick={() => setSlide(index)} />
        ))}
      </div>
      <div className="mock-actions" aria-hidden="true"><Heart size={19} /><MessageCircle size={19} /><Send size={19} /><Bookmark size={19} className="mock-actions-end" /></div>
      <Caption text={`${account.handle} ${carousel.caption}`} limit={125} />
      <Direction text={current.visualNote} />
    </div>
  );
}

/** A single image post: Instagram or Facebook. */
function StaticPost({ variant, account, frames, identity }: Renderable) {
  const post = variant.detail.shape === "static" ? variant.detail.post : null;
  if (!post) return null;
  return (
    <div className="mock-post">
      <header className="mock-post-head">
        <Avatar account={account} />
        <div><strong>{account.handle}</strong><small>{account.name}</small></div>
        <MoreHorizontal size={16} aria-hidden="true" />
      </header>
      <Media frame={frames[0]} identity={identity}>
        <h4 className="mock-slide-headline">{post.headline}</h4>
      </Media>
      <div className="mock-actions" aria-hidden="true"><Heart size={19} /><MessageCircle size={19} /><Send size={19} /><Bookmark size={19} className="mock-actions-end" /></div>
      <Caption text={`${account.handle} ${post.caption}`} limit={125} />
      <Direction text={post.visualDirection} />
    </div>
  );
}

/** A text post in a professional feed: LinkedIn, or Facebook without an image. */
function TextPost({ variant, account }: { variant: PlatformContentVariant; account: MockAccount }) {
  const post = variant.detail.shape === "text" ? variant.detail.post : null;
  if (!post) return null;
  const body = [post.hook, post.body, post.cta].filter(Boolean).join("\n\n");
  return (
    <div className="mock-post is-text">
      <header className="mock-post-head">
        <Avatar account={account} />
        <div><strong>{account.name}</strong><small>{account.handle}</small></div>
        <MoreHorizontal size={16} aria-hidden="true" />
      </header>
      <Caption text={body} limit={210} />
      {post.sources.length > 0 && <p className="mock-sources">Fuentes citadas: {post.sources.join(" · ")}</p>}
      <div className="mock-actions is-labelled" aria-hidden="true">
        <span><ThumbsUp size={15} /> Recomendar</span>
        <span><MessageCircle size={15} /> Comentar</span>
        <span><Repeat2 size={15} /> Compartir</span>
        <span><Send size={15} /> Enviar</span>
      </div>
    </div>
  );
}

/**
 * Frames arrive already composed. Composition is domain code that lives on the server; this
 * component draws what it is handed, so `src/server` never has to ship to the browser.
 */
interface Renderable {
  variant: PlatformContentVariant;
  account: MockAccount;
  frames: FrameSpec[];
  identity: BrandIdentity;
}

export function PlatformMockup({ variant, account, frames, identity, title }: Renderable & { title?: string }) {
  const shape = variant.detail.shape;
  const props = { variant, account, frames, identity };
  return (
    <div className={`platform-mockup on-${variant.platform} shape-${shape}`}>
      <PlatformTag variant={variant} />
      {shape === "video" && <VerticalVideo {...props} />}
      {shape === "story" && <StorySequence {...props} />}
      {shape === "carousel" && <Carousel {...props} />}
      {shape === "static" && <StaticPost {...props} />}
      {shape === "text" && <TextPost variant={variant} account={account} />}
      <FrameExport variant={variant} frames={frames} identity={identity} title={title ?? variant.format} />
      <p className="mock-disclaimer">
        Simulación para revisar cómo se lee la pieza. No hay conteos de likes, vistas ni alcance porque
        nada se publicó todavía; cualquier número acá sería inventado.
      </p>
    </div>
  );
}

import type { PlatformContentVariant } from "@/server/content/schemas/variant";
import { FORMAT_LABEL, PLATFORM_LABEL } from "@/features/content/labels";

// Conceptual previews, one per production shape. The goal is reviewing a piece, not imitating
// a proprietary interface: a reviewer needs to see the beats, the slides or the paragraphs, so
// each shape is rendered as what it actually is. No raw JSON reaches the screen.


function Paragraphs({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return <>{blocks.map((block, index) => <p key={index}>{block.split("\n").map((line, lineIndex) => <span key={lineIndex}>{line}<br /></span>)}</p>)}</>;
}

function VideoPreview({ variant }: { variant: PlatformContentVariant }) {
  if (variant.detail.shape !== "video") return null;
  const script = variant.detail.script;
  return (
    <div className="preview-video">
      <div className="preview-hook"><span>HOOK</span><p>{script.hook}</p></div>
      <ol className="preview-scenes">
        {script.scenes.map((scene, index) => (
          <li key={index}>
            <header><strong>Escena {index + 1}</strong><time>{scene.durationSeconds}s</time></header>
            <dl>
              <div><dt>Visual</dt><dd>{scene.visual}</dd></div>
              {scene.voiceover && <div><dt>Voz en off</dt><dd>{scene.voiceover}</dd></div>}
              {scene.onScreenText && <div><dt>Texto en pantalla</dt><dd>{scene.onScreenText}</dd></div>}
              {scene.transitionNote && <div><dt>Transición</dt><dd>{scene.transitionNote}</dd></div>}
            </dl>
          </li>
        ))}
      </ol>
      <div className="preview-payoff"><span>PAYOFF</span><p>{script.payoff}</p></div>
      <div className="preview-cta"><span>CTA</span><p>{script.cta}</p></div>
      <footer className="preview-meta">Duración estimada: {script.estimatedDurationSeconds}s · {script.beats.length} beats</footer>
    </div>
  );
}

function CarouselPreview({ variant }: { variant: PlatformContentVariant }) {
  if (variant.detail.shape !== "carousel") return null;
  const carousel = variant.detail.carousel;
  const slides = [{ ...carousel.cover, kind: "Portada" }, ...carousel.slides.map((slide, index) => ({ ...slide, kind: `Lámina ${index + 2}` })), { ...carousel.ctaSlide, kind: "CTA" }];
  return (
    <div className="preview-carousel">
      <div className="preview-slides" role="list" aria-label="Láminas del carrusel">
        {slides.map((slide, index) => (
          <article key={index} role="listitem" className="preview-slide">
            <span className="slide-kind">{slide.kind}</span>
            <h4>{slide.headline}</h4>
            {slide.body && <p>{slide.body}</p>}
            <small>{slide.visualNote}</small>
          </article>
        ))}
      </div>
      <div className="preview-caption"><span>CAPTION</span><Paragraphs text={carousel.caption} /></div>
      <div className="preview-direction"><span>DIRECCIÓN VISUAL</span><p>{carousel.visualDirection}</p></div>
    </div>
  );
}

function StoryPreview({ variant }: { variant: PlatformContentVariant }) {
  if (variant.detail.shape !== "story") return null;
  const story = variant.detail.story;
  return (
    <div className="preview-stories">
      <ol className="preview-story-sequence">
        {story.frames.map((frame, index) => (
          <li key={index}>
            <header><strong>Story {index + 1}</strong><span>{frame.role}</span><time>{frame.durationSeconds}s</time></header>
            <p>{frame.text}</p>
            <small>{frame.visualNote}</small>
          </li>
        ))}
      </ol>
      <div className="preview-direction"><span>DIRECCIÓN VISUAL</span><p>{story.visualDirection}</p></div>
    </div>
  );
}

function TextPreview({ variant }: { variant: PlatformContentVariant }) {
  if (variant.detail.shape !== "text") return null;
  const post = variant.detail.post;
  return (
    <div className="preview-text">
      <div className="preview-hook"><span>HOOK</span><p>{post.hook}</p></div>
      <div className="preview-body"><Paragraphs text={post.body} /></div>
      <div className="preview-cta"><span>CTA</span><p>{post.cta}</p></div>
      {post.sources.length > 0 && <footer className="preview-meta">Fuentes: {post.sources.join(" · ")}</footer>}
    </div>
  );
}

function StaticPreview({ variant }: { variant: PlatformContentVariant }) {
  if (variant.detail.shape !== "static") return null;
  const post = variant.detail.post;
  return (
    <div className="preview-static">
      <div className="preview-hook"><span>TITULAR</span><p>{post.headline}</p></div>
      <div className="preview-caption"><span>CAPTION</span><Paragraphs text={post.caption} /></div>
      <div className="preview-direction"><span>DIRECCIÓN VISUAL</span><p>{post.visualDirection}</p></div>
      {post.onScreenText.length > 0 && <footer className="preview-meta">Texto en pieza: {post.onScreenText.join(" · ")}</footer>}
    </div>
  );
}

export function ContentPreview({ variant }: { variant: PlatformContentVariant }) {
  const platform = PLATFORM_LABEL[variant.platform] ?? variant.platform;
  const format = FORMAT_LABEL[variant.format] ?? variant.format;
  return (
    <section className={`content-preview preview-${variant.platform} shape-${variant.detail.shape}`} aria-label={`Vista previa de ${platform}`}>
      <header className="preview-frame-header">
        <span className="preview-platform">{platform}</span>
        <span className="preview-format">{format}</span>
        {variant.generatedBy === "mock" && <span className="preview-mock" title="Contenido determinístico de prueba">MOCK</span>}
      </header>
      {variant.detail.shape === "video" && <VideoPreview variant={variant} />}
      {variant.detail.shape === "carousel" && <CarouselPreview variant={variant} />}
      {variant.detail.shape === "story" && <StoryPreview variant={variant} />}
      {variant.detail.shape === "text" && <TextPreview variant={variant} />}
      {variant.detail.shape === "static" && <StaticPreview variant={variant} />}
      {variant.detail.shape !== "text" && variant.detail.shape !== "carousel" && (
        <div className="preview-caption"><span>CAPTION</span><Paragraphs text={variant.caption} /></div>
      )}
    </section>
  );
}

export { PLATFORM_LABEL, FORMAT_LABEL };

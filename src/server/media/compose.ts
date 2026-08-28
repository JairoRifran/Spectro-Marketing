import type { PlatformContentVariant } from "../content/schemas/variant";
import { canvasFor, contentBox, type Canvas } from "./canvas";
import { SPECTRO_IDENTITY, type BrandIdentity } from "./identity";
import type { FrameBlock, FrameSpec } from "./spec";
import { measure, wrapClamped } from "./text";

// Composition: from a validated variant to the frames that make up the piece.
//
// Deliberately deterministic and free. Carousel slides, story frames and a Short's cover are
// typography over a brand surface — no model is needed to place a headline, and using one would
// cost money per render, produce a different result every time and be impossible to test. This
// covers most of what "the covers" means; generative imagery is for the photographic work that
// typography genuinely cannot do, and plugs in beside this rather than replacing it.
//
// Everything here is a pure function of (variant, identity), so the same piece always composes
// to the same frames. That is what makes the output cacheable, diffable and testable.

const HEADLINE_SIZES = [96, 84, 72, 62, 54, 46];
const BODY_SIZES = [44, 40, 36, 32];

interface Cursor {
  y: number;
  /** The last y a block may occupy. Nothing is allowed to be drawn past it. */
  bottom: number;
  blocks: FrameBlock[];
  truncated: boolean;
}

/**
 * Lays text into whatever vertical room is actually left.
 *
 * Clamping each block to its own line budget is not enough: three blocks that each respect
 * their own limit still stack past the bottom of the frame. So the line budget is the smaller
 * of what the block asked for and what the remaining height can hold, and the size is the
 * largest candidate that satisfies both.
 */
function layout(text: string, width: number, remaining: number, sizes: number[], maxLines: number, ratio: number) {
  const ordered = [...sizes].sort((a, b) => b - a);
  for (const size of ordered) {
    const lineHeight = Math.round(size * ratio);
    const fits = Math.floor(remaining / lineHeight);
    if (fits < 1) continue;
    const budget = Math.min(maxLines, fits);
    const wrapped = wrapClamped(text, width, size, budget);
    if (wrapped.lines.length <= budget && !wrapped.truncated) {
      return { size, lineHeight, ...wrapped };
    }
  }
  // Nothing fitted cleanly: use the smallest size and keep only the lines there is room for.
  const size = ordered[ordered.length - 1];
  const lineHeight = Math.round(size * ratio);
  const fits = Math.floor(remaining / lineHeight);
  if (fits < 1) return { size, lineHeight, lines: [] as string[], truncated: true };
  return { size, lineHeight, ...wrapClamped(text, width, size, Math.min(maxLines, fits)) };
}

function heading(cursor: Cursor, text: string, box: ReturnType<typeof contentBox>, identity: BrandIdentity, maxLines: number) {
  const { size, lineHeight, lines, truncated } = layout(text, box.width, cursor.bottom - cursor.y, HEADLINE_SIZES, maxLines, 1.14);
  cursor.truncated = cursor.truncated || truncated;
  if (lines.length === 0) return;
  cursor.blocks.push({
    kind: "text", x: box.x, y: cursor.y + size, lines, size, lineHeight,
    weight: 750, fill: identity.ink, align: "left", letterSpacing: -size * 0.02,
  });
  cursor.y += lineHeight * lines.length;
}

function paragraph(cursor: Cursor, text: string, box: ReturnType<typeof contentBox>, identity: BrandIdentity, maxLines: number) {
  const gap = 28;
  const { size, lineHeight, lines, truncated } = layout(text, box.width, cursor.bottom - cursor.y - gap, BODY_SIZES, maxLines, 1.42);
  cursor.truncated = cursor.truncated || truncated;
  if (lines.length === 0) return;
  cursor.y += gap;
  cursor.blocks.push({
    kind: "text", x: box.x, y: cursor.y + size, lines, size, lineHeight,
    weight: 400, fill: identity.muted, align: "left", letterSpacing: 0,
  });
  cursor.y += lineHeight * lines.length;
}

/** A small label at the top of the frame: which slide this is, or what the beat does. */
function eyebrow(cursor: Cursor, text: string, box: ReturnType<typeof contentBox>, identity: BrandIdentity) {
  const size = 26;
  const spacing = size * 0.12;
  // Uppercased here rather than at render time: a label measured in lower case and drawn in
  // capitals is measured wrong, and capitals are wider.
  const label = wrapClamped(text.toLocaleUpperCase("es"), box.width, size, 1, spacing).lines[0] ?? "";
  cursor.blocks.push({
    kind: "rect", x: box.x, y: cursor.y, width: 56, height: 5, fill: identity.accent, radius: 3, opacity: 1,
  });
  cursor.y += 30;
  cursor.blocks.push({
    kind: "text", x: box.x, y: cursor.y + size, lines: [label], size, lineHeight: Math.round(size * 1.3),
    weight: 700, fill: identity.accent, align: "left", letterSpacing: spacing,
  });
  cursor.y += Math.round(size * 1.3) + 18;
}

/**
 * The step marker a carousel needs so a reader knows there is more. It sits inside the content
 * box like everything else: one rule — nothing is drawn outside it — is worth more than a
 * decorative exception nobody remembers when the safe area changes.
 */
function counter(canvas: Canvas, position: number, total: number, identity: BrandIdentity): FrameBlock[] {
  const size = 26;
  const box = contentBox(canvas);
  const label = `${position}/${total}`;
  return [
    { kind: "text", x: box.x + box.width - measure(label, size), y: box.y + box.height, lines: [label], size,
      lineHeight: size, weight: 700, fill: identity.muted, align: "left", letterSpacing: 0 },
  ];
}

function frame(key: string, label: string, canvas: Canvas, identity: BrandIdentity, build: (cursor: Cursor, box: ReturnType<typeof contentBox>) => void, extra: FrameBlock[] = []): FrameSpec {
  const box = contentBox(canvas);
  const cursor: Cursor = { y: box.y, bottom: box.y + box.height, blocks: [], truncated: false };
  build(cursor, box);
  return {
    key, label, width: canvas.width, height: canvas.height,
    background: identity.surface, blocks: [...cursor.blocks, ...extra], truncated: cursor.truncated,
  };
}

/**
 * Every frame a variant needs, in reading order. A video contributes its cover: the opening
 * frame is the only still that decides whether the rest is watched, so it is worth designing
 * even while the video itself is not being produced.
 */
export function composeFrames(variant: PlatformContentVariant, identity: BrandIdentity = SPECTRO_IDENTITY): FrameSpec[] {
  const canvas = canvasFor(variant.platform, variant.format);
  const detail = variant.detail;

  if (detail.shape === "carousel") {
    const slides = [
      { ...detail.carousel.cover, kind: "Portada" },
      ...detail.carousel.slides.map((slide, index) => ({ ...slide, kind: `Lámina ${index + 2}` })),
      { ...detail.carousel.ctaSlide, kind: "Cierre" },
    ];
    return slides.map((slide, index) => frame(
      `slide-${index}`, slide.kind, canvas, identity,
      (cursor, box) => {
        eyebrow(cursor, slide.kind, box, identity);
        heading(cursor, slide.headline, box, identity, index === 0 ? 4 : 3);
        if (slide.body) paragraph(cursor, slide.body, box, identity, 5);
      },
      counter(canvas, index + 1, slides.length, identity),
    ));
  }

  if (detail.shape === "story") {
    return detail.story.frames.map((storyFrame, index) => frame(
      `story-${index}`, `Story ${index + 1} · ${storyFrame.role}`, canvas, identity,
      (cursor, box) => {
        eyebrow(cursor, storyFrame.role, box, identity);
        heading(cursor, storyFrame.text, box, identity, 5);
      },
    ));
  }

  if (detail.shape === "video") {
    // The cover, plus a title card per scene that carries burnt-in text. Scenes without any
    // on-screen text get no card: there is nothing to typeset, and an invented one would be
    // a caption nobody wrote.
    const cover = frame("cover", "Portada", canvas, identity, (cursor, box) => {
      eyebrow(cursor, "Apertura", box, identity);
      heading(cursor, detail.script.hook, box, identity, 5);
    });
    const cards = detail.script.scenes
      .map((scene, index) => ({ scene, index }))
      .filter(({ scene }) => Boolean(scene.onScreenText))
      .map(({ scene, index }) => frame(
        `scene-${index}`, `Escena ${index + 1}`, canvas, identity,
        (cursor, box) => {
          eyebrow(cursor, `Escena ${index + 1}`, box, identity);
          heading(cursor, scene.onScreenText!, box, identity, 4);
        },
      ));
    return [cover, ...cards];
  }

  if (detail.shape === "static") {
    return [frame("post", "Pieza", canvas, identity, (cursor, box) => {
      eyebrow(cursor, "Pieza", box, identity);
      heading(cursor, detail.post.headline, box, identity, 5);
      if (detail.post.onScreenText.length > 0) paragraph(cursor, detail.post.onScreenText.join(" · "), box, identity, 3);
    })];
  }

  // A text post has no designed surface: the words are the piece. Composing a graphic for it
  // would be inventing a format the platform does not use.
  return [];
}

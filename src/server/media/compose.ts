import type { PlatformContentVariant } from "../content/schemas/variant";
import { canvasFor, contentBox, type Canvas } from "./canvas";
import { SPECTRO_IDENTITY, type BrandIdentity } from "./identity";
import { mix, readableOn, seedOf, shift } from "./palette";
import type { FrameBlock, FrameSpec } from "./spec";
import { measure, wrapClamped } from "./text";

// Composition: from a validated variant to the frames that make up the piece.
//
// Deliberately deterministic and free. A carousel slide, a story beat and a Short's cover are
// typography over a designed surface — a model would cost money per render, return something
// different every time and be impossible to test. Generative imagery belongs beside this, for
// the photographic work typography genuinely cannot do, not in front of it.
//
// Everything is a pure function of (variant, identity), so the same piece always composes to the
// same frames. Decoration varies by frame key rather than by chance: a carousel's slides look
// like one set without being identical, and every render of a slide is the same picture.
//
// Two rules the tests hold to. Text stays inside the safe area, because outside it the platform's
// own interface sits on top. Decoration may reach the edges, because that is what decoration is
// for, and confining it to the text box would leave every frame with a permanent border.

const HEADLINE_SIZES = [104, 92, 80, 68, 58, 48];
const BODY_SIZES = [44, 40, 36, 32];
const EYEBROW_SIZE = 26;

interface Cursor {
  y: number;
  bottom: number;
  blocks: FrameBlock[];
  truncated: boolean;
}

/**
 * Lays text into whatever vertical room is actually left.
 *
 * Clamping each block to its own line budget is not enough: three blocks that each respect their
 * own limit still stack past the bottom of the frame. So the budget is the smaller of what the
 * block asked for and what the remaining height can hold.
 */
function layout(text: string, width: number, remaining: number, sizes: number[], maxLines: number, ratio: number) {
  const ordered = [...sizes].sort((a, b) => b - a);
  for (const size of ordered) {
    const lineHeight = Math.round(size * ratio);
    const fits = Math.floor(remaining / lineHeight);
    if (fits < 1) continue;
    const budget = Math.min(maxLines, fits);
    const wrapped = wrapClamped(text, width, size, budget);
    if (wrapped.lines.length <= budget && !wrapped.truncated) return { size, lineHeight, ...wrapped };
  }
  const size = ordered[ordered.length - 1];
  const lineHeight = Math.round(size * ratio);
  const fits = Math.floor(remaining / lineHeight);
  if (fits < 1) return { size, lineHeight, lines: [] as string[], truncated: true };
  return { size, lineHeight, ...wrapClamped(text, width, size, Math.min(maxLines, fits)) };
}

function heading(cursor: Cursor, text: string, box: ReturnType<typeof contentBox>, colour: string, maxLines: number) {
  const { size, lineHeight, lines, truncated } = layout(text, box.width, cursor.bottom - cursor.y, HEADLINE_SIZES, maxLines, 1.12);
  cursor.truncated = cursor.truncated || truncated;
  if (lines.length === 0) return;
  cursor.blocks.push({
    kind: "text", x: box.x, y: cursor.y + size, lines, size, lineHeight,
    weight: 800, fill: colour, align: "left", letterSpacing: -size * 0.028, opacity: 1,
  });
  cursor.y += lineHeight * lines.length;
}

function paragraph(cursor: Cursor, text: string, box: ReturnType<typeof contentBox>, colour: string, maxLines: number) {
  const gap = 30;
  const { size, lineHeight, lines, truncated } = layout(text, box.width, cursor.bottom - cursor.y - gap, BODY_SIZES, maxLines, 1.45);
  cursor.truncated = cursor.truncated || truncated;
  if (lines.length === 0) return;
  cursor.y += gap;
  cursor.blocks.push({
    kind: "text", x: box.x, y: cursor.y + size, lines, size, lineHeight,
    weight: 400, fill: colour, align: "left", letterSpacing: 0, opacity: 0.88,
  });
  cursor.y += lineHeight * lines.length;
}

/** A rule and a label. Small, wide-tracked, and the only uppercase on the frame. */
function eyebrow(cursor: Cursor, text: string, box: ReturnType<typeof contentBox>, accent: string) {
  const spacing = EYEBROW_SIZE * 0.14;
  const label = wrapClamped(text.toLocaleUpperCase("es"), box.width - 90, EYEBROW_SIZE, 1, spacing).lines[0] ?? "";
  cursor.blocks.push({ kind: "rect", x: box.x, y: cursor.y + 10, width: 64, height: 6, fill: accent, radius: 3, opacity: 1 });
  cursor.blocks.push({
    kind: "text", x: box.x + 84, y: cursor.y + EYEBROW_SIZE, lines: [label], size: EYEBROW_SIZE,
    lineHeight: EYEBROW_SIZE, weight: 700, fill: accent, align: "left", letterSpacing: spacing, opacity: 1,
  });
  cursor.y += EYEBROW_SIZE + 34;
}

/**
 * The place a generated picture goes, with the veil it needs.
 *
 * The veil is not decoration. Type over an unknown photograph is unreadable about half the time
 * — a light headline lands on a bright sky, a dark one on a shadow — and which half is not known
 * until the picture exists. Darkening it costs a little of the image and buys legibility that
 * does not depend on luck.
 */
function artwork(canvas: Canvas, identity: BrandIdentity, slot: string, fallback: FrameSpec["background"]): FrameBlock[] {
  return [{
    kind: "image", x: 0, y: 0, width: canvas.width, height: canvas.height, slot, fallback,
    // The veil travels with the picture, so a frame without one is not dimmed for nothing.
    veil: 0.58, veilColour: identity.surface, opacity: 1,
  }];
}

/**
 * The surface a frame is built on: a gradient plus two soft shapes placed from the frame's own
 * key. It is what turns a slide from words on a flat rectangle into something designed, and it
 * costs nothing because it is arithmetic rather than a model.
 */
function surface(canvas: Canvas, identity: BrandIdentity, key: string, emphatic: boolean): { background: FrameSpec["background"]; blocks: FrameBlock[] } {
  const seed = seedOf(key);
  const tinted = mix(identity.surface, identity.accent, emphatic ? 0.22 : 0.1);
  const background = { from: shift(tinted, 0.06), to: shift(identity.surface, -0.12), angle: 145 };

  const bigRadius = canvas.width * (emphatic ? 0.85 : 0.7);
  const blocks: FrameBlock[] = [
    {
      kind: "ellipse",
      cx: canvas.width * (0.15 + (seed % 70) / 100),
      cy: canvas.height * (0.08 + ((seed >> 3) % 20) / 100),
      rx: bigRadius, ry: bigRadius * 0.72,
      fill: { from: identity.accent, to: shift(identity.accent, -0.4), angle: (seed % 4) * 90 },
      opacity: emphatic ? 0.3 : 0.16,
    },
    {
      kind: "ellipse",
      cx: canvas.width * (0.2 + ((seed >> 5) % 60) / 100),
      cy: canvas.height * (0.82 + ((seed >> 7) % 15) / 100),
      rx: canvas.width * 0.55, ry: canvas.width * 0.4,
      fill: shift(identity.accent, 0.25),
      opacity: 0.12,
    },
  ];
  return { background, blocks };
}

/** The step marker a carousel needs, set inside the content box like everything else. */
function counter(canvas: Canvas, position: number, total: number, colour: string): FrameBlock[] {
  const size = 28;
  const box = contentBox(canvas);
  const label = `${position}/${total}`;
  return [{
    kind: "text", x: box.x + box.width - measure(label, size), y: box.y + box.height, lines: [label],
    size, lineHeight: size, weight: 700, fill: colour, align: "left", letterSpacing: 0, opacity: 0.7,
  }];
}

function frame(
  key: string,
  label: string,
  canvas: Canvas,
  identity: BrandIdentity,
  emphatic: boolean,
  build: (cursor: Cursor, box: ReturnType<typeof contentBox>, ink: string, accent: string) => void,
  extra: (ink: string) => FrameBlock[] = () => [],
): FrameSpec {
  const box = contentBox(canvas);
  const { background, blocks: decoration } = surface(canvas, identity, key, emphatic);
  // Every frame reserves a place for artwork. Until one exists the designed surface shows
  // through unchanged, so a piece is never worse for having asked.
  const picture = artwork(canvas, identity, key, background);
  // What is readable on the tinted surface is checked rather than assumed: a pale brand accent
  // can make the usual ink unreadable, and that only shows up once somebody opens the file.
  const tinted = mix(identity.surface, identity.accent, emphatic ? 0.22 : 0.1);
  const ink = readableOn(tinted, identity);
  const accent = identity.accent === ink ? shift(identity.accent, 0.35) : identity.accent;

  const cursor: Cursor = { y: box.y, bottom: box.y + box.height, blocks: [], truncated: false };
  build(cursor, box, ink, accent);

  return {
    key, label, width: canvas.width, height: canvas.height, background,
    blocks: [...picture, ...decoration, ...cursor.blocks, ...extra(ink)],
    truncated: cursor.truncated,
  };
}

export function composeFrames(variant: PlatformContentVariant, identity: BrandIdentity = SPECTRO_IDENTITY): FrameSpec[] {
  const canvas = canvasFor(variant.platform, variant.format);
  const detail = variant.detail;

  if (detail.shape === "carousel") {
    const slides = [
      { ...detail.carousel.cover, kind: "Portada" },
      ...detail.carousel.slides.map((slide, index) => ({ ...slide, kind: `Lámina ${index + 2}` })),
      { ...detail.carousel.ctaSlide, kind: "Cierre" },
    ];
    return slides.map((slide, index) => {
      // The cover and the closing slide carry the emphasis; the middle stays calm so the set
      // reads as a sequence rather than as five competing posters.
      const isEdge = index === 0 || index === slides.length - 1;
      return frame(
        `slide-${index}`, slide.kind, canvas, identity, isEdge,
        (cursor, box, ink, accent) => {
          eyebrow(cursor, slide.kind, box, accent);
          heading(cursor, slide.headline, box, ink, index === 0 ? 4 : 3);
          if (slide.body) paragraph(cursor, slide.body, box, ink, 5);
        },
        (ink) => counter(canvas, index + 1, slides.length, ink),
      );
    });
  }

  if (detail.shape === "story") {
    return detail.story.frames.map((storyFrame, index) => frame(
      `story-${index}`, `Story ${index + 1} · ${storyFrame.role}`, canvas, identity, index === 0,
      (cursor, box, ink, accent) => {
        eyebrow(cursor, storyFrame.role, box, accent);
        heading(cursor, storyFrame.text, box, ink, 5);
      },
    ));
  }

  if (detail.shape === "video") {
    // The cover, plus a title card per scene that carries burnt-in text. Scenes without any
    // on-screen text get no card: there is nothing to typeset, and an invented one would be a
    // caption nobody wrote.
    const cover = frame("cover", "Portada", canvas, identity, true, (cursor, box, ink, accent) => {
      eyebrow(cursor, "Apertura", box, accent);
      heading(cursor, detail.script.hook, box, ink, 5);
    });
    const cards = detail.script.scenes
      .map((scene, index) => ({ scene, index }))
      .filter(({ scene }) => Boolean(scene.onScreenText))
      .map(({ scene, index }) => frame(
        `scene-${index}`, `Escena ${index + 1}`, canvas, identity, false,
        (cursor, box, ink, accent) => {
          eyebrow(cursor, `Escena ${index + 1}`, box, accent);
          heading(cursor, scene.onScreenText!, box, ink, 4);
        },
      ));
    return [cover, ...cards];
  }

  if (detail.shape === "static") {
    return [frame("post", "Pieza", canvas, identity, true, (cursor, box, ink, accent) => {
      eyebrow(cursor, "Pieza", box, accent);
      heading(cursor, detail.post.headline, box, ink, 5);
      if (detail.post.onScreenText.length > 0) paragraph(cursor, detail.post.onScreenText.join(" · "), box, ink, 3);
    })];
  }

  if (detail.shape === "text") {
    // A text post's words are still the piece -- this is not a graphic that replaces them.
    //
    // The earlier reading was that composing anything here invents a format the platform does
    // not use, and that is wrong in one direction: a text post can carry an image alongside it,
    // and a wall of unbroken text is what a feed scrolls past. So the frame is deliberately
    // spare -- the hook, and the call to action under it -- because it accompanies the post
    // rather than restating it. Whoever publishes can attach it or ignore it.
    return [frame("post", "Acompaña al post", canvas, identity, true, (cursor, box, ink, accent) => {
      eyebrow(cursor, "Acompaña al post", box, accent);
      heading(cursor, detail.post.hook, box, ink, 6);
      paragraph(cursor, detail.post.cta, box, ink, 2);
    })];
  }

  return [];
}

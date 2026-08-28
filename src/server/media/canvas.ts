import type { ContentFormat, SupportedPlatform } from "../content/platforms";

// Canvas sizes and safe areas per platform.
//
// The numbers are the conventional delivery sizes, not a claim about any vendor's current
// specification: they are the ones that have been stable for years and that every design tool
// ships as a preset. The safe areas are deliberately conservative — they describe where a
// platform's own interface tends to sit over the frame, so composition keeps text out of it.
// Being slightly too cautious costs a little space; being too optimistic puts a headline under
// a share button.

export interface Canvas {
  width: number;
  height: number;
  /** Insets where the platform's interface may cover the frame. */
  safe: { top: number; right: number; bottom: number; left: number };
}

const SQUARE = { width: 1080, height: 1080 };
const PORTRAIT = { width: 1080, height: 1350 };
const VERTICAL = { width: 1080, height: 1920 };

/** Room for a caption, a handle and the action rail on a full-screen vertical video. */
const VERTICAL_SAFE = { top: 220, right: 200, bottom: 480, left: 60 };
const FEED_SAFE = { top: 72, right: 72, bottom: 72, left: 72 };

export function canvasFor(platform: SupportedPlatform, format: ContentFormat): Canvas {
  if (format === "reel" || format === "short_video" || format === "story") {
    return { ...VERTICAL, safe: VERTICAL_SAFE };
  }
  if (platform === "instagram" && format === "carousel") {
    // Portrait uses more of the feed than a square and is the standard for a carousel.
    return { ...PORTRAIT, safe: FEED_SAFE };
  }
  return { ...SQUARE, safe: FEED_SAFE };
}

/** The area composition is allowed to draw text into. */
export function contentBox(canvas: Canvas) {
  return {
    x: canvas.safe.left,
    y: canvas.safe.top,
    width: canvas.width - canvas.safe.left - canvas.safe.right,
    height: canvas.height - canvas.safe.top - canvas.safe.bottom,
  };
}

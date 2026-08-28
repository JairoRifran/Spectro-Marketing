// Deterministic text measurement and wrapping.
//
// Real metrics need the font file, which the server does not have and the browser will not
// agree with anyway. So width is estimated from character class: an `i` is not an `m`, and
// treating them the same is what makes naive wrapping break on the words that matter.
//
// The estimate is intentionally slightly generous, because the failure modes are not
// symmetrical: wrapping one word early costs a line, wrapping one word late puts a headline
// outside the frame. Every function here is pure, so a composition always lays out the same.

const NARROW = new Set("iljItf!.,;:'\"|()[]{}/\\ ");
const WIDE = new Set("mwMWQ@%—…");

/** Advance width as a multiple of font size, by character class. */
function advance(character: string) {
  if (NARROW.has(character)) return 0.31;
  if (WIDE.has(character)) return 0.86;
  if (character >= "A" && character <= "Z") return 0.68;
  if (character >= "0" && character <= "9") return 0.58;
  return 0.54;
}

export function measure(text: string, size: number, letterSpacing = 0) {
  let width = 0;
  for (const character of text) width += advance(character) * size + letterSpacing;
  return width;
}

/**
 * Greedy word wrap. A single word longer than the line is broken rather than allowed to
 * overflow, because an overflowing word is invisible damage: it renders past the frame edge
 * and nothing in the pipeline notices.
 */
export function wrap(text: string, maxWidth: number, size: number, letterSpacing = 0): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  const pushBrokenWord = (word: string) => {
    let chunk = "";
    for (const character of word) {
      if (chunk && measure(chunk + character, size, letterSpacing) > maxWidth) {
        lines.push(chunk);
        chunk = character;
      } else {
        chunk += character;
      }
    }
    current = chunk;
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate, size, letterSpacing) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (measure(word, size, letterSpacing) > maxWidth) {
      pushBrokenWord(word);
    } else {
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

/**
 * Wraps, then keeps only what fits in the given number of lines. Reports whether anything was
 * dropped so the caller can decide: a cover that silently loses its last clause is worse than
 * one that is known to be too long.
 */
export function wrapClamped(text: string, maxWidth: number, size: number, maxLines: number, letterSpacing = 0) {
  const lines = wrap(text, maxWidth, size, letterSpacing);
  if (lines.length <= maxLines) return { lines, truncated: false };
  const kept = lines.slice(0, maxLines);
  kept[kept.length - 1] = withEllipsis(kept[kept.length - 1], maxWidth, size, letterSpacing);
  return { lines: kept, truncated: true };
}

/**
 * Appends the ellipsis and then makes room for it.
 *
 * Wrapping measures the line, and the ellipsis is added afterwards — so a line that exactly
 * filled the width becomes one character too wide the moment it is marked as cut. Characters
 * come off the end until the whole thing, ellipsis included, fits.
 */
function withEllipsis(line: string, maxWidth: number, size: number, letterSpacing: number) {
  let body = line.replace(/[\s,.;:]+$/, "");
  while (body.length > 1 && measure(`${body}…`, size, letterSpacing) > maxWidth) {
    body = body.slice(0, -1).replace(/[\s,.;:]+$/, "");
  }
  return `${body}…`;
}

/**
 * The largest size from the candidates at which the text still fits the box. Composition uses
 * this instead of a fixed size so a short hook is not lost in a huge frame and a long one does
 * not have to be cut.
 */
export function fitSize(text: string, maxWidth: number, maxLines: number, candidates: number[], letterSpacing = 0) {
  for (const size of [...candidates].sort((a, b) => b - a)) {
    if (wrap(text, maxWidth, size, letterSpacing).length <= maxLines) return size;
  }
  return Math.min(...candidates);
}

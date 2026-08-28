import type { BrandIdentity } from "./identity";
import { SPECTRO_IDENTITY } from "./identity";
import { gradientVector, isGradient, type Fill, type FrameSpec } from "./spec";

// The server-side renderer: one frame spec to one SVG document.
//
// This is the path to a stored asset — the same string is what a rasteriser turns into a file.
// The browser renders the same spec as React elements instead, so provider-written text never
// has to be trusted inside markup there.
//
// Here it does end up inside markup, so every value that came from a model is escaped. The
// escaping is not defensive politeness: a headline containing `</text>` would otherwise close
// the element and inject whatever followed into the document.

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderFrameSvg(spec: FrameSpec, identity: BrandIdentity = SPECTRO_IDENTITY): string {
  const defs: string[] = [];
  let gradientCount = 0;

  /** Flat colours are used directly; gradients become a definition and a reference to it. */
  const paint = (fill: Fill): string => {
    if (!isGradient(fill)) return escapeXml(fill);
    const id = `g${gradientCount++}`;
    const { x1, y1, x2, y2 } = gradientVector(fill.angle);
    defs.push(
      `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
        `<stop offset="0" stop-color="${escapeXml(fill.from)}"/>` +
        `<stop offset="1" stop-color="${escapeXml(fill.to)}"/>` +
        `</linearGradient>`,
    );
    return `url(#${id})`;
  };

  const parts: string[] = [];
  parts.push(`<rect width="${spec.width}" height="${spec.height}" fill="${paint(spec.background)}"/>`);

  for (const block of spec.blocks) {
    if (block.kind === "rect") {
      parts.push(
        `<rect x="${block.x}" y="${block.y}" width="${block.width}" height="${block.height}" rx="${block.radius}" fill="${paint(block.fill)}" opacity="${block.opacity}"/>`,
      );
      continue;
    }
    if (block.kind === "ellipse") {
      parts.push(
        `<ellipse cx="${block.cx}" cy="${block.cy}" rx="${block.rx}" ry="${block.ry}" fill="${paint(block.fill)}" opacity="${block.opacity}"/>`,
      );
      continue;
    }
    const anchor = block.align === "center" ? "middle" : "start";
    const rows = block.lines
      .map((line, index) => `<tspan x="${block.x}" y="${block.y + index * block.lineHeight}">${escapeXml(line)}</tspan>`)
      .join("");
    parts.push(
      `<text font-family="${escapeXml(identity.fontFamily)}" font-size="${block.size}" font-weight="${block.weight}" fill="${escapeXml(block.fill)}" opacity="${block.opacity}" text-anchor="${anchor}" letter-spacing="${block.letterSpacing}">${rows}</text>`,
    );
  }

  const definitions = defs.length > 0 ? `<defs>${defs.join("")}</defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}" role="img" aria-label="${escapeXml(spec.label)}">${definitions}${parts.join("")}</svg>`;
}

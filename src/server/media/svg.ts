import type { BrandIdentity } from "./identity";
import { SPECTRO_IDENTITY } from "./identity";
import type { FrameSpec } from "./spec";

// The server-side renderer: one frame spec to one SVG document.
//
// This is the path to a real asset — the same string is what a rasteriser turns into the PNG
// that gets stored and exported. The browser renders the same spec as React elements instead,
// so provider-written text never has to be trusted inside markup there.
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
  const parts: string[] = [];
  parts.push(`<rect width="${spec.width}" height="${spec.height}" fill="${escapeXml(spec.background)}"/>`);

  for (const block of spec.blocks) {
    if (block.kind === "rect") {
      parts.push(
        `<rect x="${block.x}" y="${block.y}" width="${block.width}" height="${block.height}" rx="${block.radius}" fill="${escapeXml(block.fill)}" opacity="${block.opacity}"/>`,
      );
      continue;
    }
    const anchor = block.align === "center" ? "middle" : "start";
    const rows = block.lines
      .map((line, index) => {
        const text = line;
        const y = block.y + index * block.lineHeight;
        return `<tspan x="${block.x}" y="${y}">${escapeXml(text)}</tspan>`;
      })
      .join("");
    parts.push(
      `<text font-family="${escapeXml(identity.fontFamily)}" font-size="${block.size}" font-weight="${block.weight}" fill="${escapeXml(block.fill)}" text-anchor="${anchor}" letter-spacing="${block.letterSpacing}">${rows}</text>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}" role="img" aria-label="${escapeXml(spec.label)}">${parts.join("")}</svg>`;
}
